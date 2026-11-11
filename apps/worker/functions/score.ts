import { inngest } from "../inngest";
import { db, eq, and, ne, sql, desc, asc, lte } from "@deepmint/db";
import {
  entities,
  instruments,
  outcomes,
  scores,
  claims,
  marketRegimes,
} from "@deepmint/db/schema";
import {
  hitRate,
  avgReturnBps,
  zTestSignificance,
  brierScore,
  targetPrecision,
  targetCoverage,
  dailyBookReturns,
  playerRiskMetrics,
  computeOverallEIV,
  computeRegimeAwareEIV,
  buildRegimeHistory,
  regimeOnDate,
  markoutWindow,
  outcomesWithPosition,
} from "@deepmint/scoring";
import type { MarketRegime, MarkoutBar } from "@deepmint/scoring";
import { MIN_RANKED_OUTCOMES, getHistoricalPrices } from "@deepmint/shared";
import { ensureRegimeSnapshot } from "./regime-snapshot";
import { createNotification } from "@deepmint/db/queries/createNotification";

/** scores.value is numeric(18,6), which holds less than 10^12. */
const MAX_SCORE_VALUE = 999_999_999_999;

/**
 * Scoring worker: triggered by markouts/completed event.
 * Computes entity scores and upserts into the scores table.
 *
 * Polygon calls run 12.5 s apart and a step has 300 s (maxDuration on
 * /api/inngest), so each kind of work is its own step: the regime lookup takes
 * up to 163 s, and each instrument's bars one call. The scoring step itself
 * makes no Polygon call.
 */
export const scoreFunction = inngest.createFunction(
  {
    id: "entity-scoring",
    retries: 2,
    // One run at a time: two runs replacing the same day's scores would
    // otherwise interleave their deletes and inserts.
    concurrency: { limit: 1 },
    triggers: [{ event: "markouts/completed" }],
  },
  async ({ step }) => {
    // Fixed once per run: a replay must see the same day, and so the same book.
    const { today, asOf, barRanges } = await step.run("plan-bars", async () => {
      const positions = await db
        .select({
          ticker: instruments.ticker,
          direction: claims.direction,
          horizonDays: claims.horizonDays,
          entryPriceCents: claims.entryPriceCents,
          targetPriceCents: claims.targetPriceCents,
          createdAt: claims.createdAt,
        })
        .from(outcomes)
        .innerJoin(claims, eq(outcomes.claimId, claims.id))
        .innerJoin(entities, eq(claims.entityId, entities.id))
        .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
        .where(
          and(
            eq(claims.status, "active"),
            eq(entities.type, "player"),
            ne(claims.direction, "neutral"),
          ),
        );

      // One range per instrument, wide enough for every position in it.
      const ranges = new Map<string, { from: string; to: string }>();
      for (const position of positions) {
        const { from, to } = markoutWindow(position);
        const range = ranges.get(position.ticker);
        ranges.set(position.ticker, {
          from: range && range.from < from ? range.from : from,
          to: range && range.to > to ? range.to : to,
        });
      }

      const now = new Date();
      return {
        today: now.toISOString().slice(0, 10),
        asOf: now.toISOString(),
        barRanges: [...ranges].map(([ticker, range]) => ({ ticker, ...range })),
      };
    });

    // The day's market-regime snapshot, computed and stored if this run is
    // the first to need it (the market-regime-snapshot cron also writes it).
    // If it cannot be computed, the latest stored one stands in, and with none
    // stored the run writes no regime EIV: a made-up default would label "Best
    // in Current Conditions" with a regime no snapshot ever recorded.
    const currentRegime = await step.run("regime", async (): Promise<MarketRegime | null> => {
      try {
        const snapshot = await ensureRegimeSnapshot(today);
        console.log(`[scoring] Regime: ${snapshot.regime}`, snapshot);
        return snapshot.regime as MarketRegime;
      } catch (err) {
        const [latest] = await db
          .select({ asOfDate: marketRegimes.asOfDate, regime: marketRegimes.regime })
          .from(marketRegimes)
          .where(lte(marketRegimes.asOfDate, today))
          .orderBy(desc(marketRegimes.asOfDate))
          .limit(1);
        console.warn(
          `[scoring] No regime for ${today}; using ${latest ? `${latest.regime} from ${latest.asOfDate}` : "none"}:`,
          err,
        );
        return (latest?.regime as MarketRegime | undefined) ?? null;
      }
    });

    // Daily bars for Players' books. Polygon's throttle is per process and each
    // step may land on a new one, so the wait is a step too. A ticker that
    // cannot be priced is left out of barsByTicker, not retried for ever.
    const barsByTicker: Record<string, MarkoutBar[]> = {};
    for (const { ticker, from, to } of barRanges) {
      await step.sleep(`bars-wait-${ticker}`, "13s");
      const bars = await step
        .run(`bars-${ticker}`, async () => {
          const daily = await getHistoricalPrices(ticker, from, to);
          return daily.map(({ date, highCents, lowCents, closeCents }) => ({
            date,
            highCents,
            lowCents,
            closeCents,
          }));
        })
        .catch((err: unknown) => {
          console.error(
            `[scoring] No bars for ${ticker}:`,
            err instanceof Error ? err.message : err,
          );
          return [];
        });
      if (bars.length > 0) barsByTicker[ticker] = bars;
    }

    const result = await step.run("compute-scores", async () => {
      // Every entity; those with no outcome on an active claim are skipped below.
      const entityRows = await db
        .select({
          id: entities.id,
          type: entities.type,
        })
        .from(entities);

      // Each outcome counts in the regime of the latest snapshot on or before
      // its entry date (D6). The tag lives only in this run: outcomes are
      // append-only, and a stored tag would also go stale if a snapshot were
      // ever corrected.
      const regimeDays = await db
        .select({ asOfDate: marketRegimes.asOfDate, regime: marketRegimes.regime })
        .from(marketRegimes)
        .orderBy(asc(marketRegimes.asOfDate));

      let scored = 0;
      let skipped = 0;

      for (const entity of entityRows) {
        // Get all outcomes for this entity's ACTIVE claims. A claim held for
        // review or rejected must never count toward a published score, even
        // if an outcome was written for it.
        const entityOutcomes = await db
          .select({
            claimId: outcomes.claimId,
            direction: claims.direction,
            returnBps: outcomes.returnBps,
            directionCorrect: outcomes.directionCorrect,
            targetHit: outcomes.targetHit,
            entryPriceCents: outcomes.entryPriceCents,
            exitPriceCents: outcomes.exitPriceCents,
            horizon: outcomes.horizon,
            ticker: instruments.ticker,
            horizonDays: claims.horizonDays,
            claimEntryPriceCents: claims.entryPriceCents,
            targetPriceCents: claims.targetPriceCents,
            createdAt: claims.createdAt,
          })
          .from(outcomes)
          .innerJoin(claims, eq(outcomes.claimId, claims.id))
          .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
          .where(and(eq(claims.entityId, entity.id), eq(claims.status, "active")))
          // A fixed order (exit, then claim id), so two runs add up alike.
          .orderBy(
            sql`${claims.createdAt} + ${claims.horizonDays} * interval '1 day'`,
            outcomes.claimId,
          );

        if (entityOutcomes.length === 0) {
          skipped++;
          continue;
        }

        // Neutral claims count toward hit rate only. An entity with no other
        // outcomes has no return record, so it gets no return metrics at all:
        // a written 0 would rank it above anyone who lost money.
        const positionOutcomes = outcomesWithPosition(entityOutcomes);

        // Get claim confidences for Brier score
        const entityClaims = await db
          .select({
            id: claims.id,
            confidence: claims.confidence,
            targetPriceCents: claims.targetPriceCents,
            entryPriceCents: claims.entryPriceCents,
          })
          .from(claims)
          .where(eq(claims.entityId, entity.id));

        const claimMap = new Map(entityClaims.map((c) => [c.id, c]));

        const scoresToInsert: {
          entityId: string;
          metric: string;
          value: string;
          horizon: string | null;
          regimeTag: string | null;
          asOfDate: string;
        }[] = [];

        const addScore = (
          metric: string,
          value: number,
          horizon: string | null = "all",
          regimeTag: string | null = null
        ) => {
          // Refuse non-finite values. NaN.toFixed(6) is the STRING "NaN",
          // which PostgreSQL's numeric type accepts — and per its documented
          // ordering NaN compares GREATER THAN all other numerics, so a single
          // degenerate entity would take rank #1 on every ORDER BY value DESC
          // in the codebase. Dropping the row leaves the entity unranked for
          // that metric, which is the honest outcome. So is a value too big
          // for the column: annualising a book of two sessions can reach 10^12,
          // and one failed insert would stop the run for every entity.
          if (!Number.isFinite(value) || Math.abs(value) > MAX_SCORE_VALUE) {
            console.warn(
              `[scoring] Skipping unstorable ${metric} for entity ${entity.id}: ${value}`,
            );
            return;
          }
          scoresToInsert.push({
            entityId: entity.id,
            metric,
            value: value.toFixed(6),
            horizon,
            regimeTag,
            asOfDate: today,
          });
        };

        // This entity's record in each regime that has enough outcomes. Only
        // Guides are Brier-scored, so a Player's confidence is left out.
        const regimeHistory = buildRegimeHistory(
          entityOutcomes.map((o) => ({
            regime: regimeOnDate(
              regimeDays,
              markoutWindow({
                direction: o.direction,
                horizonDays: o.horizonDays,
                entryPriceCents: o.claimEntryPriceCents,
                targetPriceCents: o.targetPriceCents,
                createdAt: o.createdAt,
              }).from,
            ),
            direction: o.direction,
            directionCorrect: o.directionCorrect,
            returnBps: o.returnBps,
            confidence:
              entity.type === "guide"
                ? (claimMap.get(o.claimId)?.confidence ?? null)
                : null,
          })),
        );
        // EIV in the current regime, written only when the entity has enough
        // outcomes entered in it, with that sample beside it.
        const addRegimeEIV = () => {
          if (!currentRegime) return;
          const eiv = computeRegimeAwareEIV(regimeHistory, currentRegime);
          const record = regimeHistory.find((r) => r.regime === currentRegime);
          if (eiv === null || !record) return;
          addScore("eiv", eiv, "all", currentRegime);
          addScore("regime_outcome_count", record.sampleSize, "all", currentRegime);
        };

        const byHorizon = new Map<string, typeof entityOutcomes>();
        for (const o of entityOutcomes) {
          const h = o.horizon;
          if (!byHorizon.has(h)) byHorizon.set(h, []);
          byHorizon.get(h)!.push(o);
        }

        // What the boards rank on: the sample behind every score, pooled and
        // per horizon, and whether the hit rate clears the z-test.
        const zTest = zTestSignificance(hitRate(entityOutcomes), entityOutcomes.length);
        addScore("outcome_count", entityOutcomes.length);
        for (const [h, hOutcomes] of byHorizon) {
          addScore("outcome_count", hOutcomes.length, h);
        }
        addScore("position_count", positionOutcomes.length);
        addScore("z_significant", zTest.isSignificant ? 1 : 0);

        if (entity.type === "guide") {
          // Guide metrics
          const hr = hitRate(entityOutcomes);
          addScore("hit_rate", hr);
          if (positionOutcomes.length > 0) {
            addScore("avg_return_bps", avgReturnBps(positionOutcomes));
          }

          addScore("z_score", zTest.zScore);

          // Brier score (only for claims with confidence)
          const predictions = entityOutcomes
            .map((o) => {
              const claim = claimMap.get(o.claimId);
              return claim?.confidence != null
                ? { confidence: claim.confidence, correct: o.directionCorrect }
                : null;
            })
            .filter((p): p is NonNullable<typeof p> => p !== null);

          if (predictions.length > 0) {
            addScore("calibration_brier", brierScore(predictions));
          }

          // Target precision
          const targetsData = entityOutcomes
            .map((o) => {
              const claim = claimMap.get(o.claimId);
              return {
                targetPriceCents: claim?.targetPriceCents ?? null,
                exitPriceCents: o.exitPriceCents,
                entryPriceCents: o.entryPriceCents,
              };
            });
          // null means this Guide never published a usable price target, which
          // is NOT the same as publishing targets and missing them. Writing a
          // 0 here would make the two indistinguishable on a leaderboard, so
          // the metric is omitted entirely instead.
          const tp = targetPrecision(targetsData);
          if (tp !== null) addScore("target_precision", tp);
          addScore("target_coverage", targetCoverage(targetsData));

          // Hit rate by horizon
          for (const [h, hOutcomes] of byHorizon) {
            addScore(`hit_rate`, hitRate(hOutcomes), h);
          }

          // EIV
          addScore(
            "eiv_overall",
            computeOverallEIV({
              hitRate: hr,
              avgReturnBps: avgReturnBps(positionOutcomes),
              brierScore: predictions.length > 0 ? brierScore(predictions) : 0.5,
              totalClaims: entityOutcomes.length,
            }),
          );
          addRegimeEIV();
        } else if (entity.type === "player") {
          // Player risk metrics, from a daily mark-to-market book of the claims.
          // A book missing an instrument would misstate them, so without its
          // bars the Player has none this run: unranked is the honest outcome.
          const allPriced = positionOutcomes.every((o) => barsByTicker[o.ticker]);
          const book = allPriced
            ? dailyBookReturns(
                positionOutcomes.map((o) => ({
                  ticker: o.ticker,
                  direction: o.direction,
                  horizonDays: o.horizonDays,
                  entryPriceCents: o.claimEntryPriceCents,
                  targetPriceCents: o.targetPriceCents,
                  createdAt: o.createdAt,
                })),
                barsByTicker,
                new Date(asOf),
              )
            : [];

          if (book.length > 0) {
            const risk = playerRiskMetrics(book.map((day) => day.returnFrac));
            addScore("sharpe", risk.sharpe);
            addScore("max_drawdown", risk.maxDrawdown);
            addScore("calmar", risk.calmar);
            addScore("cvar5", risk.cvar5);
            addScore("consistency", risk.consistency);
          } else if (positionOutcomes.length > 0) {
            console.warn(`[scoring] No book for entity ${entity.id}: bars unavailable`);
          }
          if (positionOutcomes.length > 0) {
            addScore("avg_return_bps", avgReturnBps(positionOutcomes));
          }

          // Hit rate (also useful for players)
          addScore("hit_rate", hitRate(entityOutcomes));

          // EIV
          addScore(
            "eiv_overall",
            computeOverallEIV({
              hitRate: hitRate(entityOutcomes),
              avgReturnBps: avgReturnBps(positionOutcomes),
              brierScore: 0.5,
              totalClaims: entityOutcomes.length,
            }),
          );
          addRegimeEIV();
        }

        // Replace this entity's scores for the date in one transaction
        if (scoresToInsert.length > 0) {
          await db.transaction(async (tx) => {
            await tx
              .delete(scores)
              .where(
                sql`${scores.entityId} = ${entity.id} AND ${scores.asOfDate} = ${today}`
              );

            await tx.insert(scores).values(scoresToInsert);
          });
          scored++;
        }
      }

      console.log(
        `[scoring] Done: ${scored} entities scored, ${skipped} skipped`
      );

      // Rank change notifications: compare today's eiv_overall ranks against the
      // most recent PRIOR scoring date (not a literal 24h ago — scoring only
      // runs on weekdays with matured outcomes, so "yesterday" is frequently
      // absent and would silently suppress all notifications).
      try {
        const [prevDateRow] = await db
          .select({ asOfDate: scores.asOfDate })
          .from(scores)
          .where(sql`${scores.metric} = 'eiv_overall' AND ${scores.asOfDate} < ${today}`)
          .orderBy(desc(scores.asOfDate))
          .limit(1);

        const prevDate = prevDateRow?.asOfDate;

        // Ranks as the boards show them: only entities above the sample floor.
        const rankedOn = (date: string) =>
          db.select({ entityId: scores.entityId, value: scores.value })
            .from(scores)
            .where(sql`${scores.metric} = 'eiv_overall' AND ${scores.asOfDate} = ${date}
              AND ${scores.entityId} IN (
                SELECT s.entity_id FROM ${scores} s
                WHERE s.metric = 'outcome_count' AND s.horizon = 'all'
                  AND s.as_of_date = ${date} AND s.value >= ${MIN_RANKED_OUTCOMES}
              )`);

        const [todayScores, prevScores] = await Promise.all([
          rankedOn(today),
          prevDate ? rankedOn(prevDate) : Promise.resolve([]),
        ]);

        if (prevScores.length > 0 && todayScores.length > 0) {
          // Build rank maps (sorted descending by value)
          const buildRankMap = (rows: { entityId: string; value: string }[]) => {
            const sorted = [...rows].sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
            const map = new Map<string, number>();
            sorted.forEach((row, idx) => map.set(row.entityId, idx + 1));
            return map;
          };

          const prevRanks = buildRankMap(prevScores);
          const newRanks = buildRankMap(todayScores);

          for (const [entityId, newRank] of newRanks) {
            const prevRank = prevRanks.get(entityId);
            if (prevRank === undefined) continue; // New entrant, skip

            const movement = prevRank - newRank; // positive = improved
            if (Math.abs(movement) >= 3) {
              await createNotification({
                entityId,
                type: "rank_change",
                title: movement > 0
                  ? `Your rank improved to #${newRank} (+${movement} positions)`
                  : `Your rank dropped to #${newRank} (${movement} positions)`,
                metadata: { previousRank: prevRank, newRank, metric: "eiv_overall" },
              }).catch((err) => {
                console.warn(`[scoring] Failed to send rank change notification:`, err);
              });
            }
          }
        }
      } catch (err) {
        console.warn("[scoring] Rank change notification check failed:", err);
      }

      return { scored, skipped, regime: currentRegime };
    });

    // Trigger downstream workers
    await step.sendEvent("trigger-downstream", {
      name: "scoring/completed",
      data: {
        scored: result.scored,
        regime: result.regime,
        date: today,
      },
    });

    return result;
  }
);

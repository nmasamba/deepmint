import { inngest } from "../inngest";
import { db, eq, sql } from "@deepmint/db";
import { entities, outcomes, scores, claims } from "@deepmint/db/schema";
import {
  hitRate,
  avgReturnBps,
  zTestSignificance,
  brierScore,
  targetPrecision,
  sharpeRatio,
  maxDrawdown,
  consistencyScore,
  cvar5,
  detectRegime,
  computeRegimeAwareEIV,
} from "@deepmint/scoring";
import { getRegimeIndicators } from "@deepmint/shared";
import { createNotification } from "@deepmint/db/queries/createNotification";

/**
 * Scoring worker: triggered by markouts/completed event.
 * Computes entity scores and upserts into the scores table.
 */
export const scoreFunction = inngest.createFunction(
  {
    id: "entity-scoring",
    retries: 2,
    triggers: [{ event: "markouts/completed" }],
  },
  async ({ step }) => {
    const result = await step.run("compute-scores", async () => {
      const today = new Date().toISOString().slice(0, 10);

      // Detect current regime from live market data (VIX, S&P 500, sector ETFs)
      let currentRegime;
      try {
        const indicators = await getRegimeIndicators();
        currentRegime = detectRegime(indicators);
        console.log(`[scoring] Regime detected: ${currentRegime}`, indicators);
      } catch (err) {
        console.warn("[scoring] Failed to fetch live regime indicators, using defaults:", err);
        currentRegime = detectRegime({
          sp500Return30d: 0.01,
          vixLevel: 18,
          sectorDispersion: 0.08,
        });
      }

      // Get all entities that have outcomes
      const entityRows = await db
        .select({
          id: entities.id,
          type: entities.type,
          brokerLinkStatus: entities.brokerLinkStatus,
        })
        .from(entities);

      let scored = 0;
      let skipped = 0;

      for (const entity of entityRows) {
        // Get all outcomes for this entity
        const entityOutcomes = await db
          .select({
            claimId: outcomes.claimId,
            returnBps: outcomes.returnBps,
            directionCorrect: outcomes.directionCorrect,
            targetHit: outcomes.targetHit,
            entryPriceCents: outcomes.entryPriceCents,
            exitPriceCents: outcomes.exitPriceCents,
            horizon: outcomes.horizon,
          })
          .from(outcomes)
          .innerJoin(claims, eq(outcomes.claimId, claims.id))
          .where(eq(claims.entityId, entity.id));

        if (entityOutcomes.length === 0) {
          skipped++;
          continue;
        }

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
          scoresToInsert.push({
            entityId: entity.id,
            metric,
            value: value.toFixed(6),
            horizon,
            regimeTag,
            asOfDate: today,
          });
        };

        if (entity.type === "guide") {
          // Guide metrics
          const hr = hitRate(entityOutcomes);
          addScore("hit_rate", hr);
          addScore("avg_return_bps", avgReturnBps(entityOutcomes));

          const zTest = zTestSignificance(hr, entityOutcomes.length);
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
          addScore("target_precision", targetPrecision(targetsData));

          // Hit rate by horizon
          const byHorizon = new Map<string, typeof entityOutcomes>();
          for (const o of entityOutcomes) {
            const h = o.horizon;
            if (!byHorizon.has(h)) byHorizon.set(h, []);
            byHorizon.get(h)!.push(o);
          }
          for (const [h, hOutcomes] of byHorizon) {
            addScore(`hit_rate`, hitRate(hOutcomes), h);
          }

          // EIV
          const eiv = computeRegimeAwareEIV(
            {
              hitRate: hr,
              avgReturnBps: avgReturnBps(entityOutcomes),
              brierScore: predictions.length > 0 ? brierScore(predictions) : 0.5,
              totalClaims: entityOutcomes.length,
            },
            [], // No regime history yet
            currentRegime
          );
          addScore("eiv", eiv, "all", currentRegime);
          addScore("eiv_overall", eiv);
        } else if (entity.type === "player") {
          // Player metrics — computed from outcomes as daily returns
          const dailyReturns = entityOutcomes.map((o) => o.returnBps / 10000);

          addScore("sharpe", sharpeRatio(dailyReturns));

          // Build equity curve from cumulative returns
          const equityCurve = [1];
          for (const r of dailyReturns) {
            equityCurve.push(equityCurve[equityCurve.length - 1]! * (1 + r));
          }

          const md = maxDrawdown(equityCurve);
          addScore("max_drawdown", md);

          // Annualised return for Calmar
          const totalReturn = equityCurve[equityCurve.length - 1]! - 1;
          const annReturn = totalReturn * (252 / Math.max(dailyReturns.length, 1));
          addScore("calmar", md > 0 ? annReturn / md : 0);

          addScore("cvar5", cvar5(dailyReturns));
          addScore("consistency", consistencyScore(dailyReturns));

          // Hit rate (also useful for players)
          addScore("hit_rate", hitRate(entityOutcomes));
          addScore("avg_return_bps", avgReturnBps(entityOutcomes));

          // EIV
          const eiv = computeRegimeAwareEIV(
            {
              hitRate: hitRate(entityOutcomes),
              avgReturnBps: avgReturnBps(entityOutcomes),
              brierScore: 0.5,
              totalClaims: entityOutcomes.length,
            },
            [],
            currentRegime
          );
          addScore("eiv", eiv, "all", currentRegime);
          addScore("eiv_overall", eiv);
        }

        // Batch upsert scores (delete old + insert new for this entity+date)
        if (scoresToInsert.length > 0) {
          // Delete existing scores for this entity on this date
          await db
            .delete(scores)
            .where(
              sql`${scores.entityId} = ${entity.id} AND ${scores.asOfDate} = ${today}`
            );

          await db.insert(scores).values(scoresToInsert);
          scored++;
        }
      }

      console.log(
        `[scoring] Done: ${scored} entities scored, ${skipped} skipped`
      );

      // Rank change notifications: compare today's vs yesterday's eiv_overall ranks
      try {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        const [todayScores, yesterdayScores] = await Promise.all([
          db.select({ entityId: scores.entityId, value: scores.value })
            .from(scores)
            .where(sql`${scores.metric} = 'eiv_overall' AND ${scores.asOfDate} = ${today}`),
          db.select({ entityId: scores.entityId, value: scores.value })
            .from(scores)
            .where(sql`${scores.metric} = 'eiv_overall' AND ${scores.asOfDate} = ${yesterday}`),
        ]);

        if (yesterdayScores.length > 0 && todayScores.length > 0) {
          // Build rank maps (sorted descending by value)
          const buildRankMap = (rows: { entityId: string; value: string }[]) => {
            const sorted = [...rows].sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
            const map = new Map<string, number>();
            sorted.forEach((row, idx) => map.set(row.entityId, idx + 1));
            return map;
          };

          const prevRanks = buildRankMap(yesterdayScores);
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
        date: new Date().toISOString().slice(0, 10),
      },
    });

    return result;
  }
);

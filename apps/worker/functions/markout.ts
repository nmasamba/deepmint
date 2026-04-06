import { inngest } from "../inngest";
import { db, eq, and, isNull, lte, sql } from "@deepmint/db";
import { claims, outcomes, instruments } from "@deepmint/db/schema";
import { getEODPrice, getHistoricalPrices } from "@deepmint/shared";

/**
 * Horizon days → horizon enum value mapping
 */
const HORIZON_MAP: Record<number, "1d" | "1w" | "1m" | "3m" | "6m" | "1y"> = {
  1: "1d",
  7: "1w",
  30: "1m",
  90: "3m",
  180: "6m",
  365: "1y",
};

/**
 * Check if a date falls on a weekend (Saturday=6, Sunday=0).
 */
function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Get the next trading day (skip weekends). Does not account for holidays
 * — missing price data is handled by retry logic.
 */
function nextTradingDay(d: Date): Date {
  const result = new Date(d);
  while (isWeekend(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
  }
  return result;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Markout worker: runs at 17:00 ET / 21:00 UTC on weekdays.
 * Finds claims whose horizon has expired and computes exit prices + outcomes.
 */
export const markoutFunction = inngest.createFunction(
  {
    id: "markout-computation",
    retries: 2,
    triggers: [{ cron: "0 21 * * 1-5" }],
  },
  async ({ step }) => {
    const result = await step.run("compute-markouts", async () => {
      const today = new Date();
      const todayStr = formatDate(today);

      // Find active claims where createdAt + horizonDays <= today
      // and no outcome exists for that claim+horizon combo
      const pendingClaims = await db
        .select({
          id: claims.id,
          instrumentId: claims.instrumentId,
          direction: claims.direction,
          horizonDays: claims.horizonDays,
          entryPriceCents: claims.entryPriceCents,
          targetPriceCents: claims.targetPriceCents,
          confidence: claims.confidence,
          createdAt: claims.createdAt,
        })
        .from(claims)
        .where(
          and(
            eq(claims.status, "active"),
            // horizon has expired: createdAt + horizonDays <= now
            lte(
              sql`${claims.createdAt} + (${claims.horizonDays} || ' days')::interval`,
              today
            )
          )
        );

      // Filter out claims that already have outcomes
      const claimsToProcess = [];
      for (const claim of pendingClaims) {
        const horizon = HORIZON_MAP[claim.horizonDays];
        if (!horizon) continue;

        const [existing] = await db
          .select({ id: outcomes.id })
          .from(outcomes)
          .where(
            and(eq(outcomes.claimId, claim.id), eq(outcomes.horizon, horizon))
          )
          .limit(1);

        if (!existing) {
          claimsToProcess.push({ ...claim, horizon });
        }
      }

      if (claimsToProcess.length === 0) {
        console.log("[markout] No pending outcomes to compute.");
        return { computed: 0, skipped: 0, errors: 0 };
      }

      // Get instrument tickers for all claims
      const instrumentIds = [
        ...new Set(claimsToProcess.map((c) => c.instrumentId)),
      ];
      const instrumentRows = await db
        .select({ id: instruments.id, ticker: instruments.ticker })
        .from(instruments)
        .where(sql`${instruments.id} IN (${sql.join(instrumentIds.map(id => sql`${id}`), sql`, `)})`);

      const tickerMap = new Map(instrumentRows.map((i) => [i.id, i.ticker]));

      let computed = 0;
      let skipped = 0;
      let errors = 0;

      for (const claim of claimsToProcess) {
        try {
          const ticker = tickerMap.get(claim.instrumentId);
          if (!ticker) {
            skipped++;
            continue;
          }

          if (claim.entryPriceCents === null) {
            skipped++;
            continue;
          }

          // Calculate exit date
          const createdAt = new Date(claim.createdAt);
          const exitDate = new Date(createdAt);
          exitDate.setUTCDate(exitDate.getUTCDate() + claim.horizonDays);
          const tradingExitDate = nextTradingDay(exitDate);
          const exitDateStr = formatDate(tradingExitDate);

          // Get exit price
          let exitPriceCents: number;
          try {
            const eod = await getEODPrice(ticker, exitDateStr);
            exitPriceCents = eod.closeCents;
          } catch {
            // Price data missing — skip, will retry next day
            skipped++;
            continue;
          }

          // Compute return in basis points
          const returnBps = Math.round(
            ((exitPriceCents - claim.entryPriceCents) /
              claim.entryPriceCents) *
              10000
          );

          // Determine if direction was correct
          let directionCorrect: boolean;
          if (claim.direction === "long") {
            directionCorrect = returnBps > 0;
          } else if (claim.direction === "short") {
            directionCorrect = returnBps < 0;
          } else {
            // neutral: correct if within ±2% (200 bps)
            directionCorrect = Math.abs(returnBps) <= 200;
          }

          // Check target hit: did price reach target during the horizon window?
          let targetHit: boolean | null = null;
          if (claim.targetPriceCents !== null) {
            try {
              const bars = await getHistoricalPrices(
                ticker,
                formatDate(createdAt),
                exitDateStr
              );
              if (claim.direction === "long") {
                targetHit = bars.some(
                  (b) => b.highCents >= claim.targetPriceCents!
                );
              } else if (claim.direction === "short") {
                targetHit = bars.some(
                  (b) => b.lowCents <= claim.targetPriceCents!
                );
              } else {
                targetHit = null;
              }
            } catch {
              // If historical data unavailable, leave targetHit null
              targetHit = null;
            }
          }

          // Insert outcome
          await db.insert(outcomes).values({
            claimId: claim.id,
            instrumentId: claim.instrumentId,
            horizon: claim.horizon,
            entryPriceCents: claim.entryPriceCents,
            exitPriceCents,
            returnBps,
            directionCorrect,
            targetHit,
          });

          computed++;
        } catch (err) {
          console.error(`[markout] Error processing claim ${claim.id}:`, err);
          errors++;
        }
      }

      console.log(
        `[markout] Done: ${computed} computed, ${skipped} skipped, ${errors} errors`
      );

      return { computed, skipped, errors };
    });

    // Send event to trigger scoring
    if (result.computed > 0) {
      await step.sendEvent("trigger-scoring", {
        name: "markouts/completed",
        data: {
          computed: result.computed,
          date: formatDate(new Date()),
        },
      });
    }

    return result;
  }
);

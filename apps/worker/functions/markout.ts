import { inngest } from "../inngest";
import { db, eq, and, isNull, lte, sql } from "@deepmint/db";
import { claims, outcomes, instruments } from "@deepmint/db/schema";
import { createNotification } from "@deepmint/db/queries/createNotification";
import { computeMarkoutForClaim, HORIZON_MAP, formatDate } from "./markoutClaim";

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
      // Find active claims where createdAt + horizonDays <= now
      // and no outcome exists for that claim+horizon combo
      const pendingClaims = await db
        .select({
          id: claims.id,
          entityId: claims.entityId,
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
            // horizon has expired: createdAt + horizonDays <= now. Compare in
            // SQL (now()) rather than binding a JS Date — a Date param against a
            // raw SQL expression isn't type-mapped and breaks the pg serializer.
            sql`${claims.createdAt} + (${claims.horizonDays} || ' days')::interval <= now()`
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

          const outcome = await computeMarkoutForClaim(claim, ticker);
          if (!outcome) {
            // Missing entry price or exit-price data — skip, retry next run.
            skipped++;
            continue;
          }

          // Insert outcome
          await db.insert(outcomes).values({
            claimId: claim.id,
            instrumentId: claim.instrumentId,
            horizon: outcome.horizon,
            entryPriceCents: outcome.entryPriceCents,
            exitPriceCents: outcome.exitPriceCents,
            returnBps: outcome.returnBps,
            directionCorrect: outcome.directionCorrect,
            targetHit: outcome.targetHit,
          });

          // Notify entity that their claim has been resolved
          await createNotification({
            entityId: claim.entityId,
            type: "outcome_matured",
            title: `Your ${claim.direction} claim on ${ticker} has been resolved`,
            body: `Return: ${outcome.returnBps > 0 ? "+" : ""}${(outcome.returnBps / 100).toFixed(1)}% — ${outcome.directionCorrect ? "direction correct" : "direction incorrect"}`,
            metadata: { claimId: claim.id, returnBps: outcome.returnBps, directionCorrect: outcome.directionCorrect, targetHit: outcome.targetHit, ticker },
          }).catch((err) => {
            console.warn(`[markout] Failed to send notification for claim ${claim.id}:`, err);
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

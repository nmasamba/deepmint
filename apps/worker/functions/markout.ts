import { inngest } from "../inngest";
import { db, eq, and, asc, isNull, sql } from "@deepmint/db";
import { claims, outcomes, instruments, paperTrades } from "@deepmint/db/schema";
import { createNotification } from "@deepmint/db/queries/createNotification";
import { computeMarkoutForClaim, HORIZON_MAP, formatDate } from "./markoutClaim";

/**
 * Claims priced per run. Each is one step, and Inngest allows 1,000 steps per
 * run. The oldest go first; any left over are picked up by the next run.
 */
const MAX_CLAIMS_PER_RUN = 500;

/**
 * Markout worker: runs at 17:00 US Eastern on weekdays, after the day's bar is
 * final (16:30 ET).
 * Finds claims whose horizon has expired and computes exit prices + outcomes,
 * one step per claim, so a run's length is not bound by one invocation's limit.
 */
export const markoutFunction = inngest.createFunction(
  {
    id: "markout-computation",
    retries: 2,
    triggers: [{ cron: "TZ=America/New_York 0 17 * * 1-5" }],
  },
  async ({ step }) => {
    const dueClaims = await step.run("find-due-claims", async () => {
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
        )
        .orderBy(asc(claims.createdAt));

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
        return [];
      }

      if (claimsToProcess.length > MAX_CLAIMS_PER_RUN) {
        console.warn(
          `[markout] ${claimsToProcess.length} claims due; pricing the oldest ${MAX_CLAIMS_PER_RUN}, the rest next run`
        );
      }
      const batch = claimsToProcess.slice(0, MAX_CLAIMS_PER_RUN);

      // Get instrument tickers for all claims
      const instrumentIds = [...new Set(batch.map((c) => c.instrumentId))];
      const instrumentRows = await db
        .select({ id: instruments.id, ticker: instruments.ticker })
        .from(instruments)
        .where(sql`${instruments.id} IN (${sql.join(instrumentIds.map(id => sql`${id}`), sql`, `)})`);

      const tickerMap = new Map(instrumentRows.map((i) => [i.id, i.ticker]));

      return batch.map((claim) => ({
        ...claim,
        ticker: tickerMap.get(claim.instrumentId) ?? null,
      }));
    });

    let computed = 0;
    let skipped = 0;
    let errors = 0;

    for (const claim of dueClaims) {
      const status = await step.run(`markout-${claim.id}`, async () => {
        if (!claim.ticker) return "skipped";

        const outcome = await computeMarkoutForClaim(claim, claim.ticker);
        // Missing entry price or exit-price data — skip, retry next run.
        if (!outcome) return "skipped";

        // Insert outcome. A backfill run may have written it while this
        // one was pricing, so the unique (claim, horizon) key decides. Trades
        // mirroring the claim close with it, at its exit price.
        const inserted = await db.transaction(async (tx) => {
          const rows = await tx
            .insert(outcomes)
            .values({
              claimId: claim.id,
              instrumentId: claim.instrumentId,
              horizon: outcome.horizon,
              entryPriceCents: outcome.entryPriceCents,
              exitPriceCents: outcome.exitPriceCents,
              returnBps: outcome.returnBps,
              directionCorrect: outcome.directionCorrect,
              targetHit: outcome.targetHit,
            })
            .onConflictDoNothing({ target: [outcomes.claimId, outcomes.horizon] })
            .returning({ id: outcomes.id });
          if (rows.length > 0) {
            await tx
              .update(paperTrades)
              .set({ exitPriceCents: outcome.exitPriceCents, closedAt: new Date() })
              .where(and(eq(paperTrades.claimId, claim.id), isNull(paperTrades.closedAt)));
          }
          return rows;
        });
        if (inserted.length === 0) return "skipped";

        // Notify entity that their claim has been resolved
        await createNotification({
          entityId: claim.entityId,
          type: "outcome_matured",
          title: `Your ${claim.direction} claim on ${claim.ticker} has been resolved`,
          body: `Return: ${outcome.returnBps > 0 ? "+" : ""}${(outcome.returnBps / 100).toFixed(1)}% — ${outcome.directionCorrect ? "direction correct" : "direction incorrect"}`,
          metadata: { claimId: claim.id, returnBps: outcome.returnBps, directionCorrect: outcome.directionCorrect, targetHit: outcome.targetHit, ticker: claim.ticker },
        }).catch((err) => {
          console.warn(`[markout] Failed to send notification for claim ${claim.id}:`, err);
        });

        return "computed";
      }).catch((err: unknown) => {
        // Once the step's own retries are spent, leave the claim for the next
        // run rather than fail the rest of the batch.
        console.error(`[markout] Error processing claim ${claim.id}:`, err);
        return "error";
      });

      if (status === "computed") computed++;
      else if (status === "skipped") skipped++;
      else errors++;
    }

    console.log(
      `[markout] Done: ${computed} computed, ${skipped} skipped, ${errors} errors`
    );

    const result = { computed, skipped, errors };

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

import { inngest } from "../inngest";
import { db, eq, inArray } from "@deepmint/db";
import { instruments } from "@deepmint/db/schema";
import { getHistoricalPrices } from "@deepmint/shared";

/**
 * Backfill historical prices worker.
 *
 * Triggered by `instruments/batch-added` event when new instruments are added.
 * Validates that Polygon.io has historical data for each new ticker by fetching
 * the last 365 days of daily bars. If Polygon returns no data, the instrument
 * is deactivated and flagged for manual review.
 *
 * Deepmint does not persist a prices table — markouts fetch on demand — so
 * this worker primarily exists as a data-availability sanity check before the
 * consensus signal worker starts including the new instruments.
 */
export const backfillPricesFunction = inngest.createFunction(
  {
    id: "backfill-prices",
    retries: 2,
    triggers: [{ event: "instruments/batch-added" }],
  },
  async ({ event, step }) => {
    const instrumentIds: string[] =
      (event.data as { instrumentIds?: string[] })?.instrumentIds ?? [];

    if (instrumentIds.length === 0) {
      return { processed: 0, ok: 0, failed: 0 };
    }

    const targets = await step.run("load-instruments", async () => {
      return db
        .select({
          id: instruments.id,
          ticker: instruments.ticker,
        })
        .from(instruments)
        .where(inArray(instruments.id, instrumentIds));
    });

    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const from = oneYearAgo.toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);

    const failed: string[] = [];
    const ok: string[] = [];

    for (const instrument of targets) {
      const verified = await step.run(
        `verify-${instrument.ticker}`,
        async () => {
          try {
            const bars = await getHistoricalPrices(instrument.ticker, from, to);
            return bars.length > 0;
          } catch {
            return false;
          }
        },
      );

      if (verified) {
        ok.push(instrument.id);
      } else {
        failed.push(instrument.id);
      }
    }

    // Deactivate any instruments that have no price data available
    if (failed.length > 0) {
      await step.run("deactivate-failed", async () => {
        for (const id of failed) {
          await db
            .update(instruments)
            .set({ isActive: false })
            .where(eq(instruments.id, id));
        }
      });
    }

    return {
      processed: targets.length,
      ok: ok.length,
      failed: failed.length,
      failedIds: failed,
    };
  },
);

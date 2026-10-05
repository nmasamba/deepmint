import { inngest } from "../inngest";
import { db, eq, and } from "@deepmint/db";
import { events, claims, outcomes, instruments } from "@deepmint/db/schema";
import {
  computeContentHash,
  mentionsMag7,
  processExtraction,
  resolveOrCreateGuide,
} from "@deepmint/ingestion";
import { getEODPrice } from "@deepmint/shared";
import { computeMarkoutForClaim, formatDate } from "./markoutClaim";

/**
 * Shape of the `backfill/requested` event payload.
 *
 *   {
 *     analysts: [
 *       {
 *         handle: "stratechery",
 *         displayName: "Ben Thompson",
 *         sourceUrl: "https://stratechery.com/feed",
 *         styleTags: ["tech", "macro"],
 *         items: [
 *           { publishedAt: "2025-03-01T14:00:00Z", rawText: "...", url: "..." }
 *         ]
 *       }
 *     ]
 *   }
 */
interface BackfillItem {
  publishedAt: string;
  rawText: string;
  url?: string;
}
interface BackfillAnalyst {
  handle: string;
  displayName?: string;
  sourceUrl?: string;
  styleTags?: string[];
  items: BackfillItem[];
}
interface BackfillEventData {
  analysts: BackfillAnalyst[];
}

/**
 * Historical backfill worker (event-triggered, one-shot — NOT a cron).
 *
 * Seeds the data flywheel from an archive of known analysts: resolves each to a
 * Guide entity, inserts events with their TRUE historical capturedAt + content
 * hash (deduped), extracts claims with the historical createdAt and the EOD
 * entry price AS OF that date, then matures those claims immediately against
 * historical prices so the Guide arrives with a real, audited track record.
 *
 * Invariants preserved: events/claims are inserted once (append-only, never
 * UPDATEd) with explicit historical timestamps; outcomes are deduped on
 * (claimId, horizon). No resolution notifications are sent for backfill.
 * Only `active` claims are matured; claims held for review score only once
 * approved, via the daily markout.
 */
export const backfillFunction = inngest.createFunction(
  {
    id: "historical-backfill",
    retries: 2,
    triggers: [{ event: "backfill/requested" }],
  },
  async ({ event, step }) => {
    const { analysts } = event.data as BackfillEventData;

    let eventsInserted = 0;
    let claimsInserted = 0;
    let claimsPending = 0;
    let outcomesInserted = 0;
    const newClaimIds: string[] = [];
    const failedEventIds: string[] = [];

    for (const analyst of analysts ?? []) {
      const entityId = await step.run(`resolve-${analyst.handle}`, () =>
        resolveOrCreateGuide({
          handle: analyst.handle,
          displayName: analyst.displayName,
          sourceUrl: analyst.sourceUrl,
          styleTags: analyst.styleTags,
          allowlisted: false,
        }),
      );

      for (const item of analyst.items ?? []) {
        const publishedAt = new Date(item.publishedAt);

        // Insert the event in its own step, so that when extraction throws and
        // Inngest retries, only the extraction re-runs. In one step, the retry
        // found the event it had just inserted and returned early, losing the
        // post's claims for good.
        // (A new step ID: a run in flight at deploy must not replay the old
        // step's memoised result, which had a different shape.)
        const ingested = await step.run(
          `ingest-event-${entityId}-${item.url ?? item.publishedAt}`,
          async () => {
            const sourceUrl = item.url ?? analyst.sourceUrl ?? analyst.handle;
            const contentHash = computeContentHash(
              sourceUrl,
              item.rawText,
              publishedAt,
            );

            const [existing] = await db
              .select({ id: events.id })
              .from(events)
              .where(eq(events.contentHash, contentHash))
              .limit(1);
            if (existing) return { inserted: false, eventId: existing.id };

            const [ev] = await db
              .insert(events)
              .values({
                entityId,
                sourceUrl,
                rawText: item.rawText,
                contentHash,
                snapshotPath: null,
                capturedAt: publishedAt,
              })
              .returning({ id: events.id });
            return { inserted: true, eventId: ev!.id };
          },
        );
        if (!ingested.inserted) continue;
        eventsInserted += 1;
        // Text naming no Mag-7 instrument cannot yield a claim; skipping it
        // keeps the run well under Inngest's per-run step limit.
        if (!mentionsMag7(item.rawText)) continue;

        // processExtraction skips an event that already has claims, so a
        // retry cannot duplicate them. Once the step's own retries are spent,
        // skip the post rather than fail the rest of the backfill.
        const extracted = await step.run(
          `extract-${ingested.eventId}`,
          async () => {
            await processExtraction(ingested.eventId, item.rawText, entityId, {
              // Historical archive of a Guide's own published views — the
              // resolved entity IS the author, so attribution is inherent.
              sourceKind: "analyst_feed",
              createdAt: publishedAt,
              entryPriceResolver: async (ticker) => {
                try {
                  const eod = await getEODPrice(ticker, formatDate(publishedAt));
                  return eod.closeCents;
                } catch {
                  return null;
                }
              },
            });

            // Only active claims may be matured and scored here. A claim held
            // for review must not earn an outcome before anyone approves it.
            // Counted from the table, so a retry after a partial run is exact.
            const rows = await db
              .select({ id: claims.id, status: claims.status })
              .from(claims)
              .where(eq(claims.eventId, ingested.eventId));
            return {
              claimIds: rows.filter((c) => c.status === "active").map((c) => c.id),
              pending: rows.filter((c) => c.status === "pending_review").length,
            };
          },
        ).catch((err: unknown) => {
          console.error(
            `[backfill] Extraction failed for event ${ingested.eventId}:`,
            err instanceof Error ? err.message : err,
          );
          return null;
        });
        if (!extracted) {
          failedEventIds.push(ingested.eventId);
          continue;
        }

        claimsInserted += extracted.claimIds.length;
        claimsPending += extracted.pending;
        newClaimIds.push(...extracted.claimIds);
      }
    }

    // Mature the backfilled claims immediately against historical prices.
    for (const claimId of newClaimIds) {
      const made = await step.run(`markout-${claimId}`, async () => {
        const [row] = await db
          .select({
            id: claims.id,
            direction: claims.direction,
            horizonDays: claims.horizonDays,
            entryPriceCents: claims.entryPriceCents,
            targetPriceCents: claims.targetPriceCents,
            createdAt: claims.createdAt,
            instrumentId: claims.instrumentId,
            ticker: instruments.ticker,
          })
          .from(claims)
          .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
          .where(eq(claims.id, claimId))
          .limit(1);
        if (!row) return 0;

        const outcome = await computeMarkoutForClaim(row, row.ticker);
        if (!outcome) return 0;

        const [exists] = await db
          .select({ id: outcomes.id })
          .from(outcomes)
          .where(
            and(
              eq(outcomes.claimId, claimId),
              eq(outcomes.horizon, outcome.horizon),
            ),
          )
          .limit(1);
        if (exists) return 0;

        await db.insert(outcomes).values({
          claimId,
          instrumentId: row.instrumentId,
          horizon: outcome.horizon,
          entryPriceCents: outcome.entryPriceCents,
          exitPriceCents: outcome.exitPriceCents,
          returnBps: outcome.returnBps,
          directionCorrect: outcome.directionCorrect,
          targetHit: outcome.targetHit,
        });
        return 1;
      });
      outcomesInserted += made;
    }

    // Trigger scoring so the backfilled track records surface immediately.
    if (outcomesInserted > 0) {
      await step.sendEvent("trigger-scoring", {
        name: "markouts/completed",
        data: {
          computed: outcomesInserted,
          date: new Date().toISOString().slice(0, 10),
        },
      });
    }

    console.log(
      `[backfill] ${eventsInserted} events, ${claimsInserted} active claims, ` +
        `${claimsPending} pending review, ${outcomesInserted} outcomes, ` +
        `${failedEventIds.length} extraction failures`,
    );
    return {
      eventsInserted,
      claimsInserted,
      claimsPending,
      outcomesInserted,
      failedEventIds,
    };
  },
);

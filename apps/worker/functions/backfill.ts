import { inngest } from "../inngest";
import { db, eq, and } from "@deepmint/db";
import { events, claims, outcomes, instruments } from "@deepmint/db/schema";
import {
  computeContentHash,
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
    let outcomesInserted = 0;
    const newClaimIds: string[] = [];

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
        const result = await step.run(
          `ingest-${entityId}-${item.url ?? item.publishedAt}`,
          async () => {
            const publishedAt = new Date(item.publishedAt);
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
            if (existing) return { inserted: false, claimIds: [] as string[] };

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

            await processExtraction(ev!.id, item.rawText, entityId, {
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

            const inserted = await db
              .select({ id: claims.id })
              .from(claims)
              .where(eq(claims.eventId, ev!.id));
            return { inserted: true, claimIds: inserted.map((c) => c.id) };
          },
        );

        if (result.inserted) eventsInserted += 1;
        claimsInserted += result.claimIds.length;
        newClaimIds.push(...result.claimIds);
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
      `[backfill] ${eventsInserted} events, ${claimsInserted} claims, ${outcomesInserted} outcomes`,
    );
    return { eventsInserted, claimsInserted, outcomesInserted };
  },
);

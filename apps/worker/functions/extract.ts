import { inngest } from "../inngest";
import { db, eq, and } from "@deepmint/db";
import { claims, events } from "@deepmint/db/schema";
import { processExtraction } from "@deepmint/ingestion";

/**
 * Waits before each retry round. A step's own retries cover a blip; these
 * cover an LLM outage or exhausted credits, up to the next day's ingest.
 */
const RETRY_ROUND_DELAYS = ["1h", "4h", "16h"];

interface ClaimCreated {
  claimId: string;
  entityId: string;
  instrumentId: string;
  direction: "long" | "short" | "neutral";
  horizonDays: number;
  entryPriceCents: number | null;
}

/**
 * Extraction worker: triggered after ingestion completes.
 * Processes each new event through the LLM extraction pipeline, then retries
 * the events that failed, in up to three rounds with backoff. Each round
 * announces its active claims with claims/created, for mirrors, followers and
 * influence. A claim held for review is announced when it is approved.
 */
export const extractFunction = inngest.createFunction(
  {
    id: "extract-claims",
    retries: 2,
    triggers: [{ event: "ingestion/completed" }],
  },
  async ({ event, step }) => {
    const eventIds: string[] = (event.data as { eventIds: string[] }).eventIds;

    let totalInserted = 0;
    let totalPending = 0;
    let totalInvalid = 0;
    let totalDuplicates = 0;
    let totalSuperseded = 0;
    let failedEventIds: string[] = [];

    for (let round = 0; round <= RETRY_ROUND_DELAYS.length; round++) {
      const roundEventIds = round === 0 ? eventIds : failedEventIds;
      if (roundEventIds.length === 0) break;
      if (round > 0) {
        await step.sleep(`retry-wait-${round}`, RETRY_ROUND_DELAYS[round - 1]);
      }
      failedEventIds = [];
      const announced: ClaimCreated[] = [];

      for (const eventId of roundEventIds) {
        // Extraction throws on a truncated or unparseable model reply. Once the
        // step's own retries are spent, record the failure and move on, so one
        // bad post cannot stop the rest of the batch from being extracted.
        const result = await step.run(
          round === 0 ? `extract-${eventId}` : `extract-${eventId}-round-${round}`,
          async () => {
            const [eventRecord] = await db
              .select()
              .from(events)
              .where(eq(events.id, eventId))
              .limit(1);

            if (!eventRecord) {
              console.warn(`Event not found: ${eventId}`);
              return {
                inserted: 0,
                pending: 0,
                invalid: 0,
                duplicates: 0,
                superseded: 0,
                activeClaims: [] as ClaimCreated[],
              };
            }

            // A publisher means the text was carried by a third party (Wall
            // Street ratings lane), so the issuing firm must be recovered before
            // the claim can score. No publisher means a Guide's own feed: the
            // claim stays with the Guide, unless the post names a firm, when it
            // moves to the firm and waits for review.
            const sourceKind = eventRecord.publisher
              ? "wall_street_rating"
              : "analyst_feed";

            const extractionResult = await processExtraction(
              eventId,
              eventRecord.rawText,
              eventRecord.entityId,
              // Dated when the post was stored: a retry hours later must not
              // move the claim's entry to a later close. Markout prices it at
              // the first close after this date.
              { sourceKind, createdAt: eventRecord.createdAt },
            );

            console.log(
              `Extracted from event ${eventId} (${sourceKind}): ` +
              `${extractionResult.inserted} active, ` +
              `${extractionResult.pending} pending review, ` +
              `${extractionResult.invalid} invalid, ` +
              `${extractionResult.duplicates} duplicate, ` +
              `${extractionResult.superseded} pending copies superseded` +
              (extractionResult.model ? ` via ${extractionResult.model}` : ""),
            );

            // Read back rather than taken from the result, so a retry after the
            // claims were written still announces them.
            const activeClaims = await db
              .select({
                claimId: claims.id,
                entityId: claims.entityId,
                instrumentId: claims.instrumentId,
                direction: claims.direction,
                horizonDays: claims.horizonDays,
                entryPriceCents: claims.entryPriceCents,
              })
              .from(claims)
              .where(and(eq(claims.eventId, eventId), eq(claims.status, "active")));

            return { ...extractionResult, activeClaims };
          },
        ).catch((err: unknown) => {
          console.error(
            `Extraction failed for event ${eventId}:`,
            err instanceof Error ? err.message : err,
          );
          return null;
        });
        if (!result) {
          failedEventIds.push(eventId);
          continue;
        }

        totalInserted += result.inserted;
        totalPending += result.pending;
        totalInvalid += result.invalid;
        totalDuplicates += result.duplicates;
        totalSuperseded += result.superseded;
        // `?? []`: a run in flight at deploy replays results from before the field.
        announced.push(...(result.activeClaims ?? []));
      }

      // One step per round, not per post, to stay under the per-run step limit.
      // The id makes Inngest drop a repeat of the same claim for 24 hours.
      if (announced.length > 0) {
        await step.sendEvent(
          `claims-created-${round}`,
          announced.map((data) => ({
            id: `claims-created-${data.claimId}`,
            name: "claims/created",
            data,
          })),
        );
      }
    }

    return {
      eventsProcessed: eventIds.length,
      claimsInserted: totalInserted,
      claimsPendingReview: totalPending,
      invalidExtractions: totalInvalid,
      duplicatesSkipped: totalDuplicates,
      pendingCopiesSuperseded: totalSuperseded,
      failedEventIds,
    };
  },
);

import { inngest } from "../inngest";
import { db, eq } from "@deepmint/db";
import { events } from "@deepmint/db/schema";
import { processExtraction } from "@deepmint/ingestion";

/**
 * Extraction worker: triggered after ingestion completes.
 * Processes each new event through the LLM extraction pipeline.
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

    for (const eventId of eventIds) {
      const result = await step.run(
        `extract-${eventId}`,
        async () => {
          const [eventRecord] = await db
            .select()
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

          if (!eventRecord) {
            console.warn(`Event not found: ${eventId}`);
            return { inserted: 0, pending: 0, invalid: 0 };
          }

          const extractionResult = await processExtraction(
            eventId,
            eventRecord.rawText,
            eventRecord.entityId,
          );

          console.log(
            `Extracted from event ${eventId}: ` +
            `${extractionResult.inserted} active, ` +
            `${extractionResult.pending} pending review, ` +
            `${extractionResult.invalid} invalid`,
          );

          return extractionResult;
        },
      );

      totalInserted += result.inserted;
      totalPending += result.pending;
      totalInvalid += result.invalid;
    }

    return {
      eventsProcessed: eventIds.length,
      claimsInserted: totalInserted,
      claimsPendingReview: totalPending,
      invalidExtractions: totalInvalid,
    };
  },
);

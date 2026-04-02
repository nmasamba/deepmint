import { inngest } from "../inngest";
import { db, eq } from "@deepmint/db";
import { events } from "@deepmint/db/schema";
import {
  computeContentHash,
  DemoSourceAdapter,
  type SourceAdapter,
} from "@deepmint/ingestion";

/**
 * Get all registered source adapters.
 * For now, just the demo adapter. New sources will be added here.
 */
function getSourceAdapters(): SourceAdapter[] {
  return [new DemoSourceAdapter("demo-guide-id")];
}

/**
 * Ingestion worker: runs on weekdays at 16:30 ET (20:30 UTC).
 * Fetches content from all registered source adapters,
 * deduplicates by content hash, and stores new events.
 */
export const ingestFunction = inngest.createFunction(
  {
    id: "ingest-sources",
    retries: 3,
    triggers: [{ cron: "30 20 * * 1-5" }],
  },
  async ({ step }) => {
    const adapters = getSourceAdapters();
    const newEventIds: string[] = [];

    for (const adapter of adapters) {
      const captures = await step.run(
        `fetch-${adapter.name}`,
        async () => adapter.fetchLatest(),
      );

      for (const capture of captures) {
        const eventId = await step.run(
          `process-${adapter.name}-${capture.sourceUrl}`,
          async () => {
            // Inngest serializes step results to JSON, so Date becomes string
            const capturedAt = new Date(capture.capturedAt);

            const contentHash = computeContentHash(
              capture.sourceUrl,
              capture.rawText,
              capturedAt,
            );

            const [existing] = await db
              .select({ id: events.id })
              .from(events)
              .where(eq(events.contentHash, contentHash))
              .limit(1);

            if (existing) {
              console.log(`Duplicate event skipped: ${contentHash.slice(0, 12)}...`);
              return null;
            }

            const [newEvent] = await db
              .insert(events)
              .values({
                entityId: capture.entityId,
                sourceUrl: capture.sourceUrl,
                rawText: capture.rawText,
                contentHash,
                snapshotPath: null,
                capturedAt,
              })
              .returning({ id: events.id });

            console.log(`New event captured: ${newEvent.id} (${contentHash.slice(0, 12)}...)`);
            return newEvent.id;
          },
        );

        if (eventId) {
          newEventIds.push(eventId);
        }
      }
    }

    if (newEventIds.length > 0) {
      await step.sendEvent("trigger-extraction", {
        name: "ingestion/completed",
        data: { eventIds: newEventIds },
      });
    }

    return {
      newEvents: newEventIds.length,
      totalProcessed: adapters.length,
    };
  },
);

import { inngest } from "../inngest";
import { db, eq, and, isNotNull } from "@deepmint/db";
import { events, entities } from "@deepmint/db/schema";
import {
  computeContentHash,
  PolygonNewsSourceAdapter,
  RssSourceAdapter,
  type SourceAdapter,
} from "@deepmint/ingestion";

/**
 * Build the source adapters from allowlisted Guides that expose a public feed
 * URL (their RSS/Atom source). Falls back to the demo adapter (bound to a real
 * guide id) when no real sources are configured — local dev / fresh DB.
 */
async function getSourceAdapters(): Promise<SourceAdapter[]> {
  const allowlisted = await db
    .select({ id: entities.id, sourceUrl: entities.sourceUrl })
    .from(entities)
    .where(
      and(
        eq(entities.type, "guide"),
        eq(entities.isAllowlisted, true),
        isNotNull(entities.sourceUrl),
      ),
    );

  const feeds = allowlisted
    .filter((g): g is { id: string; sourceUrl: string } => !!g.sourceUrl)
    .map((g) => ({ feedUrl: g.sourceUrl, entityId: g.id }));

  const adapters: SourceAdapter[] = [];

  if (feeds.length > 0) {
    adapters.push(new RssSourceAdapter(feeds));
  }

  // Wall Street ratings lane. Explicit opt-in rather than keying off
  // POLYGON_API_KEY, which is already set for price lookups — otherwise merely
  // deploying would switch on a news lane that (measured against the current
  // plan) yields no attributable ratings, only review-queue noise.
  if (process.env.INGEST_POLYGON_NEWS === "1") {
    adapters.push(new PolygonNewsSourceAdapter());
  }

  // NOTE: deliberately NO demo/fallback adapter. Claims are APPEND-ONLY, so a
  // fabricated capture becomes an undeletable claim. An unconfigured
  // environment must produce a no-op run, never synthetic data.
  return adapters;
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
    const adapters = await getSourceAdapters();
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
                // Distinguishes the ingestion lane downstream: a publisher means
                // this text came from the Wall Street ratings lane (third-party
                // news), whereas null means a Guide's own feed.
                publisher: capture.publisher ?? null,
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

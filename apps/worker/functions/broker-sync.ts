import { inngest } from "../inngest";
import { db, eq, and } from "@deepmint/db";
import { brokerLinks } from "@deepmint/db/schema";
import { getSnapTradeClient } from "@deepmint/api/lib/snaptrade";
import { syncBrokerLink } from "@deepmint/api/lib/brokerSync";

/**
 * Daily broker sync worker.
 *
 * Runs at 18:00 US Eastern on weekdays, after markout. For each active broker
 * link, imports recent trades from every account and settles the Verified
 * status (syncBrokerLink). Staggers requests to respect SnapTrade rate limits.
 */
export const brokerSyncFunction = inngest.createFunction(
  {
    id: "broker-sync",
    retries: 2,
    triggers: [{ cron: "TZ=America/New_York 0 18 * * 1-5" }],
  },
  async ({ step }) => {
    if (!getSnapTradeClient()) {
      return { synced: 0, skipped: 0, reason: "snaptrade-not-configured" };
    }

    const links = await step.run("load-active-links", async () => {
      return db
        .select()
        .from(brokerLinks)
        .where(
          and(
            eq(brokerLinks.provider, "snaptrade"),
            eq(brokerLinks.syncStatus, "active"),
          ),
        );
    });

    let totalSynced = 0;
    let errors = 0;

    for (const link of links) {
      const inserted = await step.run(
        `sync-${link.id}`,
        async () => (await syncBrokerLink(db, link))?.synced ?? 0,
      ).catch(() => {
        errors += 1;
        return 0;
      });

      totalSynced += inserted;

      // Stagger API calls to stay within SnapTrade rate limits
      await step.sleep("rate-limit", "1s");
    }

    return {
      linksProcessed: links.length,
      totalSynced,
      errors,
    };
  },
);

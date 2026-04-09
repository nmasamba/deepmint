import { inngest } from "../inngest";
import { db, eq, and } from "@deepmint/db";
import { brokerLinks, playerTrades, instruments } from "@deepmint/db/schema";
import {
  getSnapTradeClient,
  getAccountActivities,
  type SnapTradeUserCredentials,
} from "@deepmint/api/lib/snaptrade";

function extractCreds(meta: unknown): SnapTradeUserCredentials | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as { userId?: string; userSecret?: string };
  if (!m.userId || !m.userSecret) return null;
  return { userId: m.userId, userSecret: m.userSecret };
}

/**
 * Daily broker sync worker.
 *
 * Runs at 22:00 UTC on weekdays, after markout. For each active broker
 * link, fetches recent trade activity from SnapTrade and inserts new
 * verified player_trades rows. Staggers requests to respect SnapTrade
 * rate limits.
 */
export const brokerSyncFunction = inngest.createFunction(
  {
    id: "broker-sync",
    retries: 2,
    triggers: [{ cron: "0 22 * * 1-5" }],
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
      const creds = extractCreds(link.metadata);
      if (!creds || !link.providerAccountId) continue;

      const inserted = await step.run(
        `sync-${link.id}`,
        async () => {
          try {
            const sinceDate = link.lastSyncAt
              ? new Date(link.lastSyncAt)
              : (() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 7);
                  return d;
                })();

            const activities = await getAccountActivities(
              creds,
              link.providerAccountId,
              sinceDate,
            );

            let count = 0;
            for (const act of activities) {
              const [instrument] = await db
                .select({ id: instruments.id })
                .from(instruments)
                .where(eq(instruments.ticker, act.symbol.toUpperCase()))
                .limit(1);

              if (!instrument) continue;

              const side = act.action === "BUY" ? "buy" : "sell";

              await db.insert(playerTrades).values({
                entityId: link.entityId,
                instrumentId: instrument.id,
                side,
                entryPriceCents: Math.round(act.priceDollars * 100),
                quantity: act.quantity.toString(),
                openedAt: act.executedAt,
                isVerified: true,
              });
              count += 1;
            }

            await db
              .update(brokerLinks)
              .set({
                lastSyncAt: new Date(),
                syncErrorMessage: null,
              })
              .where(eq(brokerLinks.id, link.id));

            return count;
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            await db
              .update(brokerLinks)
              .set({
                syncStatus: "error",
                syncErrorMessage: message.slice(0, 500),
              })
              .where(eq(brokerLinks.id, link.id));
            throw err;
          }
        },
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

import { and, eq, ne } from "@deepmint/db";
import type { db as Db } from "@deepmint/db";
import {
  brokerLinks,
  entities,
  instruments,
  playerTrades,
} from "@deepmint/db/schema";
import {
  getAccountActivities,
  type SnapTradeUserCredentials,
} from "./snaptrade";

/** The fields of a broker_links row a sync needs. A worker step's copy has string dates. */
export interface LinkToSync {
  id: string;
  entityId: string;
  providerAccountId: string;
  isVerified: boolean | null;
  lastSyncAt: Date | string | null;
  metadata: unknown;
}

export function linkCredentials(
  metadata: unknown,
): SnapTradeUserCredentials | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as { userId?: string; userSecret?: string };
  if (!m.userId || !m.userSecret) return null;
  return { userId: m.userId, userSecret: m.userSecret };
}

/** Every account on a link: those completeLink stored, or else the one it names. */
export function linkAccountIds(
  link: Pick<LinkToSync, "providerAccountId" | "metadata">,
): string[] {
  const stored = (link.metadata as { accounts?: Array<{ id?: string }> } | null)
    ?.accounts;
  const ids = (stored ?? []).flatMap((account) => (account.id ? [account.id] : []));
  if (ids.length > 0) return ids;
  return link.providerAccountId ? [link.providerAccountId] : [];
}

/**
 * Import a link's trades from every account, and settle what the link earns
 * (D7): Verified takes at least one trade in a tracked instrument, and a failed
 * sync withdraws it. Both sync paths come through here, so they cannot disagree.
 *
 * Returns null for a link with no credentials or accounts. On failure the link
 * and the entity are marked and the error is rethrown, so a worker step retries;
 * a retry that succeeds restores them.
 */
export async function syncBrokerLink(
  db: typeof Db,
  link: LinkToSync,
  fetchActivities: typeof getAccountActivities = getAccountActivities,
): Promise<{ synced: number; verified: boolean } | null> {
  const credentials = linkCredentials(link.metadata);
  const accountIds = linkAccountIds(link);
  if (!credentials || accountIds.length === 0) return null;

  // Activity since the last sync. A new link has none, so the first sync reads
  // the default window and finds trades from before the link.
  const since = link.lastSyncAt ? new Date(link.lastSyncAt) : undefined;

  try {
    let inserted = 0;
    let trackedTrades = 0;

    for (const accountId of accountIds) {
      const activities = await fetchActivities(credentials, accountId, since);

      for (const act of activities) {
        const [instrument] = await db
          .select({ id: instruments.id })
          .from(instruments)
          .where(eq(instruments.ticker, act.symbol.toUpperCase()))
          .limit(1);

        if (!instrument) continue; // Skip trades on untracked instruments
        trackedTrades += 1;

        const side = act.action === "BUY" ? "buy" : "sell";
        const entryPriceCents = Math.round(act.priceDollars * 100);
        const quantity = act.quantity.toString();

        // Idempotency: SnapTrade returns overlapping date windows on each run,
        // so skip activities already imported (matched on the stable natural
        // key) to avoid duplicating verified trades.
        const [dup] = await db
          .select({ id: playerTrades.id })
          .from(playerTrades)
          .where(
            and(
              eq(playerTrades.entityId, link.entityId),
              eq(playerTrades.instrumentId, instrument.id),
              eq(playerTrades.side, side),
              eq(playerTrades.openedAt, act.executedAt),
              eq(playerTrades.entryPriceCents, entryPriceCents),
              eq(playerTrades.quantity, quantity),
            ),
          )
          .limit(1);
        if (dup) continue;

        await db.insert(playerTrades).values({
          entityId: link.entityId,
          instrumentId: instrument.id,
          side,
          entryPriceCents,
          quantity,
          openedAt: act.executedAt,
          isVerified: true,
        });
        inserted += 1;
      }
    }

    // Once earned it stays until a failure or a disconnect: a quiet day imports
    // nothing, and that withdraws nothing.
    const verified = link.isVerified === true || trackedTrades > 0;
    await settleLink(db, link, {
      link: {
        syncStatus: "active",
        syncErrorMessage: null,
        lastSyncAt: new Date(),
        isVerified: verified,
      },
      entityStatus: verified ? "verified" : "pending",
    });
    return { synced: inserted, verified };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await settleLink(db, link, {
      link: {
        syncStatus: "error",
        syncErrorMessage: message.slice(0, 500),
        isVerified: false,
      },
      entityStatus: "failed",
    });
    throw err;
  }
}

/** Write a sync's result, unless the user disconnected while it ran. */
async function settleLink(
  db: typeof Db,
  link: LinkToSync,
  result: {
    link: Partial<typeof brokerLinks.$inferInsert>;
    entityStatus: "verified" | "pending" | "failed";
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [stillLinked] = await tx
      .update(brokerLinks)
      .set(result.link)
      .where(
        and(
          eq(brokerLinks.id, link.id),
          ne(brokerLinks.syncStatus, "disconnected"),
        ),
      )
      .returning({ id: brokerLinks.id });
    if (!stillLinked) return;

    await tx
      .update(entities)
      .set({ brokerLinkStatus: result.entityStatus })
      .where(eq(entities.id, link.entityId));
  });
}

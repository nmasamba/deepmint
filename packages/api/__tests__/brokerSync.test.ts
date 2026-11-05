import { describe, it, expect } from "vitest";
import { db, eq } from "@deepmint/db";
import { brokerLinks, entities, playerTrades } from "@deepmint/db/schema";
import { linkAccountIds, linkCredentials, syncBrokerLink } from "../lib/brokerSync";
import type { SnapTradeActivity } from "../lib/snaptrade";

const META = { userId: "dm-x", userSecret: "secret" };

describe("linkCredentials", () => {
  it("reads the pair, and nothing without both", () => {
    expect(linkCredentials(META)).toEqual(META);
    expect(linkCredentials({ userId: "dm-x" })).toBeNull();
    expect(linkCredentials({})).toBeNull();
    expect(linkCredentials(null)).toBeNull();
  });
});

describe("linkAccountIds", () => {
  it("is every stored account", () => {
    expect(
      linkAccountIds({
        providerAccountId: "a",
        metadata: { accounts: [{ id: "a" }, { id: "b" }] },
      }),
    ).toEqual(["a", "b"]);
  });

  it("falls back to the named account on an older link", () => {
    expect(linkAccountIds({ providerAccountId: "a", metadata: META })).toEqual(["a"]);
  });

  it("is empty for a link with none", () => {
    expect(linkAccountIds({ providerAccountId: "", metadata: {} })).toEqual([]);
  });
});

const trade = (symbol: string, over: Partial<SnapTradeActivity> = {}): SnapTradeActivity => ({
  symbol,
  action: "BUY",
  quantity: 2,
  priceDollars: 100.5,
  executedAt: new Date("2026-10-20T15:00:00Z"),
  currency: "USD",
  ...over,
});

class Rollback extends Error {}

/**
 * Real database, stand-in SnapTrade: only the activity feed is faked, because
 * no sandbox keys exist yet. Each case rolls back.
 */
async function withLink(
  run: (tx: typeof db, link: typeof brokerLinks.$inferSelect) => Promise<void>,
  linkValues: Partial<typeof brokerLinks.$inferInsert> = {},
) {
  await db
    .transaction(async (tx) => {
      const handle = tx as unknown as typeof db;
      const slug = `zz-broker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const [entity] = await handle
        .insert(entities)
        .values({ type: "player", displayName: slug, slug, brokerLinkStatus: "pending" })
        .returning();
      const [link] = await handle
        .insert(brokerLinks)
        .values({
          entityId: entity!.id,
          provider: "snaptrade",
          providerAccountId: "a",
          syncStatus: "active",
          metadata: { ...META, accounts: [{ id: "a" }, { id: "b" }] },
          ...linkValues,
        })
        .returning();
      await run(handle, link!);
      throw new Rollback();
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

async function stateOf(tx: typeof db, link: typeof brokerLinks.$inferSelect) {
  const [row] = await tx.select().from(brokerLinks).where(eq(brokerLinks.id, link.id));
  const [entity] = await tx.select().from(entities).where(eq(entities.id, link.entityId));
  const trades = await tx
    .select({ id: playerTrades.id })
    .from(playerTrades)
    .where(eq(playerTrades.entityId, link.entityId));
  return { row: row!, status: entity!.brokerLinkStatus, trades: trades.length };
}

describe.skipIf(!process.env.DATABASE_URL)("syncBrokerLink (local DB)", () => {
  it("verifies on a tracked trade in any account, not just the first", async () => {
    await withLink(async (tx, link) => {
      const asked: string[] = [];
      const result = await syncBrokerLink(tx, link, async (_creds, accountId) => {
        asked.push(accountId);
        return accountId === "b" ? [trade("AAPL")] : [];
      });
      expect(asked).toEqual(["a", "b"]);
      expect(result).toEqual({ synced: 1, verified: true });
      const state = await stateOf(tx, link);
      expect(state.status).toBe("verified");
      expect(state.row.isVerified).toBe(true);
      expect(state.row.lastSyncAt).not.toBeNull();
      expect(state.trades).toBe(1);
    });
  });

  it("does not verify on an empty account or an untracked stock", async () => {
    await withLink(async (tx, link) => {
      const empty = await syncBrokerLink(tx, link, async () => []);
      expect(empty).toEqual({ synced: 0, verified: false });
      expect((await stateOf(tx, link)).status).toBe("pending");

      const untracked = await syncBrokerLink(tx, link, async () => [trade("ZZZZ")]);
      expect(untracked).toEqual({ synced: 0, verified: false });
      const state = await stateOf(tx, link);
      expect(state.status).toBe("pending");
      expect(state.row.isVerified).toBe(false);
      expect(state.trades).toBe(0);
    });
  });

  it("reads from the last sync, and back past the link on a first sync", async () => {
    await withLink(async (tx, link) => {
      const windows: Array<Date | undefined> = [];
      const fetcher = async (_c: unknown, _a: string, since?: Date) => {
        windows.push(since);
        return [];
      };
      await syncBrokerLink(tx, link, fetcher);
      expect(windows).toEqual([undefined, undefined]);

      windows.length = 0;
      const stamp = "2026-10-01T00:00:00.000Z"; // as a worker step's copy has it
      await syncBrokerLink(tx, { ...link, lastSyncAt: stamp }, fetcher);
      expect(windows[0]?.toISOString()).toBe(stamp);
    });
  });

  it("imports a repeated activity once, and it still counts", async () => {
    await withLink(async (tx, link) => {
      const fetcher = async (_c: unknown, accountId: string) =>
        accountId === "a" ? [trade("AAPL")] : [];
      await syncBrokerLink(tx, link, fetcher);
      const again = await syncBrokerLink(tx, link, fetcher);
      expect(again).toEqual({ synced: 0, verified: true });
      expect((await stateOf(tx, link)).trades).toBe(1);
    });
  });

  it("keeps Verified through a quiet day", async () => {
    await withLink(
      async (tx, link) => {
        const quiet = await syncBrokerLink(tx, link, async () => []);
        expect(quiet).toEqual({ synced: 0, verified: true });
        expect((await stateOf(tx, link)).status).toBe("verified");
      },
      { isVerified: true },
    );
  });

  it("withdraws Verified on a failed sync, and rethrows", async () => {
    await withLink(
      async (tx, link) => {
        await expect(
          syncBrokerLink(tx, link, async () => {
            throw new Error("x".repeat(600));
          }),
        ).rejects.toThrow();
        const state = await stateOf(tx, link);
        expect(state.status).toBe("failed");
        expect(state.row.isVerified).toBe(false);
        expect(state.row.syncStatus).toBe("error");
        expect(state.row.syncErrorMessage).toHaveLength(500);
      },
      { isVerified: true },
    );
  });

  it("restores everything when a step's retry succeeds", async () => {
    await withLink(
      async (tx, link) => {
        await syncBrokerLink(tx, link, async () => {
          throw new Error("blip");
        }).catch(() => {});
        // The retry runs on the step's memoised copy of the link.
        const result = await syncBrokerLink(tx, link, async () => []);
        expect(result?.verified).toBe(true);
        const state = await stateOf(tx, link);
        expect(state.status).toBe("verified");
        expect(state.row.syncStatus).toBe("active");
        expect(state.row.syncErrorMessage).toBeNull();
      },
      { isVerified: true },
    );
  });

  it("does not bring back a link disconnected while it ran", async () => {
    await withLink(async (tx, link) => {
      await syncBrokerLink(tx, link, async () => {
        await tx
          .update(brokerLinks)
          .set({ syncStatus: "disconnected", metadata: {} })
          .where(eq(brokerLinks.id, link.id));
        await tx
          .update(entities)
          .set({ brokerLinkStatus: "none" })
          .where(eq(entities.id, link.entityId));
        return [trade("AAPL")];
      });
      const state = await stateOf(tx, link);
      expect(state.status).toBe("none");
      expect(state.row.syncStatus).toBe("disconnected");
      expect(state.row.isVerified).toBe(false);
    });
  });

  it("skips a link with no credentials", async () => {
    await withLink(
      async (tx, link) => {
        expect(await syncBrokerLink(tx, link, async () => [])).toBeNull();
      },
      { metadata: {} },
    );
  });
});

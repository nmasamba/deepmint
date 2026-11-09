import { describe, it, expect } from "vitest";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { createCaller } from "../root";
import { createContext } from "../trpc";

const ANY_ID = "00000000-0000-4000-8000-000000000000";

const signedOut = createCaller(createContext({ userId: null, entity: null }));
const member = createCaller(
  createContext({
    userId: "local-test",
    entity: { id: ANY_ID } as NonNullable<Parameters<typeof createContext>[0]["entity"]>,
  }),
);
const apiKeyRoute = createCaller(
  createContext({ userId: null, entity: null, apiKeyVerified: true }),
);

class Rollback extends Error {}

/** Each case rolls back, so it leaves no entity behind. */
async function rolledBack(
  run: (tx: typeof db, admin: ReturnType<typeof createCaller>) => Promise<void>,
) {
  await db
    .transaction(async (tx) => {
      const handle = tx as unknown as typeof db;
      const [minter] = await handle.select().from(entities).limit(1);
      const admin = createCaller({
        ...createContext({ userId: "local-admin", entity: minter!, isAdmin: true }),
        db: handle,
      });
      await run(handle, admin);
      throw new Rollback();
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

async function guide(tx: typeof db, sourceUrl: string | null = null) {
  const slug = `zz-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await tx
    .insert(entities)
    .values({ type: "guide", displayName: slug, slug, sourceUrl })
    .returning();
  return row!;
}

describe("Guide feeds are admin only", () => {
  const set = { entityId: ANY_ID, sourceUrl: "https://example.test/feed", enabled: true };

  it("refuses everyone else, an API-key route included", async () => {
    await expect(signedOut.entity.adminGuides()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(signedOut.entity.adminSetFeed(set)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(member.entity.adminGuides()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.entity.adminSetFeed(set)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(apiKeyRoute.entity.adminGuides()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("entity.adminSetFeed (local DB)", () => {
  it("switches a feed on and off, and lists it first while on", async () => {
    await rolledBack(async (tx, admin) => {
      const g = await guide(tx);
      await admin.entity.adminSetFeed({
        entityId: g.id,
        sourceUrl: `https://example.test/${g.slug}.xml`,
        enabled: true,
      });
      const [on] = await tx.select().from(entities).where(eq(entities.id, g.id));
      expect(on).toMatchObject({
        isAllowlisted: true,
        sourceUrl: `https://example.test/${g.slug}.xml`,
      });
      const list = await admin.entity.adminGuides();
      expect(list[0]?.isAllowlisted).toBe(true);
      expect(list.find((row) => row.id === g.id)).toBeDefined();

      await admin.entity.adminSetFeed({
        entityId: g.id,
        sourceUrl: on!.sourceUrl,
        enabled: false,
      });
      const [off] = await tx.select().from(entities).where(eq(entities.id, g.id));
      expect(off?.isAllowlisted).toBe(false);
      expect(off?.sourceUrl).toBe(on!.sourceUrl);
    });
  });

  it("refuses to switch on a Guide with no URL", async () => {
    await rolledBack(async (tx, admin) => {
      const g = await guide(tx);
      await expect(
        admin.entity.adminSetFeed({ entityId: g.id, sourceUrl: null, enabled: true }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  it("refuses a URL that is not http or https", async () => {
    await rolledBack(async (tx, admin) => {
      const g = await guide(tx);
      await expect(
        admin.entity.adminSetFeed({ entityId: g.id, sourceUrl: "file:///etc/passwd", enabled: true }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  it("refuses a URL another entity holds, which would merge them in the resolver", async () => {
    await rolledBack(async (tx, admin) => {
      const url = `https://example.test/shared-${Date.now()}.xml`;
      await guide(tx, url);
      const other = await guide(tx);
      await expect(
        admin.entity.adminSetFeed({ entityId: other.id, sourceUrl: url, enabled: true }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  it("does not touch a Player", async () => {
    await rolledBack(async (tx, admin) => {
      const [player] = await tx
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.type, "player"))
        .limit(1);
      await expect(
        admin.entity.adminSetFeed({
          entityId: player!.id,
          sourceUrl: `https://example.test/p-${Date.now()}.xml`,
          enabled: true,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

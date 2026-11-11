import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, eq, inArray, or } from "@deepmint/db";
import {
  apiKeys,
  brokerLinks,
  entities,
  instruments,
  paperPortfolios,
  playerTrades,
  scores,
  signalSimulatePortfolios,
} from "@deepmint/db/schema";
import { createCaller } from "../root";
import { createContext } from "../trpc";

type EntityRow = typeof entities.$inferSelect;

const deletedRow = {
  id: "00000000-0000-4000-8000-000000000001",
  clerkUserId: "user_deleted",
  type: "player",
  displayName: "Deleted user",
  slug: "deleted-00000000-0000-4000-8000-000000000001",
  deletedAt: new Date("2026-11-09T00:00:00Z"),
} as EntityRow;

describe("a deleted account acts as no one", () => {
  const caller = createCaller(
    createContext({ userId: "user_deleted", entity: deletedRow, isAdmin: true }),
  );

  it("has no user, entity or admin role in its context", () => {
    const ctx = createContext({ userId: "user_deleted", entity: deletedRow, isAdmin: true });
    expect(ctx.userId).toBeNull();
    expect(ctx.entity).toBeNull();
    expect(ctx.isAdmin).toBe(false);
  });

  it("cannot edit the profile, write, or read member data", async () => {
    await expect(caller.entity.update({ bio: "back again" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.entity.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.leaderboard.top({ metric: "hit_rate" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.entity.adminDelete({ entityId: "00000000-0000-4000-8000-000000000002" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("entity.adminDelete (local DB)", () => {
  const tag = `zz-w78-del-${Date.now()}`;
  let admin: EntityRow;
  let user: EntityRow;
  let agent: EntityRow;
  let guide: EntityRow;
  let other: EntityRow;
  let squatted: EntityRow;
  const created: string[] = [];
  const portfolios: string[] = [];

  const insertEntity = async (values: Partial<EntityRow> & { slug: string }) => {
    const [row] = await db
      .insert(entities)
      .values({ type: "player", displayName: values.slug, ...values })
      .returning();
    created.push(row!.id);
    return row!;
  };
  const read = async (id: string) =>
    (await db.select().from(entities).where(eq(entities.id, id)))[0]!;
  const adminCaller = () =>
    createCaller(createContext({ userId: admin.clerkUserId, entity: admin, isAdmin: true }));

  beforeAll(async () => {
    admin = await insertEntity({ slug: `${tag}-admin`, clerkUserId: `${tag}-admin` });
    user = await insertEntity({
      slug: `${tag}-user`,
      clerkUserId: `${tag}-user`,
      displayName: "Ada Lovelace",
      bio: "Personal bio",
      avatarUrl: "https://img.clerk.com/ada.png",
      styleTags: ["macro"],
      brokerLinkStatus: "verified",
      snaptradeUserId: `${tag}-snap`,
    });
    agent = await insertEntity({ slug: `${tag}-agent`, isAgent: true });
    guide = await insertEntity({ slug: `${tag}-guide`, type: "guide" });
    other = await insertEntity({ slug: `${tag}-other`, clerkUserId: `${tag}-other` });
    squatted = await insertEntity({ slug: `${tag}-squatted`, clerkUserId: `${tag}-squatted` });
    // Someone who signed up under the name "Deleted <uuid>".
    await insertEntity({ slug: `deleted-${squatted.id}`, clerkUserId: `${tag}-squatter` });

    await db.insert(apiKeys).values([
      { name: `${tag} minted`, keyHash: `${tag}-h1`, keyPrefix: "dm_test", createdBy: user.id, scopes: ["scores:read"] },
      { name: `${tag} agent`, keyHash: `${tag}-h2`, keyPrefix: "dm_test", createdBy: admin.id, entityId: agent.id, scopes: ["claims:write"] },
      { name: `${tag} other`, keyHash: `${tag}-h3`, keyPrefix: "dm_test", createdBy: admin.id, scopes: ["scores:read"] },
    ]);
    await db.insert(brokerLinks).values({
      entityId: user.id,
      provider: "snaptrade",
      providerAccountId: `${tag}-acct`,
      syncStatus: "active",
      isVerified: true,
      metadata: { userSecret: "secret" },
    });
    // An imported broker trade, and a mirror the user runs of another account.
    const [aapl] = await db.select().from(instruments).where(eq(instruments.ticker, "AAPL"));
    await db.insert(playerTrades).values({
      entityId: user.id,
      instrumentId: aapl!.id,
      side: "buy",
      entryPriceCents: 20000,
      quantity: "1",
      openedAt: new Date(),
    });
    const [mirrorPortfolio] = await db
      .insert(paperPortfolios)
      .values({ entityId: user.id, name: `${tag} mirror` })
      .returning();
    portfolios.push(mirrorPortfolio!.id);
    await db.insert(signalSimulatePortfolios).values({
      entityId: user.id,
      followedEntityId: other.id,
      paperPortfolioId: mirrorPortfolio!.id,
    });
    // A board where the user ranks, dated after any real scoring run.
    await db.insert(scores).values([
      { entityId: user.id, metric: "hit_rate", value: "0.9", horizon: "all", asOfDate: "2099-01-01" },
      { entityId: user.id, metric: "outcome_count", value: "12", horizon: "all", asOfDate: "2099-01-01" },
    ]);
  });

  afterAll(async () => {
    await db.delete(signalSimulatePortfolios).where(inArray(signalSimulatePortfolios.entityId, created));
    if (portfolios.length) await db.delete(paperPortfolios).where(inArray(paperPortfolios.id, portfolios));
    await db.delete(playerTrades).where(inArray(playerTrades.entityId, created));
    await db.delete(scores).where(inArray(scores.entityId, created));
    await db.delete(brokerLinks).where(inArray(brokerLinks.entityId, created));
    await db
      .delete(apiKeys)
      .where(or(inArray(apiKeys.createdBy, created), inArray(apiKeys.entityId, created)));
    await db.delete(entities).where(inArray(entities.id, created));
  });

  it("anonymises the account in one go and keeps it ranked", async () => {
    const result = await adminCaller().entity.adminDelete({ entityId: user.id });
    // The key it minted acts as no one, so it stays (package 54).
    expect(result).toMatchObject({ slug: `deleted-${user.id}`, alreadyDeleted: false, keysRevoked: 0 });

    const row = await read(user.id);
    expect(row).toMatchObject({
      displayName: "Deleted user",
      slug: `deleted-${user.id}`,
      bio: null,
      avatarUrl: null,
      styleTags: [],
      brokerLinkStatus: "none",
      // Kept until SnapTrade confirms it deleted the user there (not configured here).
      snaptradeUserId: `${tag}-snap`,
      // Kept, so a late Clerk event finds this row and nothing recreates it.
      clerkUserId: `${tag}-user`,
    });
    expect(row.deletedAt).toBeInstanceOf(Date);

    const [minted] = await db.select().from(apiKeys).where(eq(apiKeys.createdBy, user.id));
    expect(minted?.isActive).toBe(true);
    const [link] = await db.select().from(brokerLinks).where(eq(brokerLinks.entityId, user.id));
    expect(link).toMatchObject({ syncStatus: "disconnected", isVerified: false, metadata: {} });
    expect(link!.disconnectedAt).toBeInstanceOf(Date);
    expect(await db.select().from(playerTrades).where(eq(playerTrades.entityId, user.id))).toHaveLength(0);
    const [mirror] = await db
      .select()
      .from(signalSimulatePortfolios)
      .where(eq(signalSimulatePortfolios.entityId, user.id));
    expect(mirror?.isActive).toBe(false);

    const board = await adminCaller().leaderboard.top({ metric: "hit_rate", limit: 100 });
    expect(board.find((r) => r.entity.id === user.id)?.entity.displayName).toBe("Deleted user");
    const search = await adminCaller().entity.search({ q: "Deleted user", limit: 50 });
    expect(search.find((r) => r.id === user.id)).toBeUndefined();
  });

  it("refuses a profile save from a session read before the deletion", async () => {
    // The race the WHERE guard closes: the request read the account before
    // it was deleted, and its UPDATE runs after.
    const stale = createCaller(
      createContext({ userId: user.clerkUserId, entity: { ...user, deletedAt: null } }),
    );
    await expect(stale.entity.update({ bio: "restored" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect((await read(user.id)).bio).toBeNull();
  });

  it("is no one to follow or mirror", async () => {
    const member = createCaller(createContext({ userId: other.clerkUserId, entity: other }));
    await expect(member.social.follow({ targetEntityId: user.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      member.signalSimulate.create({ followedEntityId: user.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("takes a suffixed address when deleted-<id> is taken", async () => {
    const result = await adminCaller().entity.adminDelete({ entityId: squatted.id });
    expect(result.slug).toMatch(new RegExp(`^deleted-${squatted.id}-[0-9a-f]{8}$`));
    expect((await read(squatted.id)).slug).toBe(result.slug);
  });

  it("changes nothing the second time", async () => {
    const before = await read(user.id);
    const again = await adminCaller().entity.adminDelete({ entityId: user.id });
    expect(again).toMatchObject({ alreadyDeleted: true, keysRevoked: 0 });
    expect((await read(user.id)).updatedAt).toEqual(before.updatedAt);
  });

  it("deletes an agent and revokes the keys it acts through", async () => {
    await adminCaller().entity.adminDelete({ entityId: agent.id });
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.entityId, agent.id));
    expect(key?.isActive).toBe(false);
    expect((await read(agent.id)).displayName).toBe("Deleted user");
    // Nor can it be given a new one, which could never write.
    await expect(
      adminCaller().apiKeys.create({
        name: `${tag} new for deleted`,
        scopes: ["claims:write"],
        agentEntityId: agent.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const listed = await adminCaller().apiKeys.list();
    expect(listed.find((k) => k.entityId === agent.id)?.agentDeleted).toBe(true);
  });

  it("leaves other accounts' keys alone", async () => {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.name, `${tag} other`));
    expect(key?.isActive).toBe(true);
  });

  it("refuses an ingested Guide, your own account, and a non-admin", async () => {
    await expect(adminCaller().entity.adminDelete({ entityId: guide.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(adminCaller().entity.adminDelete({ entityId: admin.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const member = createCaller(createContext({ userId: other.clerkUserId, entity: other }));
    await expect(member.entity.adminDelete({ entityId: other.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await read(guide.id)).deletedAt).toBeNull();
    expect((await read(other.id)).deletedAt).toBeNull();
  });
});

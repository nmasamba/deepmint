import { describe, it, expect } from "vitest";
import { db, sql } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { createCaller } from "../root";
import { createContext } from "../trpc";

type Caller = ReturnType<typeof createCaller>;

const ANY_ID = "00000000-0000-4000-8000-000000000000";
const PRIVATE_KEYS = ["clerkUserId", "snaptradeUserId", "isAllowlisted", "deletedAt", "updatedAt"];

const signedOut = createCaller(createContext({ userId: null, entity: null }));
const signedIn = createCaller(createContext({ userId: "local-test", entity: null }));
const apiKeyRoute = createCaller(
  createContext({ userId: null, entity: null, apiKeyVerified: true }),
);

/** Every leaderboard and profile read. */
const reads: Array<[string, (c: Caller) => Promise<unknown>]> = [
  ["leaderboard.top", (c) => c.leaderboard.top({ metric: "hit_rate" })],
  ["leaderboard.byTicker", (c) => c.leaderboard.byTicker({ ticker: "AAPL" })],
  ["leaderboard.bestInCurrentConditions", (c) => c.leaderboard.bestInCurrentConditions({})],
  ["entity.search", (c) => c.entity.search({ q: "a" })],
  ["scores.byEntity", (c) => c.scores.byEntity({ entityId: ANY_ID })],
  ["scores.history", (c) => c.scores.history({ entityId: ANY_ID, metric: "hit_rate" })],
  ["influence.topInfluencers", (c) => c.influence.topInfluencers({})],
  ["influence.byGuide", (c) => c.influence.byGuide({ entityId: ANY_ID })],
  ["social.followers", (c) => c.social.followers({ entityId: ANY_ID })],
  ["social.following", (c) => c.social.following({ entityId: ANY_ID })],
  ["social.followerCount", (c) => c.social.followerCount({ entityId: ANY_ID })],
];

describe("leaderboard and profile reads, signed out", () => {
  it.each(reads)("%s is refused", async (_name, read) => {
    await expect(read(signedOut)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("entity.bySlug is refused", async () => {
    await expect(signedOut.entity.bySlug({ slug: "x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("leaderboard and profile reads (local DB)", () => {
  it.each(reads)("%s answers a signed-in user and an API-key route", async (_name, read) => {
    await expect(read(signedIn)).resolves.toBeDefined();
    await expect(read(apiKeyRoute)).resolves.toBeDefined();
  });

  it("entity.search returns only public columns", async () => {
    const rows = await signedIn.entity.search({ q: "a", limit: 50 });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const key of PRIVATE_KEYS) expect(row).not.toHaveProperty(key);
    }
  });

  it("entity.bySlug returns only public columns", async () => {
    const [row] = await db.select({ slug: entities.slug }).from(entities).where(sql`true`).limit(1);
    const entity = await signedIn.entity.bySlug({ slug: row!.slug });
    expect(entity.slug).toBe(row!.slug);
    for (const key of PRIVATE_KEYS) expect(entity).not.toHaveProperty(key);
  });

  it("entity.search treats % and _ as literal characters", async () => {
    for (const q of ["%", "_"]) {
      const rows = await signedIn.entity.search({ q, limit: 50 });
      for (const row of rows) expect(row.displayName).toContain(q);
    }
  });
});

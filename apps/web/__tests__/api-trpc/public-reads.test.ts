import { describe, it, expect } from "vitest";
import { db, eq, ne } from "@deepmint/db";
import { claims } from "@deepmint/db/schema";
import { BASE_URL, API_KEY } from "../api-v1/helpers";

/**
 * Live, signed-out checks of the tRPC reads and public pages (no mocks).
 *
 * Prerequisites (same as the api-v1 suite): a running server at
 * TEST_BASE_URL (default http://localhost:3000), and TEST_API_KEY set, which
 * marks that the server is up. DATABASE_URL must be the server's database.
 */
const ANY_ID = "00000000-0000-4000-8000-000000000000";

async function trpcGet(path: string, input: unknown) {
  const qs = encodeURIComponent(JSON.stringify({ json: input }));
  const res = await fetch(`${BASE_URL}/api/trpc/${path}?input=${qs}`);
  const body = await res.json();
  return { status: res.status, data: body?.result?.data?.json, error: body?.error?.json };
}

const activeClaimId = async () => {
  const [row] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(eq(claims.status, "active"))
    .limit(1);
  return row!.id;
};

describe.skipIf(!API_KEY)("leaderboard and profile reads, signed out", () => {
  it.each([
    ["leaderboard.top", { metric: "hit_rate" }],
    ["leaderboard.byTicker", { ticker: "AAPL" }],
    ["leaderboard.bestInCurrentConditions", {}],
    ["entity.bySlug", { slug: "x" }],
    ["entity.search", { q: "a" }],
    ["scores.byEntity", { entityId: ANY_ID }],
    ["scores.history", { entityId: ANY_ID, metric: "hit_rate" }],
    ["influence.topInfluencers", {}],
    ["influence.byGuide", { entityId: ANY_ID }],
    ["social.followers", { entityId: ANY_ID }],
    ["social.following", { entityId: ANY_ID }],
    ["social.followerCount", { entityId: ANY_ID }],
  ])("%s answers 401", async (path, input) => {
    const { status, error } = await trpcGet(path, input);
    expect(status).toBe(401);
    expect(error.data.code).toBe("UNAUTHORIZED");
  });

  it.each(["/leaderboard", "/player/x", "/guide/x"])("the page %s stays behind sign-in", async (path) => {
    const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
    expect(res.status).not.toBe(200);
  });
});

describe.skipIf(!API_KEY)("public reads, signed out", () => {
  it.each([
    ["entity.stats", undefined],
    ["instruments.search", { q: "AAPL" }],
    ["ticker.overview", { ticker: "AAPL" }],
    ["claims.list", { limit: 1 }],
    ["consensus.mag7", undefined],
    ["regime.current", undefined],
  ])("%s answers", async (path, input) => {
    expect((await trpcGet(path, input)).status).toBe(200);
  });

  it("claims.detail answers 404 for a claim that is not active", async () => {
    const [hidden] = await db
      .select({ id: claims.id })
      .from(claims)
      .where(ne(claims.status, "active"))
      .limit(1);
    if (!hidden) return; // nothing pending or rejected in this database
    const { status, error } = await trpcGet("claims.detail", { id: hidden.id });
    expect(status).toBe(404);
    expect(error.data.code).toBe("NOT_FOUND");
  });

  it("claims.detail still returns an active claim", async () => {
    const { data: page } = await trpcGet("claims.list", { limit: 1 });
    const id = page.items[0].claim.id;
    const { status, data } = await trpcGet("claims.detail", { id });
    expect(status).toBe(200);
    expect(data.claim.id).toBe(id);
  });

  it("ticker, Learn and claim pages render", async () => {
    const paths = ["/ticker/AAPL", "/learn", "/learn/what-makes-a-good-trade", `/claims/${await activeClaimId()}`];
    for (const path of paths) {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
      expect(res.status, path).toBe(200);
    }
  });
});

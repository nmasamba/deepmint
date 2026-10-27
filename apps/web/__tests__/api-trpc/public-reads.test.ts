import { describe, it, expect } from "vitest";
import { db, ne } from "@deepmint/db";
import { claims } from "@deepmint/db/schema";
import { BASE_URL, API_KEY } from "../api-v1/helpers";

/**
 * Live, signed-out checks of the public tRPC reads (no mocks).
 *
 * Prerequisites (same as the api-v1 suite): a running server at
 * TEST_BASE_URL (default http://localhost:3000), and TEST_API_KEY set, which
 * marks that the server is up. DATABASE_URL must be the server's database.
 */
const PRIVATE_KEYS = ["clerkUserId", "snaptradeUserId", "isAllowlisted", "deletedAt", "updatedAt"];

async function trpcGet(path: string, input: unknown) {
  const qs = encodeURIComponent(JSON.stringify({ json: input }));
  const res = await fetch(`${BASE_URL}/api/trpc/${path}?input=${qs}`);
  const body = await res.json();
  return { status: res.status, data: body?.result?.data?.json, error: body?.error?.json };
}

describe.skipIf(!API_KEY)("public tRPC reads, signed out", () => {
  it("entity.search returns only public columns", async () => {
    const { status, data } = await trpcGet("entity.search", { q: "a", limit: 50 });
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      for (const key of PRIVATE_KEYS) expect(row).not.toHaveProperty(key);
    }
  });

  it("entity.bySlug returns only public columns", async () => {
    const { data: found } = await trpcGet("entity.search", { q: "a", limit: 1 });
    const { status, data } = await trpcGet("entity.bySlug", { slug: found[0].slug });
    expect(status).toBe(200);
    expect(data.slug).toBe(found[0].slug);
    for (const key of PRIVATE_KEYS) expect(data).not.toHaveProperty(key);
  });

  it("entity.search treats % and _ as literal characters", async () => {
    for (const q of ["%", "_"]) {
      const { status, data } = await trpcGet("entity.search", { q, limit: 50 });
      expect(status).toBe(200);
      for (const row of data) expect(row.displayName).toContain(q);
    }
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
});

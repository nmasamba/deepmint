import { describe, it, expect } from "vitest";
import { API_KEY, fetchApi } from "./helpers";

const skip = !API_KEY;

describe.skipIf(skip)("GET /api/v1/entities/:slug/scores", () => {
  const TEST_ENTITY_SLUG = process.env.TEST_ENTITY_SLUG ?? "demo-guide";

  it("returns 200 with valid key and known entity", async () => {
    const res = await fetchApi(`/api/v1/entities/${TEST_ENTITY_SLUG}/scores`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.entity).toBeDefined();
    expect(body.data.entity.slug).toBe(TEST_ENTITY_SLUG);
    expect(Array.isArray(body.data.scores)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
    expect(body.meta.timestamp).toBeDefined();
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await fetchApi(`/api/v1/entities/${TEST_ENTITY_SLUG}/scores`, { key: null });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with invalid token", async () => {
    const res = await fetchApi(`/api/v1/entities/${TEST_ENTITY_SLUG}/scores`, { key: "dm_live_invalid0000000000000000" });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 for unknown entity slug", async () => {
    const res = await fetchApi("/api/v1/entities/nonexistent-entity-xyz-999/scores");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("includes rate limit headers", async () => {
    const res = await fetchApi(`/api/v1/entities/${TEST_ENTITY_SLUG}/scores`);
    expect(res.headers.get("x-ratelimit-limit")).toBeDefined();
    expect(res.headers.get("x-ratelimit-remaining")).toBeDefined();
    expect(res.headers.get("x-ratelimit-reset")).toBeDefined();
  });
});

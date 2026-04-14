import { describe, it, expect } from "vitest";
import { API_KEY, fetchApi } from "./helpers";

const skip = !API_KEY;

describe.skipIf(skip)("GET /api/v1/leaderboard", () => {
  it("returns 200 with valid key and metric param", async () => {
    const res = await fetchApi("/api/v1/leaderboard?metric=hit_rate");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.metric).toBe("hit_rate");
    expect(Array.isArray(body.data.rows)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await fetchApi("/api/v1/leaderboard?metric=hit_rate", { key: null });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when metric param is missing", async () => {
    const res = await fetchApi("/api/v1/leaderboard");
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("accepts optional query parameters", async () => {
    const res = await fetchApi("/api/v1/leaderboard?metric=hit_rate&entityType=guide&limit=5");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.rows.length).toBeLessThanOrEqual(5);
  });

  it("includes rate limit headers", async () => {
    const res = await fetchApi("/api/v1/leaderboard?metric=hit_rate");
    expect(res.headers.get("x-ratelimit-limit")).toBeDefined();
    expect(res.headers.get("x-ratelimit-remaining")).toBeDefined();
  });
});

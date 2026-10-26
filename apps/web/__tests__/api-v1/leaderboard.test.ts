import { describe, it, expect } from "vitest";
import { API_KEY, BASE_URL, fetchApi } from "./helpers";

interface Row {
  rank: number;
  entity: { slug: string };
  score: number;
}

/** The same board from the public tRPC procedure the web and MCP use. */
async function trpcTop(input: Record<string, unknown>): Promise<Row[]> {
  const res = await fetch(
    `${BASE_URL}/api/trpc/leaderboard.top?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
  );
  const body = await res.json();
  return body.result.data.json;
}

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

  it("returns 400 for a horizon the scorer never writes", async () => {
    const res = await fetchApi("/api/v1/leaderboard?metric=hit_rate&horizon=12m");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
  });

  it("returns 400 for an unknown regimeTag", async () => {
    const res = await fetchApi("/api/v1/leaderboard?metric=eiv&regimeTag=sideways");
    expect(res.status).toBe(400);
  });

  it("defaults to the pooled horizon, listing each entity once", async () => {
    const res = await fetchApi("/api/v1/leaderboard?metric=hit_rate&limit=100");
    const body = await res.json();
    expect(body.data.horizon).toBe("all");
    const slugs = body.data.rows.map((r: Row) => r.entity.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(["max_drawdown", "calibration_brier"])(
    "ranks %s, where lower is better, ascending",
    async (metric) => {
      const res = await fetchApi(`/api/v1/leaderboard?metric=${metric}&limit=100`);
      const scores = (await res.json()).data.rows.map((r: Row) => r.score);
      expect(scores).toEqual([...scores].sort((a, b) => a - b));
    },
  );

  it.each(["eiv_overall", "hit_rate", "max_drawdown"])(
    "matches the tRPC board for %s",
    async (metric) => {
      const res = await fetchApi(`/api/v1/leaderboard?metric=${metric}&limit=50`);
      const v1 = (await res.json()).data.rows as Row[];
      const trpc = await trpcTop({ metric, limit: 50 });
      expect(v1.map((r) => [r.rank, r.entity.slug, r.score])).toEqual(
        trpc.map((r) => [r.rank, r.entity.slug, r.score]),
      );
    },
  );
});

import { describe, it, expect } from "vitest";
import { MIN_RANKED_OUTCOMES } from "@deepmint/shared";
import { API_KEY, BASE_URL, fetchApi } from "./helpers";

interface Row {
  rank: number;
  entity: { slug: string };
  score: number;
  sampleSize: number;
  isSignificant: boolean;
}

/** The same board through MCP, which calls leaderboard.top like the web app. */
async function mcpTop(args: Record<string, unknown>): Promise<Row[]> {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_leaderboard", arguments: args },
    }),
  });
  const line = (await res.text()).split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse(JSON.parse(line!.slice(5)).result.content[0].text);
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

  it("ranks only entities above the sample floor, and shows each row's sample", async () => {
    for (const horizon of ["all", "1m"]) {
      const res = await fetchApi(`/api/v1/leaderboard?metric=hit_rate&horizon=${horizon}&limit=100`);
      const { rows } = (await res.json()).data as { rows: Row[] };
      for (const row of rows) {
        expect(row.sampleSize).toBeGreaterThanOrEqual(MIN_RANKED_OUTCOMES);
        expect(typeof row.isSignificant).toBe("boolean");
      }
    }
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
    "matches the MCP board for %s",
    async (metric) => {
      const res = await fetchApi(`/api/v1/leaderboard?metric=${metric}&limit=50`);
      const v1 = (await res.json()).data.rows as Row[];
      const mcp = await mcpTop({ metric, limit: 50 });
      expect(v1.map((r) => [r.rank, r.entity.slug, r.score])).toEqual(
        mcp.map((r) => [r.rank, r.entity.slug, r.score]),
      );
    },
  );
});

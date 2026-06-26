import { describe, it, expect } from "vitest";
import { BASE_URL, API_KEY } from "../api-v1/helpers";

/**
 * Live integration tests for the MCP server (no mocks).
 *
 * Prerequisites (same as the api-v1 suite):
 * - Running server at TEST_BASE_URL (default http://localhost:3000)
 * - TEST_API_KEY set to a valid dm_live_* key (read scopes at minimum)
 *
 * Skipped automatically when TEST_API_KEY is absent.
 */
const MCP_URL = `${BASE_URL}/api/mcp`;
const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function rpc(method: string, params: unknown, id = 1) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

/** Parse a JSON or SSE-framed MCP response body. */
async function parseMcp(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (ct.includes("text/event-stream")) {
    const line = body.split("\n").find((l) => l.startsWith("data:"));
    return line ? JSON.parse(line.slice(5).trim()) : null;
  }
  return body ? JSON.parse(body) : null;
}

describe.skipIf(!API_KEY)("MCP server auth gate", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: MCP_HEADERS,
      body: rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid API key with 401", async () => {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: "Bearer dm_live_invalid" },
      body: rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {} }),
    });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!API_KEY)("MCP server (authenticated)", () => {
  it("lists the Deepmint tools", async () => {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${API_KEY}` },
      body: rpc("tools/list", {}),
    });
    expect(res.status).toBe(200);
    const json = (await parseMcp(res)) as {
      result?: { tools?: { name: string }[] };
    };
    const names = json.result?.tools?.map((t) => t.name) ?? [];
    expect(names).toContain("get_consensus");
    expect(names).toContain("get_leaderboard");
    expect(names).toContain("submit_claim");
  });
});

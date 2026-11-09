import { createHash, randomBytes } from "node:crypto";
import { afterAll, describe, it, expect } from "vitest";
import { and, db, eq, inArray, isNotNull, ne } from "@deepmint/db";
import { apiKeys, claims, entities, notes } from "@deepmint/db/schema";
import { BASE_URL, API_KEY } from "../api-v1/helpers";

/**
 * Live integration tests for the MCP server (no mocks).
 *
 * Prerequisites (same as the api-v1 suite):
 * - Running server at TEST_BASE_URL (default http://localhost:3000)
 * - TEST_API_KEY set to a valid dm_live_* key (read scopes at minimum)
 * - DATABASE_URL set to the server's database, for the scope tests, which mint
 *   and delete their own keys
 *
 * Skipped automatically when TEST_API_KEY is absent. Nothing here writes to the
 * ledger, unless TEST_MCP_WRITES=1 is set: claims cannot be deleted, so that case
 * leaves an agent and its claim behind.
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

async function callTool(name: string, args: unknown, key = API_KEY) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { ...MCP_HEADERS, Authorization: `Bearer ${key}` },
    body: rpc("tools/call", { name, arguments: args }),
  });
  expect(res.status).toBe(200);
  const json = (await parseMcp(res)) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  return { text: json.result.content[0]?.text ?? "", isError: !!json.result.isError };
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

  it("get_entity_track_record returns scores and claims with their outcomes", async () => {
    const top = await callTool("get_leaderboard", { metric: "hit_rate", limit: 1 });
    expect(top.isError).toBe(false);
    const [first] = JSON.parse(top.text).items ?? JSON.parse(top.text);
    const { text, isError } = await callTool("get_entity_track_record", {
      slug: first.entity.slug,
      limit: 100,
    });
    expect(isError).toBe(false);
    const record = JSON.parse(text);
    expect(record.entity.slug).toBe(first.entity.slug);
    expect(record.scores.length).toBeGreaterThan(0);
    expect(record.claims.length).toBeGreaterThan(0);
    expect(record.claims.some((c: { outcomes: unknown[] }) => c.outcomes.length > 0)).toBe(true);
    expect(text).not.toContain("rawText");
    expect(record.entity).not.toHaveProperty("clerkUserId");
  });

  it("get_consensus accepts Mag-7 tickers only", async () => {
    expect((await callTool("get_consensus", { ticker: "aapl" })).isError).toBe(false);
    const other = await callTool("get_consensus", { ticker: "SPY" });
    expect(other.isError).toBe(true);
    expect(other.text).toContain("Mag 7");
  });

  it("submit_claim refuses a tag outside the vocabulary before writing", async () => {
    const res = await callTool("submit_claim", {
      ticker: "AAPL",
      direction: "long",
      horizonDays: 30,
      rationaleTags: ["not-a-tag"],
    });
    expect(res.isError).toBe(true);
  });
});

describe.skipIf(!API_KEY || !process.env.DATABASE_URL)("MCP per-tool scopes", () => {
  const minted: string[] = [];

  const agents: string[] = [];

  async function mintKey(
    scopes: string[],
    owner: { createdBy?: string; entityId?: string } = {},
  ) {
    const plaintext = `dm_live_${randomBytes(16).toString("hex")}`;
    const [row] = await db
      .insert(apiKeys)
      .values({
        name: "zz-mcp-scope-test",
        keyHash: createHash("sha256").update(plaintext).digest("hex"),
        keyPrefix: plaintext.slice(0, 16),
        scopes,
        ...owner,
      })
      .returning({ id: apiKeys.id });
    minted.push(row!.id);
    return plaintext;
  }

  async function mintAgent() {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [agent] = await db
      .insert(entities)
      .values({
        type: "player",
        isAgent: true,
        displayName: `zz MCP agent ${stamp}`,
        slug: `zz-mcp-agent-${stamp}`,
      })
      .returning();
    agents.push(agent!.id);
    return agent!;
  }

  /** A Player's active claim: the admin in these cases, and never the agent. */
  async function someoneElsesClaim() {
    const [row] = await db
      .select({ id: claims.id, entityId: claims.entityId })
      .from(claims)
      .where(eq(claims.status, "active"))
      .limit(1);
    return row!;
  }

  afterAll(async () => {
    if (minted.length > 0) await db.delete(apiKeys).where(inArray(apiKeys.id, minted));
    // An agent that wrote to the ledger stays: its rows cannot be deleted.
    if (agents.length > 0 && !process.env.TEST_MCP_WRITES) {
      await db.delete(entities).where(inArray(entities.id, agents));
    }
  });

  it("a key reaches only the tools its scopes allow", async () => {
    const key = await mintKey(["leaderboard:read"]);
    const allowed = await callTool("get_leaderboard", { metric: "hit_rate", limit: 1 }, key);
    expect(allowed.isError).toBe(false);

    for (const [tool, args, scope] of [
      ["get_consensus", { ticker: "AAPL" }, "consensus:read"],
      ["get_current_regime", {}, "consensus:read"],
      ["get_entity_track_record", { slug: "x" }, "scores:read"],
      ["submit_claim", { ticker: "AAPL", direction: "long", horizonDays: 30 }, "claims:write"],
    ] as const) {
      const denied = await callTool(tool, args, key);
      expect(denied.isError).toBe(true);
      expect(denied.text).toContain(scope);
    }
  });

  it("a claims:write-only key opens a session and can search", async () => {
    const key = await mintKey(["claims:write"]);
    expect((await callTool("search_instruments", { query: "AAPL" }, key)).isError).toBe(false);
    expect((await callTool("get_consensus", { ticker: "AAPL" }, key)).isError).toBe(true);
  });

  it("a key with no agent cannot write, even with its admin's id on it", async () => {
    const claim = await someoneElsesClaim();
    const key = await mintKey(["claims:write"], { createdBy: claim.entityId });

    const submit = await callTool(
      "submit_claim",
      { ticker: "AAPL", direction: "long", horizonDays: 30 },
      key,
    );
    expect(submit.isError).toBe(true);
    expect(submit.text).toContain("not bound to an agent");

    const note = await callTool("add_note", { claimId: claim.id, noteText: "zz" }, key);
    expect(note.isError).toBe(true);
    expect(note.text).toContain("not bound to an agent");
  });

  it("an agent's key does not reach the claims of the admin who minted it", async () => {
    const claim = await someoneElsesClaim();
    const agent = await mintAgent();
    const key = await mintKey(["claims:write"], {
      createdBy: claim.entityId,
      entityId: agent.id,
    });
    const note = await callTool("add_note", { claimId: claim.id, noteText: "zz" }, key);
    expect(note.isError).toBe(true);
    expect(note.text).toContain("your own claims");
    const stored = await db.select({ id: notes.id }).from(notes).where(eq(notes.entityId, agent.id));
    expect(stored).toEqual([]);
  });

  it("a key bound to anything but an agent cannot write", async () => {
    const [human] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.isAgent, false), isNotNull(entities.clerkUserId)))
      .limit(1);
    const key = await mintKey(["claims:write"], { entityId: human!.id });
    const submit = await callTool(
      "submit_claim",
      { ticker: "AAPL", direction: "long", horizonDays: 30 },
      key,
    );
    expect(submit.isError).toBe(true);
    expect(submit.text).toContain("not bound to an agent");
  });

  it("an agent's profile says it is an agent", async () => {
    const agent = await mintAgent();
    const key = await mintKey(["scores:read"]);
    const { text, isError } = await callTool(
      "get_entity_track_record",
      { slug: agent.slug },
      key,
    );
    expect(isError).toBe(false);
    expect(JSON.parse(text).entity.isAgent).toBe(true);
  });

  it.runIf(process.env.TEST_MCP_WRITES)("an agent's claim and note are its own", async () => {
    const claim = await someoneElsesClaim();
    const agent = await mintAgent();
    const key = await mintKey(["claims:write"], {
      createdBy: claim.entityId,
      entityId: agent.id,
    });

    const submitted = await callTool(
      "submit_claim",
      { ticker: "AAPL", direction: "long", horizonDays: 30 },
      key,
    );
    expect(submitted.isError).toBe(false);
    const { id } = JSON.parse(submitted.text);
    const [stored] = await db.select().from(claims).where(eq(claims.id, id));
    expect(stored?.entityId).toBe(agent.id);
    expect(stored?.entityId).not.toBe(claim.entityId);

    const note = await callTool("add_note", { claimId: id, noteText: "zz agent note" }, key);
    expect(note.isError).toBe(false);
    const [noted] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.claimId, id), ne(notes.entityId, claim.entityId)));
    expect(noted?.entityId).toBe(agent.id);
  });
});

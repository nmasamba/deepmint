import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { db, eq } from "@deepmint/db";
import { instruments } from "@deepmint/db/schema";
import { createCaller, createContext } from "@deepmint/api";
import { MAG7_TICKERS, RATIONALE_TAGS } from "@deepmint/shared";
import { authenticateRequest } from "../v1/lib/auth";
import { resolveAgentEntity } from "./agentEntity";

/**
 * Deepmint MCP server (streamable HTTP) for AI agents.
 *
 * READ tools expose the same aggregated data as the v1 REST API by calling the
 * tRPC routers via createCaller (single source of truth). WRITE tools let an
 * agent participate as a first-class entity — its claims are scored and audited
 * exactly like a human's. Auth reuses the dm_live_ API key + scope model: each
 * tool checks its own scope, the one the matching REST route needs, and write
 * tools need claims:write. Per invariant #9, only aggregated influence is ever
 * exposed (no raw influence events).
 */

/** Minimal structural shape of the MCP SDK's AuthInfo (avoids a deep subpath import). */
interface McpAuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  extra?: Record<string, unknown>;
}

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const errorText = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

/** The instrument for a Mag-7 ticker; any other ticker has none here. */
async function instrumentIdForTicker(ticker: string): Promise<string | null> {
  const symbol = ticker.toUpperCase();
  if (!(MAG7_TICKERS as readonly string[]).includes(symbol)) return null;
  const [row] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.ticker, symbol))
    .limit(1);
  return row?.id ?? null;
}

const notMag7 = (ticker: string) =>
  errorText(`${ticker} is not tracked. Deepmint covers the Mag 7: ${MAG7_TICKERS.join(", ")}.`);

/** The error to return when a key lacks a tool's scope, else null. */
function missingScope(authInfo: McpAuthInfo | undefined, scope: string) {
  return authInfo?.scopes.includes(scope)
    ? null
    : errorText(`API key missing required scope: ${scope}`);
}

function agentEntityId(authInfo: McpAuthInfo | undefined): string | null {
  const extra = authInfo?.extra as { entityId?: string | null } | undefined;
  return extra?.entityId ?? null;
}

const handler = createMcpHandler((server) => {
  const publicCaller = createCaller(
    createContext({ userId: null, entity: null }),
  );

  // ---- READ tools -------------------------------------------------------

  server.tool(
    "get_current_regime",
    "Get the current detected market regime (bull/bear/high_vol/low_vol/rotation) and its indicators (VIX, S&P 30d return, sector dispersion). Requires the consensus:read scope.",
    {},
    async (_args, extra) => {
      const denied = missingScope(extra.authInfo, "consensus:read");
      if (denied) return denied;
      const regime = await publicCaller.regime.current();
      return regime
        ? text(regime)
        : errorText("No market regime has been computed yet.");
    },
  );

  server.tool(
    "get_consensus",
    "Get the weighted consensus signal (direction + conviction) for a Mag-7 ticker: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA. Requires the consensus:read scope.",
    { ticker: z.string().describe("Mag-7 ticker symbol, e.g. AAPL") },
    async ({ ticker }, extra) => {
      const denied = missingScope(extra.authInfo, "consensus:read");
      if (denied) return denied;
      const id = await instrumentIdForTicker(ticker);
      if (!id) return notMag7(ticker);
      return text(await publicCaller.consensus.byInstrument({ instrumentId: id }));
    },
  );

  server.tool(
    "get_leaderboard",
    "Get top entities ranked by a metric (e.g. eiv_overall, hit_rate, sharpe). Optionally filter by entity type. Requires the leaderboard:read scope.",
    {
      metric: z.string().describe("Score metric, e.g. eiv_overall, hit_rate"),
      entityType: z.enum(["player", "guide"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ metric, entityType, limit }, extra) => {
      const denied = missingScope(extra.authInfo, "leaderboard:read");
      if (denied) return denied;
      return text(
        await publicCaller.leaderboard.top({
          metric,
          entityType,
          limit: limit ?? 25,
        }),
      );
    },
  );

  server.tool(
    "get_entity_track_record",
    "Get a Guide or Player's track record by slug: profile and verification status, latest scores, and active claims with their outcomes, newest first. Pass nextCursor back as cursor for older claims. Requires the scores:read scope.",
    {
      slug: z.string().describe("Entity slug"),
      limit: z.number().int().min(1).max(100).optional().describe("Claims per call, default 20"),
      cursor: z.string().optional().describe("nextCursor from the previous call"),
    },
    async ({ slug, limit, cursor }, extra) => {
      const denied = missingScope(extra.authInfo, "scores:read");
      if (denied) return denied;
      const entity = await publicCaller.entity.bySlug({ slug });
      const [scores, claims] = await Promise.all([
        publicCaller.scores.byEntity({ entityId: entity.id }),
        publicCaller.claims.list({ entityId: entity.id, limit: limit ?? 20, cursor }),
      ]);
      return text({ entity, scores, claims: claims.items, nextCursor: claims.nextCursor });
    },
  );

  server.tool(
    "search_instruments",
    "Search tracked instruments by ticker or name. Any valid key may call this.",
    { query: z.string().min(1).max(20) },
    async ({ query }) =>
      text(await publicCaller.instruments.search({ q: query })),
  );

  // ---- WRITE tools (require claims:write + an owning entity) -------------

  server.tool(
    "submit_claim",
    "Submit a directional prediction (claim) as the authenticated agent. Scored and audited like any participant. Requires the claims:write scope.",
    {
      ticker: z.string().describe("Mag-7 ticker symbol"),
      direction: z.enum(["long", "short", "neutral"]),
      horizonDays: z
        .number()
        .int()
        .describe("One of 1, 7, 30, 90, 180, 365"),
      targetPriceDollars: z.number().positive().optional(),
      confidence: z.number().int().min(0).max(100).optional(),
      rationale: z.string().max(5000).optional(),
      rationaleTags: z.array(z.enum(RATIONALE_TAGS)).max(10).optional(),
    },
    async (args, extra) => {
      const auth = extra.authInfo;
      const denied = missingScope(auth, "claims:write");
      if (denied) return denied;
      const entityId = agentEntityId(auth);
      if (!entityId) {
        return errorText(
          "API key is not bound to an entity; cannot submit claims.",
        );
      }
      const id = await instrumentIdForTicker(args.ticker);
      if (!id) return notMag7(args.ticker);

      try {
        const entity = await resolveAgentEntity(entityId);
        const caller = createCaller(
          createContext({
            userId: entity.clerkUserId ?? `agent:${entity.id}`,
            entity,
          }),
        );
        return text(
          await caller.claims.submit({
            instrumentId: id,
            direction: args.direction,
            horizonDays: args.horizonDays,
            targetPriceCents:
              args.targetPriceDollars != null
                ? Math.round(args.targetPriceDollars * 100)
                : undefined,
            confidence: args.confidence,
            rationale: args.rationale,
            rationaleTags: args.rationaleTags,
          }),
        );
      } catch (err) {
        return errorText(
          err instanceof Error ? err.message : "submit_claim failed",
        );
      }
    },
  );

  server.tool(
    "add_note",
    "Append an immutable note to one of your own claims (claims are append-only; corrections are added as notes). Requires the claims:write scope.",
    {
      claimId: z.string().uuid(),
      noteText: z.string().min(1).max(5000),
    },
    async (args, extra) => {
      const auth = extra.authInfo;
      const denied = missingScope(auth, "claims:write");
      if (denied) return denied;
      const entityId = agentEntityId(auth);
      if (!entityId) {
        return errorText("API key is not bound to an entity.");
      }
      try {
        const entity = await resolveAgentEntity(entityId);
        const caller = createCaller(
          createContext({
            userId: entity.clerkUserId ?? `agent:${entity.id}`,
            entity,
          }),
        );
        return text(
          await caller.claims.addNote({
            claimId: args.claimId,
            noteText: args.noteText,
          }),
        );
      } catch (err) {
        return errorText(
          err instanceof Error ? err.message : "add_note failed",
        );
      }
    },
  );
}, undefined, {
  // mcp-handler derives its endpoint as `${basePath}/mcp`. Without a base path
  // it answers only at "/mcp", so every request to this route (/api/mcp) 404'd.
  basePath: "/api",
});

/**
 * Transport-level auth: any valid dm_live_ key may open an MCP session, so a
 * claims:write-only agent key works. Each tool then checks its own scope.
 */
const verifyToken = async (
  req: Request,
  _bearerToken?: string,
): Promise<McpAuthInfo | undefined> => {
  const auth = await authenticateRequest(req, null);
  if (!auth.ok) return undefined;
  return {
    token: auth.key.id,
    clientId: auth.key.id,
    scopes: auth.key.scopes,
    extra: { entityId: auth.key.createdBy, keyId: auth.key.id },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export const GET = authHandler;
export const POST = authHandler;
export const DELETE = authHandler;

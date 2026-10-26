import { NextRequest } from "next/server";
import { createCaller, createContext } from "@deepmint/api";
import { SCORE_HORIZONS, REGIME_TAGS } from "@deepmint/shared";
import { authenticateRequest } from "../lib/auth";
import { jsonSuccess, jsonError, corsPreflight } from "../lib/response";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/v1/leaderboard
 *
 * Query params:
 *   - metric (required): e.g. "hit_rate", "sharpe", "eiv_overall"
 *   - entityType (optional): "player" | "guide"
 *   - horizon (optional): one of SCORE_HORIZONS, default "all"
 *   - regimeTag (optional): one of REGIME_TAGS
 *   - limit (optional): 1-100, default 25
 *
 * Rows come from tRPC leaderboard.top, the query behind the web and MCP
 * boards, so all three rank identically.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, "leaderboard:read");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const metric = searchParams.get("metric");
  if (!metric) {
    return jsonError(
      "BAD_REQUEST",
      "Missing required query param: metric",
      400,
      { rateLimit: auth.rateLimit },
    );
  }

  const entityType = searchParams.get("entityType");
  if (entityType && entityType !== "player" && entityType !== "guide") {
    return jsonError(
      "BAD_REQUEST",
      "entityType must be 'player' or 'guide'",
      400,
      { rateLimit: auth.rateLimit },
    );
  }

  const horizon = searchParams.get("horizon") ?? "all";
  if (!(SCORE_HORIZONS as readonly string[]).includes(horizon)) {
    return jsonError(
      "BAD_REQUEST",
      `horizon must be one of: ${SCORE_HORIZONS.join(", ")}`,
      400,
      { rateLimit: auth.rateLimit },
    );
  }

  const regimeTag = searchParams.get("regimeTag") ?? undefined;
  if (regimeTag && !(REGIME_TAGS as readonly string[]).includes(regimeTag)) {
    return jsonError(
      "BAD_REQUEST",
      `regimeTag must be one of: ${REGIME_TAGS.join(", ")}`,
      400,
      { rateLimit: auth.rateLimit },
    );
  }

  const limitRaw = Number(searchParams.get("limit") ?? "25");
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 25 : limitRaw), 100);

  const rows = await createCaller(
    createContext({ userId: null, entity: null }),
  ).leaderboard.top({
    metric,
    entityType: (entityType as "player" | "guide" | null) ?? undefined,
    horizon,
    regimeTag,
    limit,
  });

  return jsonSuccess(
    {
      metric,
      horizon,
      regimeTag: regimeTag ?? null,
      asOfDate: rows[0]?.asOfDate ?? null,
      rows: rows.map((r) => ({
        rank: r.rank,
        entity: {
          slug: r.entity.slug,
          displayName: r.entity.displayName,
          type: r.entity.type,
          verified: r.entity.brokerLinkStatus === "verified",
        },
        score: r.score,
        horizon: r.horizon,
        regimeTag: r.regimeTag,
      })),
    },
    { rateLimit: auth.rateLimit },
  );
}

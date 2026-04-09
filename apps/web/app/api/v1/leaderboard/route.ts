import { NextRequest } from "next/server";
import { db, eq, and, desc } from "@deepmint/db";
import { scores, entities } from "@deepmint/db/schema";
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
 *   - horizon (optional): "3m" | "6m" | "12m" | "all"
 *   - regimeTag (optional): "bull" | "bear" | "high_vol" | "low_vol" | "rotation"
 *   - limit (optional): 1-100, default 25
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

  const horizon = searchParams.get("horizon") ?? undefined;
  const regimeTag = searchParams.get("regimeTag") ?? undefined;
  const limitRaw = Number(searchParams.get("limit") ?? "25");
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 25 : limitRaw), 100);

  const conditions = [eq(scores.metric, metric)];
  if (horizon) conditions.push(eq(scores.horizon, horizon));
  if (regimeTag) conditions.push(eq(scores.regimeTag, regimeTag));

  // Most-recent as_of_date for this metric
  const [latestDate] = await db
    .select({ asOfDate: scores.asOfDate })
    .from(scores)
    .where(eq(scores.metric, metric))
    .orderBy(desc(scores.asOfDate))
    .limit(1);

  if (!latestDate) {
    return jsonSuccess(
      { metric, horizon, regimeTag, rows: [] },
      { rateLimit: auth.rateLimit },
    );
  }

  conditions.push(eq(scores.asOfDate, latestDate.asOfDate));

  const rows = await db
    .select({
      entityId: scores.entityId,
      value: scores.value,
      horizon: scores.horizon,
      regimeTag: scores.regimeTag,
      displayName: entities.displayName,
      slug: entities.slug,
      type: entities.type,
      brokerLinkStatus: entities.brokerLinkStatus,
    })
    .from(scores)
    .innerJoin(entities, eq(scores.entityId, entities.id))
    .where(and(...conditions))
    .orderBy(desc(scores.value))
    .limit(limit * 2); // fetch extra to allow type filtering

  const filtered = entityType
    ? rows.filter((r) => r.type === entityType)
    : rows;

  const trimmed = filtered.slice(0, limit);

  return jsonSuccess(
    {
      metric,
      horizon: horizon ?? null,
      regimeTag: regimeTag ?? null,
      asOfDate: latestDate.asOfDate,
      rows: trimmed.map((r, i) => ({
        rank: i + 1,
        entity: {
          slug: r.slug,
          displayName: r.displayName,
          type: r.type,
          verified: r.brokerLinkStatus === "verified",
        },
        score: parseFloat(r.value),
        horizon: r.horizon,
        regimeTag: r.regimeTag,
      })),
    },
    { rateLimit: auth.rateLimit },
  );
}

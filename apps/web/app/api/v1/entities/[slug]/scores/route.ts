import { NextRequest } from "next/server";
import { db, eq, desc } from "@deepmint/db";
import { entities, scores } from "@deepmint/db/schema";
import { authenticateRequest } from "../../../lib/auth";
import { jsonSuccess, jsonError, corsPreflight } from "../../../lib/response";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/v1/entities/:slug/scores
 *
 * Returns the latest scores for an entity across all metrics.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateRequest(req, "scores:read");
  if (!auth.ok) return auth.response;

  const { slug } = await params;

  const [entity] = await db
    .select({
      id: entities.id,
      slug: entities.slug,
      displayName: entities.displayName,
      type: entities.type,
      brokerLinkStatus: entities.brokerLinkStatus,
    })
    .from(entities)
    .where(eq(entities.slug, slug))
    .limit(1);

  if (!entity) {
    return jsonError("NOT_FOUND", `Entity ${slug} not found`, 404, {
      rateLimit: auth.rateLimit,
    });
  }

  // Latest scores per metric for this entity
  const rows = await db
    .select({
      metric: scores.metric,
      value: scores.value,
      horizon: scores.horizon,
      regimeTag: scores.regimeTag,
      asOfDate: scores.asOfDate,
    })
    .from(scores)
    .where(eq(scores.entityId, entity.id))
    .orderBy(desc(scores.asOfDate))
    .limit(500);

  // Deduplicate to keep only the most recent value per (metric, horizon, regime)
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.metric}|${row.horizon ?? ""}|${row.regimeTag ?? ""}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  return jsonSuccess(
    {
      entity: {
        slug: entity.slug,
        displayName: entity.displayName,
        type: entity.type,
        verified: entity.brokerLinkStatus === "verified",
      },
      scores: Array.from(latest.values()).map((r) => ({
        metric: r.metric,
        value: parseFloat(r.value),
        horizon: r.horizon,
        regimeTag: r.regimeTag,
        asOfDate: r.asOfDate,
      })),
    },
    { rateLimit: auth.rateLimit },
  );
}

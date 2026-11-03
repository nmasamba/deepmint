import { and, desc, eq, isNull, sql } from "@deepmint/db";
import type { db as Db } from "@deepmint/db";
import { claims, entities, outcomes } from "@deepmint/db/schema";

/** Scored outcomes on one instrument an entity needs to be ranked on it. */
export const MIN_TICKER_SAMPLE = 3;

/**
 * Entities ranked by hit rate on one instrument, from the outcomes of their
 * active claims on it (`scores` has no instrument column). Only entities with
 * at least MIN_TICKER_SAMPLE outcomes there are listed; ties go to the higher
 * average return, then the larger sample.
 */
export async function topByInstrument(
  db: typeof Db,
  instrumentId: string,
  opts: { entityType?: "guide" | "player"; limit: number },
) {
  const n = sql<number>`count(*)::int`;
  const hitRate = sql<number>`avg(case when ${outcomes.directionCorrect} then 1 else 0 end)::float8`;
  const avgReturnBps = sql<number>`round(avg(${outcomes.returnBps}))::int`;
  return db
    .select({
      entity: {
        id: entities.id,
        displayName: entities.displayName,
        slug: entities.slug,
        type: entities.type,
        avatarUrl: entities.avatarUrl,
        isVerified: entities.isVerified,
        brokerLinkStatus: entities.brokerLinkStatus,
      },
      outcomes: n,
      hitRate,
      avgReturnBps,
    })
    .from(outcomes)
    .innerJoin(claims, eq(outcomes.claimId, claims.id))
    .innerJoin(entities, eq(claims.entityId, entities.id))
    .where(
      and(
        eq(outcomes.instrumentId, instrumentId),
        eq(claims.status, "active"),
        isNull(entities.deletedAt),
        opts.entityType ? eq(entities.type, opts.entityType) : undefined,
      ),
    )
    .groupBy(entities.id)
    .having(sql`count(*) >= ${MIN_TICKER_SAMPLE}`)
    .orderBy(desc(hitRate), desc(avgReturnBps), desc(n))
    .limit(opts.limit);
}

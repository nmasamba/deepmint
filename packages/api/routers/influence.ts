import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { db, desc, eq, sql } from "@deepmint/db";
import { influenceScores, entities, follows, instruments } from "@deepmint/db/schema";

/**
 * Influence router — exposes ONLY aggregated influence_scores.
 * Raw influence_events are NEVER exposed through the API.
 */
export const influenceRouter = router({
  /** Top influencers by 30-day influence events. Public endpoint. */
  topInfluencers: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ input }) => {
      // Get latest date with influence scores
      const [latestDate] = await db
        .select({ asOfDate: influenceScores.asOfDate })
        .from(influenceScores)
        .orderBy(desc(influenceScores.asOfDate))
        .limit(1);

      if (!latestDate) return [];

      const rows = await db
        .select({
          guideEntityId: influenceScores.guideEntityId,
          followerCount: influenceScores.followerCount,
          influenceEvents30d: influenceScores.influenceEvents30d,
          avgLagHours: influenceScores.avgLagHours,
          topInstruments: influenceScores.topInstruments,
          entityName: entities.displayName,
          entitySlug: entities.slug,
          entityAvatar: entities.avatarUrl,
        })
        .from(influenceScores)
        .innerJoin(entities, eq(influenceScores.guideEntityId, entities.id))
        .where(eq(influenceScores.asOfDate, latestDate.asOfDate))
        .orderBy(desc(influenceScores.influenceEvents30d))
        .limit(input.limit);

      return rows.map((row, i) => ({
        rank: i + 1,
        entity: {
          id: row.guideEntityId,
          displayName: row.entityName,
          slug: row.entitySlug,
          avatarUrl: row.entityAvatar,
        },
        followerCount: row.followerCount,
        influenceEvents30d: row.influenceEvents30d,
        avgLagHours: row.avgLagHours ? parseFloat(row.avgLagHours) : null,
        topInstruments: row.topInstruments,
      }));
    }),

  /** Aggregated influence data for a specific Guide. Public endpoint. */
  byGuide: publicProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Get latest score for this guide
      const [score] = await db
        .select()
        .from(influenceScores)
        .where(eq(influenceScores.guideEntityId, input.entityId))
        .orderBy(desc(influenceScores.asOfDate))
        .limit(1);

      if (!score) {
        return {
          followerCount: 0,
          influenceEvents30d: 0,
          avgLagHours: null,
          topInstruments: [] as string[],
        };
      }

      // Resolve instrument IDs to tickers
      const instrumentIds = (score.topInstruments ?? []) as string[];
      let topInstrumentTickers: string[] = [];
      if (instrumentIds.length > 0) {
        const instrumentRows = await db
          .select({ id: instruments.id, ticker: instruments.ticker })
          .from(instruments)
          .where(
            sql`${instruments.id} IN (${sql.join(instrumentIds.map(id => sql`${id}`), sql`, `)})`,
          );
        const tickerMap = new Map(instrumentRows.map((r) => [r.id, r.ticker]));
        topInstrumentTickers = instrumentIds
          .map((id) => tickerMap.get(id))
          .filter((t): t is string => !!t);
      }

      return {
        followerCount: score.followerCount,
        influenceEvents30d: score.influenceEvents30d,
        avgLagHours: score.avgLagHours ? parseFloat(score.avgLagHours) : null,
        topInstruments: topInstrumentTickers,
      };
    }),

  /** For a Player: which Guides have influenced their actions. Protected endpoint. */
  myInfluencers: protectedProcedure.query(async ({ ctx }) => {
    // Get guides the player follows
    const guidesFollowed = await db
      .select({ followedId: follows.followedId })
      .from(follows)
      .where(eq(follows.followerId, ctx.entity.id));

    if (guidesFollowed.length === 0) return [];

    const guideIds = guidesFollowed.map((f) => f.followedId);

    // Get latest influence scores for these guides
    const rows = await db
      .select({
        guideEntityId: influenceScores.guideEntityId,
        influenceEvents30d: influenceScores.influenceEvents30d,
        avgLagHours: influenceScores.avgLagHours,
        entityName: entities.displayName,
        entitySlug: entities.slug,
        entityAvatar: entities.avatarUrl,
      })
      .from(influenceScores)
      .innerJoin(entities, eq(influenceScores.guideEntityId, entities.id))
      .where(
        sql`${influenceScores.guideEntityId} IN (${sql.join(guideIds.map(id => sql`${id}`), sql`, `)})`,
      )
      .orderBy(desc(influenceScores.influenceEvents30d));

    // Deduplicate to latest per guide
    const seen = new Set<string>();
    return rows
      .filter((row) => {
        if (seen.has(row.guideEntityId)) return false;
        seen.add(row.guideEntityId);
        return true;
      })
      .map((row) => ({
        entity: {
          id: row.guideEntityId,
          displayName: row.entityName,
          slug: row.entitySlug,
          avatarUrl: row.entityAvatar,
        },
        influenceEvents30d: row.influenceEvents30d,
        avgLagHours: row.avgLagHours ? parseFloat(row.avgLagHours) : null,
      }));
  }),
});

import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { db, desc, eq, and, sql } from "@deepmint/db";
import { scores, entities } from "@deepmint/db/schema";
import { detectRegime } from "@deepmint/scoring";

export const leaderboardRouter = router({
  /**
   * Top entities by metric. Public endpoint.
   */
  top: publicProcedure
    .input(
      z.object({
        metric: z.string().min(1),
        entityType: z.enum(["player", "guide"]).optional(),
        horizon: z.string().optional(),
        regimeTag: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ input }) => {
      // Build WHERE conditions
      const conditions = [eq(scores.metric, input.metric)];

      if (input.horizon) {
        conditions.push(eq(scores.horizon, input.horizon));
      }
      if (input.regimeTag) {
        conditions.push(eq(scores.regimeTag, input.regimeTag));
      }

      // Get latest as_of_date for this metric
      const [latestDate] = await db
        .select({ asOfDate: scores.asOfDate })
        .from(scores)
        .where(eq(scores.metric, input.metric))
        .orderBy(desc(scores.asOfDate))
        .limit(1);

      if (!latestDate) return [];

      conditions.push(eq(scores.asOfDate, latestDate.asOfDate));

      const rows = await db
        .select({
          entityId: scores.entityId,
          value: scores.value,
          horizon: scores.horizon,
          regimeTag: scores.regimeTag,
          asOfDate: scores.asOfDate,
          entityName: entities.displayName,
          entitySlug: entities.slug,
          entityType: entities.type,
          entityAvatar: entities.avatarUrl,
        })
        .from(scores)
        .innerJoin(entities, eq(scores.entityId, entities.id))
        .where(and(...conditions))
        .orderBy(desc(scores.value))
        .limit(input.limit);

      // Filter by entity type in app if specified
      const filtered = input.entityType
        ? rows.filter((r) => r.entityType === input.entityType)
        : rows;

      return filtered.map((row, i) => ({
        rank: i + 1,
        entity: {
          id: row.entityId,
          displayName: row.entityName,
          slug: row.entitySlug,
          type: row.entityType,
          avatarUrl: row.entityAvatar,
        },
        score: parseFloat(row.value),
        horizon: row.horizon,
        regimeTag: row.regimeTag,
      }));
    }),

  /**
   * Top entities for a specific instrument by hit rate.
   */
  byTicker: publicProcedure
    .input(
      z.object({
        ticker: z.string().min(1),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      // This requires joining through claims → outcomes → entities → scores
      // For now, return top entities by overall hit_rate
      return db
        .select({
          entityId: scores.entityId,
          value: scores.value,
          entityName: entities.displayName,
          entitySlug: entities.slug,
          entityType: entities.type,
        })
        .from(scores)
        .innerJoin(entities, eq(scores.entityId, entities.id))
        .where(eq(scores.metric, "hit_rate"))
        .orderBy(desc(scores.value))
        .limit(input.limit);
    }),

  /**
   * Best entities in current market conditions.
   * Auto-detects regime and returns top entities by EIV within that regime.
   */
  bestInCurrentConditions: publicProcedure
    .input(
      z.object({
        entityType: z.enum(["player", "guide"]).optional(),
        limit: z.number().min(1).max(25).default(5),
      }),
    )
    .query(async ({ input }) => {
      // Detect current regime (placeholder data — live in Sprint 6)
      const currentRegime = detectRegime({
        sp500Return30d: 0.01,
        vixLevel: 18,
        sectorDispersion: 0.08,
      });

      const conditions = [
        eq(scores.metric, "eiv_overall"),
        eq(scores.regimeTag, currentRegime),
      ];

      // Get latest date with this regime+metric combo
      const [latestDate] = await db
        .select({ asOfDate: scores.asOfDate })
        .from(scores)
        .where(and(...conditions))
        .orderBy(desc(scores.asOfDate))
        .limit(1);

      if (!latestDate) return { regime: currentRegime, entities: [] };

      conditions.push(eq(scores.asOfDate, latestDate.asOfDate));

      const rows = await db
        .select({
          entityId: scores.entityId,
          value: scores.value,
          entityName: entities.displayName,
          entitySlug: entities.slug,
          entityType: entities.type,
          entityAvatar: entities.avatarUrl,
        })
        .from(scores)
        .innerJoin(entities, eq(scores.entityId, entities.id))
        .where(and(...conditions))
        .orderBy(desc(scores.value))
        .limit(input.limit);

      const filtered = input.entityType
        ? rows.filter((r) => r.entityType === input.entityType)
        : rows;

      return {
        regime: currentRegime,
        entities: filtered.map((row, i) => ({
          rank: i + 1,
          entity: {
            id: row.entityId,
            displayName: row.entityName,
            slug: row.entitySlug,
            type: row.entityType,
            avatarUrl: row.entityAvatar,
          },
          eivScore: parseFloat(row.value),
        })),
      };
    }),
});

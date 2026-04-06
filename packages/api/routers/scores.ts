import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { db, eq, desc, and } from "@deepmint/db";
import { scores } from "@deepmint/db/schema";

export const scoresRouter = router({
  /**
   * All latest scores for an entity.
   */
  byEntity: publicProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Get the latest as_of_date for this entity
      const [latestDate] = await db
        .select({ asOfDate: scores.asOfDate })
        .from(scores)
        .where(eq(scores.entityId, input.entityId))
        .orderBy(desc(scores.asOfDate))
        .limit(1);

      if (!latestDate) return [];

      return db
        .select()
        .from(scores)
        .where(
          and(
            eq(scores.entityId, input.entityId),
            eq(scores.asOfDate, latestDate.asOfDate)
          )
        );
    }),

  /**
   * Score time series for a specific metric (for charting).
   */
  history: publicProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        metric: z.string().min(1),
        horizon: z.string().optional(),
        limit: z.number().min(1).max(365).default(90),
      })
    )
    .query(async ({ input }) => {
      const conditions = [
        eq(scores.entityId, input.entityId),
        eq(scores.metric, input.metric),
      ];
      if (input.horizon) {
        conditions.push(eq(scores.horizon, input.horizon));
      }

      return db
        .select({
          value: scores.value,
          asOfDate: scores.asOfDate,
          regimeTag: scores.regimeTag,
        })
        .from(scores)
        .where(and(...conditions))
        .orderBy(desc(scores.asOfDate))
        .limit(input.limit);
    }),
});

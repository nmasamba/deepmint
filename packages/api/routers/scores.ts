import { z } from "zod";
import { memberProcedure, router } from "../trpc";
import { db, eq, desc, and } from "@deepmint/db";
import { scores } from "@deepmint/db/schema";

export const scoresRouter = router({
  /**
   * All latest scores for an entity.
   */
  byEntity: memberProcedure
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
});

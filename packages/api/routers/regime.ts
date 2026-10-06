import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { db, desc, sql } from "@deepmint/db";
import { scores } from "@deepmint/db/schema";
import type { MarketRegime } from "@deepmint/scoring";
import { getLatestMarketRegime } from "../lib/marketRegime";

export const regimeRouter = router({
  /**
   * The latest stored market regime (one snapshot per weekday, computed in the
   * background), or null before the first snapshot exists. Never computes the
   * regime here: that takes ~25 throttled Polygon calls.
   */
  current: publicProcedure.query(() => getLatestMarketRegime()),

  /** Historical regime tags from scored data. */
  history: publicProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(90),
      }),
    )
    .query(async ({ input }) => {
      const cutoff = new Date(
        Date.now() - input.days * 86400000,
      ).toISOString().slice(0, 10);

      const rows = await db
        .select({
          asOfDate: scores.asOfDate,
          regimeTag: scores.regimeTag,
        })
        .from(scores)
        .where(
          sql`${scores.asOfDate} >= ${cutoff} AND ${scores.regimeTag} IS NOT NULL`,
        )
        .groupBy(scores.asOfDate, scores.regimeTag)
        // Order by date, then by frequency within each date, so the dedup loop
        // below keeps the most common regime per date (not an arbitrary one).
        .orderBy(desc(scores.asOfDate), desc(sql`count(*)`));

      // Deduplicate to one regime per date (first seen = highest count)
      const dateMap = new Map<string, string>();
      for (const row of rows) {
        if (!dateMap.has(row.asOfDate)) {
          dateMap.set(row.asOfDate, row.regimeTag!);
        }
      }

      return Array.from(dateMap.entries()).map(([date, regime]) => ({
        date,
        regime: regime as MarketRegime,
      }));
    }),
});

import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { db, desc, sql } from "@deepmint/db";
import { scores } from "@deepmint/db/schema";
import { detectRegime } from "@deepmint/scoring";
import type { MarketRegime } from "@deepmint/scoring";

export const regimeRouter = router({
  /** Get the current detected market regime. */
  current: publicProcedure.query(async () => {
    // Placeholder indicators — will be replaced with live VIX/S&P data in Sprint 6
    const regime = detectRegime({
      sp500Return30d: 0.01,
      vixLevel: 18,
      sectorDispersion: 0.08,
    });

    return {
      regime,
      detectedAt: new Date().toISOString(),
      indicators: {
        sp500Return30d: 0.01,
        vixLevel: 18,
        sectorDispersion: 0.08,
      },
    };
  }),

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
        .orderBy(desc(scores.asOfDate));

      // Deduplicate to one regime per date (take most common)
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

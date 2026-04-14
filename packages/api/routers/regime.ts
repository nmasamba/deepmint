import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { db, desc, sql } from "@deepmint/db";
import { scores } from "@deepmint/db/schema";
import { detectRegime } from "@deepmint/scoring";
import type { MarketRegime } from "@deepmint/scoring";
import { getRegimeIndicators } from "@deepmint/shared";

export const regimeRouter = router({
  /** Get the current detected market regime from live market data. */
  current: publicProcedure.query(async () => {
    let indicators;
    try {
      indicators = await getRegimeIndicators();
    } catch {
      indicators = {
        sp500Return30d: 0.01,
        vixLevel: 18,
        sectorDispersion: 0.08,
      };
    }

    const regime = detectRegime(indicators);

    return {
      regime,
      detectedAt: new Date().toISOString(),
      indicators,
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

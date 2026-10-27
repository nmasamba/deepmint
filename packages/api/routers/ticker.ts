import { z } from "zod";
import { eq, desc } from "@deepmint/db";
import { instruments, consensusSignals } from "@deepmint/db/schema";
import { router, publicProcedure } from "../trpc";
import { MAG7_TICKERS } from "@deepmint/shared";
import { topByInstrument } from "../lib/topByInstrument";

export const tickerRouter = router({
  /**
   * Aggregated overview for a single ticker: instrument, consensus signal,
   * and the top Guides and Players on that ticker.
   */
  overview: publicProcedure
    .input(z.object({ ticker: z.string().min(1).max(10) }))
    .query(async ({ ctx, input }) => {
      const ticker = input.ticker.toUpperCase();
      const isMag7 = (MAG7_TICKERS as readonly string[]).includes(ticker);

      if (!isMag7) {
        return { isMag7: false as const, ticker };
      }

      // Fetch instrument
      const [instrument] = await ctx.db
        .select()
        .from(instruments)
        .where(eq(instruments.ticker, ticker))
        .limit(1);

      if (!instrument) {
        return { isMag7: false as const, ticker };
      }

      const [consensus, topGuides, topPlayers] = await Promise.all([
        // Latest consensus signal
        ctx.db
          .select()
          .from(consensusSignals)
          .where(eq(consensusSignals.instrumentId, instrument.id))
          .orderBy(desc(consensusSignals.asOfDate))
          .limit(1)
          .then((rows: Array<typeof consensusSignals.$inferSelect>) => rows[0] ?? null),

        // Top 5 Guides and Players by hit rate on this instrument
        topByInstrument(ctx.db, instrument.id, { entityType: "guide", limit: 5 }),
        topByInstrument(ctx.db, instrument.id, { entityType: "player", limit: 5 }),
      ]);

      return {
        isMag7: true as const,
        ticker,
        instrument,
        consensus,
        topGuides,
        topPlayers,
      };
    }),
});

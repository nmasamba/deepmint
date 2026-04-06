import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { db, eq, desc } from "@deepmint/db";
import { consensusSignals, instruments } from "@deepmint/db/schema";

export const consensusRouter = router({
  /**
   * Latest consensus signal for a single instrument.
   */
  byInstrument: publicProcedure
    .input(z.object({ instrumentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [signal] = await db
        .select()
        .from(consensusSignals)
        .where(eq(consensusSignals.instrumentId, input.instrumentId))
        .orderBy(desc(consensusSignals.asOfDate))
        .limit(1);

      return signal ?? null;
    }),

  /**
   * Latest consensus signals for all Mag 7 instruments.
   */
  mag7: publicProcedure.query(async () => {
    const allInstruments = await db
      .select({ id: instruments.id, ticker: instruments.ticker, name: instruments.name })
      .from(instruments)
      .where(eq(instruments.isActive, true));

    const result = [];

    for (const inst of allInstruments) {
      const [signal] = await db
        .select()
        .from(consensusSignals)
        .where(eq(consensusSignals.instrumentId, inst.id))
        .orderBy(desc(consensusSignals.asOfDate))
        .limit(1);

      result.push({
        instrument: inst,
        signal: signal ?? null,
      });
    }

    return result;
  }),

  /**
   * Daily signal history for charting.
   */
  history: publicProcedure
    .input(
      z.object({
        instrumentId: z.string().uuid(),
        limit: z.number().min(1).max(365).default(30),
      })
    )
    .query(async ({ input }) => {
      return db
        .select()
        .from(consensusSignals)
        .where(eq(consensusSignals.instrumentId, input.instrumentId))
        .orderBy(desc(consensusSignals.asOfDate))
        .limit(input.limit);
    }),
});

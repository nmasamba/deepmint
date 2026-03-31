import { z } from "zod";
import { eq, ilike, or, desc, and, lt, sql } from "drizzle-orm";
import { instruments, consensusSignals } from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";

const marketCapOrder = sql`CASE
  WHEN ${instruments.marketCapBucket} = 'mega' THEN 1
  WHEN ${instruments.marketCapBucket} = 'large' THEN 2
  WHEN ${instruments.marketCapBucket} = 'mid' THEN 3
  WHEN ${instruments.marketCapBucket} = 'small' THEN 4
  WHEN ${instruments.marketCapBucket} = 'micro' THEN 5
  ELSE 6
END`;

export const instrumentRouter = router({
  /** Search instruments by ticker or name */
  search: publicProcedure
    .input(
      z.object({
        q: z.string().min(1).max(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.q}%`;
      const results = await ctx.db
        .select()
        .from(instruments)
        .where(
          and(
            eq(instruments.isActive, true),
            or(
              ilike(instruments.ticker, pattern),
              ilike(instruments.name, pattern),
            ),
          ),
        )
        .orderBy(marketCapOrder)
        .limit(10);
      return results;
    }),

  /** Get instrument details by ID or ticker, with latest consensus signal */
  detail: publicProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        ticker: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.id && !input.ticker) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either id or ticker must be provided",
        });
      }

      const condition = input.id
        ? eq(instruments.id, input.id)
        : eq(instruments.ticker, input.ticker!);

      const [instrument] = await ctx.db
        .select()
        .from(instruments)
        .where(condition)
        .limit(1);

      if (!instrument) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instrument not found",
        });
      }

      // Fetch latest consensus signal
      const [consensus] = await ctx.db
        .select()
        .from(consensusSignals)
        .where(eq(consensusSignals.instrumentId, instrument.id))
        .orderBy(desc(consensusSignals.asOfDate))
        .limit(1);

      return {
        ...instrument,
        consensusSignal: consensus ?? null,
      };
    }),

  /** Paginated list with filters */
  list: publicProcedure
    .input(
      z.object({
        assetClass: z
          .enum(["equity", "etf", "crypto", "forex", "commodity", "index"])
          .optional(),
        sector: z.string().optional(),
        exchange: z.enum(["NYSE", "NASDAQ", "AMEX"]).optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(instruments.isActive, true)];

      if (input.assetClass) {
        conditions.push(eq(instruments.assetClass, input.assetClass));
      }
      if (input.sector) {
        conditions.push(eq(instruments.sector, input.sector));
      }
      if (input.exchange) {
        conditions.push(eq(instruments.exchange, input.exchange));
      }
      if (input.cursor) {
        conditions.push(lt(instruments.id, input.cursor));
      }

      const results = await ctx.db
        .select()
        .from(instruments)
        .where(and(...conditions))
        .orderBy(marketCapOrder)
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      const items = hasMore ? results.slice(0, -1) : results;

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
      };
    }),

  /** Get all Mag 7 instruments with their latest consensus signals */
  mag7: publicProcedure.query(async ({ ctx }) => {
    const mag7Tickers = [
      "AAPL",
      "MSFT",
      "GOOGL",
      "AMZN",
      "NVDA",
      "META",
      "TSLA",
    ];

    const allInstruments = await ctx.db
      .select()
      .from(instruments)
      .where(
        and(
          eq(instruments.isActive, true),
          sql`${instruments.ticker} = ANY(${mag7Tickers})`,
        ),
      )
      .orderBy(marketCapOrder);

    // Get latest consensus for each instrument
    const results = await Promise.all(
      allInstruments.map(async (instrument) => {
        const [consensus] = await ctx.db
          .select()
          .from(consensusSignals)
          .where(eq(consensusSignals.instrumentId, instrument.id))
          .orderBy(desc(consensusSignals.asOfDate))
          .limit(1);

        return {
          ...instrument,
          consensusSignal: consensus ?? null,
        };
      }),
    );

    return results;
  }),
});

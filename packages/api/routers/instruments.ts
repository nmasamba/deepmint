import { z } from "zod";
import { eq, ilike, or, desc, and, lt, sql } from "@deepmint/db";
import {
  instruments,
  consensusSignals,
  tickerRequests,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { Inngest } from "inngest";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
} from "../trpc";

const inngest = new Inngest({ id: "deepmint" });

const assetClassValues = [
  "equity",
  "etf",
  "crypto",
  "forex",
  "commodity",
  "index",
] as const;
const exchangeValues = ["NYSE", "NASDAQ", "AMEX"] as const;

const instrumentInputSchema = z.object({
  ticker: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  assetClass: z.enum(assetClassValues).default("equity"),
  exchange: z.enum(exchangeValues).optional(),
  sector: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  marketCapBucket: z.enum(["mega", "large", "mid", "small", "micro"]).optional(),
  figi: z.string().max(12).optional(),
  isin: z.string().max(12).optional(),
});

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

  /** Admin: paginated list including inactive instruments */
  adminList: adminProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(true),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (!input.includeInactive) {
        conditions.push(eq(instruments.isActive, true));
      }
      if (input.cursor) {
        conditions.push(lt(instruments.id, input.cursor));
      }

      const results = await ctx.db
        .select()
        .from(instruments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(instruments.id))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      const items = hasMore ? results.slice(0, -1) : results;

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
      };
    }),

  /** Admin: create a single instrument */
  adminCreate: adminProcedure
    .input(instrumentInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate by ticker + exchange
      const existing = await ctx.db
        .select({ id: instruments.id })
        .from(instruments)
        .where(
          and(
            eq(instruments.ticker, input.ticker),
            input.exchange
              ? eq(instruments.exchange, input.exchange)
              : sql`${instruments.exchange} IS NULL`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Instrument ${input.ticker} already exists on ${input.exchange ?? "unknown exchange"}`,
        });
      }

      const [created] = await ctx.db
        .insert(instruments)
        .values({
          ticker: input.ticker,
          name: input.name,
          assetClass: input.assetClass,
          exchange: input.exchange,
          sector: input.sector,
          industry: input.industry,
          marketCapBucket: input.marketCapBucket,
          figi: input.figi,
          isin: input.isin,
          isActive: true,
        })
        .returning();

      // Trigger price backfill for the new instrument
      await inngest.send({
        name: "instruments/batch-added",
        data: { instrumentIds: [created.id] },
      });

      return created;
    }),

  /** Admin: batch insert instruments (idempotent - skips duplicates) */
  adminBatchCreate: adminProcedure
    .input(
      z.object({
        instruments: z.array(instrumentInputSchema).min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const created: string[] = [];
      const skipped: string[] = [];

      for (const row of input.instruments) {
        const existing = await ctx.db
          .select({ id: instruments.id })
          .from(instruments)
          .where(eq(instruments.ticker, row.ticker))
          .limit(1);

        if (existing.length > 0) {
          skipped.push(row.ticker);
          continue;
        }

        const [inserted] = await ctx.db
          .insert(instruments)
          .values({
            ticker: row.ticker,
            name: row.name,
            assetClass: row.assetClass,
            exchange: row.exchange,
            sector: row.sector,
            industry: row.industry,
            marketCapBucket: row.marketCapBucket,
            figi: row.figi,
            isin: row.isin,
            isActive: true,
          })
          .returning({ id: instruments.id });

        if (inserted) created.push(inserted.id);
      }

      if (created.length > 0) {
        await inngest.send({
          name: "instruments/batch-added",
          data: { instrumentIds: created },
        });
      }

      return {
        createdCount: created.length,
        skippedCount: skipped.length,
        skippedTickers: skipped,
      };
    }),

  /** Admin: toggle active status */
  adminToggleActive: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(instruments)
        .set({ isActive: input.isActive })
        .where(eq(instruments.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instrument not found",
        });
      }

      return updated;
    }),

  /** User: submit a ticker request (for instruments not yet in the system) */
  requestTicker: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(20).toUpperCase(),
        reason: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if ticker already exists
      const existing = await ctx.db
        .select({ id: instruments.id })
        .from(instruments)
        .where(eq(instruments.ticker, input.ticker))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${input.ticker} is already tracked`,
        });
      }

      // Check for existing pending request from this user
      const existingRequest = await ctx.db
        .select({ id: tickerRequests.id })
        .from(tickerRequests)
        .where(
          and(
            eq(tickerRequests.entityId, ctx.entity.id),
            eq(tickerRequests.ticker, input.ticker),
            eq(tickerRequests.status, "pending"),
          ),
        )
        .limit(1);

      if (existingRequest.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have a pending request for this ticker",
        });
      }

      const [created] = await ctx.db
        .insert(tickerRequests)
        .values({
          entityId: ctx.entity.id,
          ticker: input.ticker,
          reason: input.reason,
          status: "pending",
        })
        .returning();

      return created;
    }),

  /** Admin: list ticker requests */
  listRequests: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.status) {
        conditions.push(eq(tickerRequests.status, input.status));
      }

      const results = await ctx.db
        .select()
        .from(tickerRequests)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(tickerRequests.createdAt))
        .limit(input.limit);

      return results;
    }),

  /** Admin: approve or reject a ticker request */
  reviewRequest: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(tickerRequests)
        .set({
          status: input.status,
          reviewedAt: new Date(),
          reviewedBy: ctx.entity.id,
        })
        .where(eq(tickerRequests.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticker request not found",
        });
      }

      return updated;
    }),
});

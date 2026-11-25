import { z } from "zod";
import { eq, ilike, or, desc, and, lt, sql, inArray } from "@deepmint/db";
import {
  instruments,
  tickerRequests,
  PRICEABLE_ASSET_CLASSES,
} from "@deepmint/db/schema";
import { COVERED_TICKERS } from "@deepmint/shared";
import { TRPCError } from "@trpc/server";
import { Inngest } from "inngest";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
} from "../trpc";

const inngest = new Inngest({ id: "deepmint" });

// Only equity and ETF instruments can be priced: pricing always calls
// Polygon's stocks endpoints.
const assetClassValues = PRICEABLE_ASSET_CLASSES;
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
  /** Search covered instruments by ticker or name */
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
            // Only covered tickers: an admin-added instrument stays out of
            // the claim form, paper trades and MCP search until coverage widens.
            inArray(instruments.ticker, [...COVERED_TICKERS]),
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

  /** Admin: paginated list including inactive instruments */
  adminList: adminProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(true),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.string().uuid().nullish(),
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
      // Tickers are unique across exchanges (instruments_ticker_unique).
      const conflict = new TRPCError({
        code: "CONFLICT",
        message: `Instrument ${input.ticker} already exists`,
      });
      const existing = await ctx.db
        .select({ id: instruments.id })
        .from(instruments)
        .where(eq(instruments.ticker, input.ticker))
        .limit(1);

      if (existing.length > 0) throw conflict;

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
        .onConflictDoNothing({ target: instruments.ticker })
        .returning();
      if (!created) throw conflict;

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
          .onConflictDoNothing({ target: instruments.ticker })
          .returning({ id: instruments.id });

        if (inserted) created.push(inserted.id);
        else skipped.push(row.ticker);
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

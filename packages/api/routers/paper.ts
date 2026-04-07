import { z } from "zod";
import { eq, and, isNull, sql } from "@deepmint/db";
import {
  paperPortfolios,
  paperTrades,
  instruments,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { getCurrentPrice } from "@deepmint/shared";

const MAX_PORTFOLIOS = 5;

export const paperRouter = router({
  /** Create a new paper portfolio. Max 5 per entity. */
  createPortfolio: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        startingBalanceCents: z
          .number()
          .int()
          .positive()
          .optional()
          .default(10_000_000), // $100,000
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check portfolio count
      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(paperPortfolios)
        .where(eq(paperPortfolios.entityId, ctx.entity.id));

      if ((countResult?.count ?? 0) >= MAX_PORTFOLIOS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum ${MAX_PORTFOLIOS} portfolios allowed`,
        });
      }

      const [portfolio] = await ctx.db
        .insert(paperPortfolios)
        .values({
          entityId: ctx.entity.id,
          name: input.name,
          startingBalanceCents: input.startingBalanceCents,
        })
        .returning();

      return portfolio;
    }),

  /** List all portfolios for the current user with summary stats. */
  myPortfolios: protectedProcedure.query(async ({ ctx }) => {
    const portfolios = await ctx.db
      .select()
      .from(paperPortfolios)
      .where(eq(paperPortfolios.entityId, ctx.entity.id))
      .orderBy(paperPortfolios.createdAt);

    // For each portfolio, get open/closed trade counts and realized P&L
    const result = await Promise.all(
      portfolios.map(async (portfolio: typeof paperPortfolios.$inferSelect) => {
        const trades = await ctx.db
          .select()
          .from(paperTrades)
          .where(eq(paperTrades.portfolioId, portfolio.id));

        const openTrades = trades.filter(
          (t: typeof paperTrades.$inferSelect) => t.closedAt === null,
        );
        const closedTrades = trades.filter(
          (t: typeof paperTrades.$inferSelect) => t.closedAt !== null,
        );

        // Realized P&L from closed trades
        let realizedPnlCents = 0;
        for (const t of closedTrades) {
          const qty = Number(t.quantity);
          const entry = t.entryPriceCents;
          const exit = t.exitPriceCents ?? 0;
          const pnl =
            t.side === "buy"
              ? (exit - entry) * qty
              : (entry - exit) * qty;
          realizedPnlCents += Math.round(pnl);
        }

        return {
          ...portfolio,
          openTradeCount: openTrades.length,
          closedTradeCount: closedTrades.length,
          realizedPnlCents,
        };
      }),
    );

    return result;
  }),

  /** Add a trade to a portfolio. */
  addTrade: protectedProcedure
    .input(
      z.object({
        portfolioId: z.string().uuid(),
        instrumentId: z.string().uuid(),
        side: z.enum(["buy", "sell"]),
        quantity: z.string().refine(
          (v) => {
            const n = Number(v);
            return !isNaN(n) && n > 0;
          },
          { message: "Quantity must be a positive number" },
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify portfolio belongs to user
      const [portfolio] = await ctx.db
        .select()
        .from(paperPortfolios)
        .where(
          and(
            eq(paperPortfolios.id, input.portfolioId),
            eq(paperPortfolios.entityId, ctx.entity.id),
          ),
        )
        .limit(1);

      if (!portfolio) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio not found",
        });
      }

      // Verify instrument exists
      const [instrument] = await ctx.db
        .select()
        .from(instruments)
        .where(eq(instruments.id, input.instrumentId))
        .limit(1);

      if (!instrument) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instrument not found",
        });
      }

      // Get current price
      const priceCents = await getCurrentPrice(instrument.ticker);

      // Calculate cost
      const qty = Number(input.quantity);
      const costCents = Math.round(priceCents * qty);

      // Check available cash for buy orders
      if (input.side === "buy") {
        const availableCash = await getAvailableCash(
          ctx.db,
          portfolio.id,
          portfolio.startingBalanceCents,
        );
        if (costCents > availableCash) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient funds. Available: $${(availableCash / 100).toFixed(2)}, Cost: $${(costCents / 100).toFixed(2)}`,
          });
        }
      }

      const [trade] = await ctx.db
        .insert(paperTrades)
        .values({
          portfolioId: input.portfolioId,
          instrumentId: input.instrumentId,
          side: input.side,
          entryPriceCents: priceCents,
          quantity: input.quantity,
        })
        .returning();

      return trade;
    }),

  /** Close an open trade at current market price. */
  closeTrade: protectedProcedure
    .input(z.object({ tradeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get trade with portfolio verification
      const [trade] = await ctx.db
        .select({
          trade: paperTrades,
          portfolioEntityId: paperPortfolios.entityId,
          ticker: instruments.ticker,
        })
        .from(paperTrades)
        .innerJoin(
          paperPortfolios,
          eq(paperTrades.portfolioId, paperPortfolios.id),
        )
        .innerJoin(instruments, eq(paperTrades.instrumentId, instruments.id))
        .where(eq(paperTrades.id, input.tradeId))
        .limit(1);

      if (!trade) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Trade not found",
        });
      }

      if (trade.portfolioEntityId !== ctx.entity.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not your trade",
        });
      }

      if (trade.trade.closedAt !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Trade is already closed",
        });
      }

      const exitPriceCents = await getCurrentPrice(trade.ticker);

      const [updated] = await ctx.db
        .update(paperTrades)
        .set({
          exitPriceCents,
          closedAt: new Date(),
        })
        .where(eq(paperTrades.id, input.tradeId))
        .returning();

      return updated;
    }),

  /** Get portfolio detail: all trades with instrument info. */
  portfolioDetail: protectedProcedure
    .input(z.object({ portfolioId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [portfolio] = await ctx.db
        .select()
        .from(paperPortfolios)
        .where(
          and(
            eq(paperPortfolios.id, input.portfolioId),
            eq(paperPortfolios.entityId, ctx.entity.id),
          ),
        )
        .limit(1);

      if (!portfolio) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio not found",
        });
      }

      const trades = await ctx.db
        .select({
          trade: paperTrades,
          instrument: {
            id: instruments.id,
            ticker: instruments.ticker,
            name: instruments.name,
          },
        })
        .from(paperTrades)
        .innerJoin(instruments, eq(paperTrades.instrumentId, instruments.id))
        .where(eq(paperTrades.portfolioId, input.portfolioId))
        .orderBy(paperTrades.openedAt);

      const availableCash = await getAvailableCash(
        ctx.db,
        portfolio.id,
        portfolio.startingBalanceCents,
      );

      return {
        portfolio,
        trades,
        availableCashCents: availableCash,
      };
    }),

  /** Compute portfolio performance metrics. */
  portfolioPerformance: protectedProcedure
    .input(z.object({ portfolioId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [portfolio] = await ctx.db
        .select()
        .from(paperPortfolios)
        .where(
          and(
            eq(paperPortfolios.id, input.portfolioId),
            eq(paperPortfolios.entityId, ctx.entity.id),
          ),
        )
        .limit(1);

      if (!portfolio) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio not found",
        });
      }

      const trades = await ctx.db
        .select({
          trade: paperTrades,
          ticker: instruments.ticker,
        })
        .from(paperTrades)
        .innerJoin(instruments, eq(paperTrades.instrumentId, instruments.id))
        .where(eq(paperTrades.portfolioId, input.portfolioId));

      // Compute realized P&L
      let realizedPnlCents = 0;
      const closedTrades = trades.filter(
        (t: { trade: typeof paperTrades.$inferSelect }) => t.trade.closedAt !== null,
      );
      for (const t of closedTrades) {
        const qty = Number(t.trade.quantity);
        const entry = t.trade.entryPriceCents;
        const exit = t.trade.exitPriceCents ?? 0;
        const pnl =
          t.trade.side === "buy"
            ? (exit - entry) * qty
            : (entry - exit) * qty;
        realizedPnlCents += Math.round(pnl);
      }

      // Compute unrealized P&L from open positions
      let unrealizedPnlCents = 0;
      const openTrades = trades.filter(
        (t: { trade: typeof paperTrades.$inferSelect }) => t.trade.closedAt === null,
      );

      for (const t of openTrades) {
        const currentPrice = await getCurrentPrice(t.ticker);
        const qty = Number(t.trade.quantity);
        const entry = t.trade.entryPriceCents;
        const pnl =
          t.trade.side === "buy"
            ? (currentPrice - entry) * qty
            : (entry - currentPrice) * qty;
        unrealizedPnlCents += Math.round(pnl);
      }

      // Available cash
      const availableCash = await getAvailableCash(
        ctx.db,
        portfolio.id,
        portfolio.startingBalanceCents,
      );

      // Total equity = cash + open position value
      let openPositionValue = 0;
      for (const t of openTrades) {
        const currentPrice = await getCurrentPrice(t.ticker);
        openPositionValue += Math.round(
          currentPrice * Number(t.trade.quantity),
        );
      }

      const totalEquityCents = availableCash + openPositionValue;
      const totalReturnBps =
        portfolio.startingBalanceCents > 0
          ? Math.round(
              ((totalEquityCents - portfolio.startingBalanceCents) /
                portfolio.startingBalanceCents) *
                10000,
            )
          : 0;

      return {
        startingBalanceCents: portfolio.startingBalanceCents,
        availableCashCents: availableCash,
        openPositionValueCents: openPositionValue,
        totalEquityCents,
        realizedPnlCents,
        unrealizedPnlCents,
        totalReturnBps,
        openTradeCount: openTrades.length,
        closedTradeCount: closedTrades.length,
      };
    }),
});

/**
 * Calculate available cash in a portfolio.
 * Cash = starting balance - cost of open buys + proceeds from closed trades.
 */
async function getAvailableCash(
  db: typeof import("@deepmint/db").db,
  portfolioId: string,
  startingBalanceCents: number,
): Promise<number> {
  const trades = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.portfolioId, portfolioId));

  let cash = startingBalanceCents;

  for (const t of trades) {
    const qty = Number(t.quantity);
    if (t.side === "buy") {
      // Spent cash to buy
      cash -= Math.round(t.entryPriceCents * qty);
      // If closed, got cash back
      if (t.closedAt && t.exitPriceCents) {
        cash += Math.round(t.exitPriceCents * qty);
      }
    } else {
      // Sell (short): received cash at entry
      cash += Math.round(t.entryPriceCents * qty);
      // If closed, paid cash to cover
      if (t.closedAt && t.exitPriceCents) {
        cash -= Math.round(t.exitPriceCents * qty);
      }
    }
  }

  return cash;
}

import { z } from "zod";
import { eq, and, isNull, sql } from "@deepmint/db";
import {
  paperPortfolios,
  paperTrades,
  instruments,
  signalSimulatePortfolios,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import {
  COVERED_TICKERS,
  getLatestClose,
  getLatestCloses,
  isCoveredTicker,
} from "@deepmint/shared";
import {
  PAPER_STARTING_BALANCE_CENTS,
  availableCashCents,
  closeFor,
  realizedPnlCents,
  valuePortfolio,
} from "../lib/paperAccounting";

const MAX_PORTFOLIOS = 5;

export const paperRouter = router({
  /** Create a new paper portfolio, with $100,000. Max 5 per entity, not counting mirrors. */
  createPortfolio: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check portfolio count. Mirrors have their own cap (signalSimulate.create).
      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(paperPortfolios)
        .leftJoin(
          signalSimulatePortfolios,
          eq(signalSimulatePortfolios.paperPortfolioId, paperPortfolios.id),
        )
        .where(
          and(
            eq(paperPortfolios.entityId, ctx.entity.id),
            isNull(signalSimulatePortfolios.id),
          ),
        );

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
          startingBalanceCents: PAPER_STARTING_BALANCE_CENTS,
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

        return {
          ...portfolio,
          openTradeCount: openTrades.length,
          closedTradeCount: closedTrades.length,
          realizedPnlCents: realizedPnlCents(closedTrades),
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

      // Verify instrument exists, is active and is covered, as for claims
      const [instrument] = await ctx.db
        .select()
        .from(instruments)
        .where(
          and(
            eq(instruments.id, input.instrumentId),
            eq(instruments.isActive, true),
          ),
        )
        .limit(1);

      if (!instrument) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instrument not found or inactive",
        });
      }
      if (!isCoveredTicker(instrument.ticker)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${instrument.ticker} is not covered. Deepmint covers the Mag 7: ${COVERED_TICKERS.join(", ")}.`,
        });
      }

      // Trades fill at the latest close (D9). During market hours that is the
      // previous session's, so the session date goes back with the fill.
      const { closeCents: priceCents, sessionDate } = await getLatestClose(
        instrument.ticker,
      );

      // Calculate cost
      const qty = Number(input.quantity);
      const costCents = Math.round(priceCents * qty);

      // Either side needs the cash: a short sets aside its value as collateral
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

      return { ...trade!, fillSessionDate: sessionDate };
    }),

  /** The close a trade in this instrument would fill at now, with its session. */
  lastClose: protectedProcedure
    .input(z.object({ instrumentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [instrument] = await ctx.db
        .select({ ticker: instruments.ticker })
        .from(instruments)
        .where(eq(instruments.id, input.instrumentId))
        .limit(1);

      if (!instrument) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instrument not found",
        });
      }

      return getLatestClose(instrument.ticker);
    }),

  /** Close an open trade at the latest close. */
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

      const { closeCents: exitPriceCents, sessionDate } = await getLatestClose(
        trade.ticker,
      );

      const [updated] = await ctx.db
        .update(paperTrades)
        .set({
          exitPriceCents,
          closedAt: new Date(),
        })
        .where(eq(paperTrades.id, input.tradeId))
        .returning();

      return { ...updated!, fillSessionDate: sessionDate };
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

      // One latest-close lookup per distinct open ticker
      const openTickers = trades
        .filter((t) => t.trade.closedAt === null)
        .map((t) => t.ticker);
      const closes = await getLatestCloses(openTickers);
      const valuation = valuePortfolio(
        portfolio.startingBalanceCents,
        trades.map((t) => ({ ...t.trade, ticker: t.ticker })),
        (t) => closeFor(closes, t.ticker),
      );

      return {
        startingBalanceCents: portfolio.startingBalanceCents,
        ...valuation,
        /** The closes open positions are marked at, by ticker. */
        lastCloses: Object.fromEntries(closes),
      };
    }),
});

/** Available cash in a portfolio, under the collateral model (paperAccounting). */
async function getAvailableCash(
  db: typeof import("@deepmint/db").db,
  portfolioId: string,
  startingBalanceCents: number,
): Promise<number> {
  const trades = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.portfolioId, portfolioId));

  return availableCashCents(startingBalanceCents, trades);
}

import { z } from "zod";
import { eq, and, sql } from "@deepmint/db";
import {
  signalSimulatePortfolios,
  paperPortfolios,
  paperTrades,
  entities,
  instruments,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { getCurrentPrice } from "@deepmint/shared";

export const signalSimulateRouter = router({
  /** Create a signal-simulate portfolio that mirrors a followed entity's claims. */
  create: protectedProcedure
    .input(
      z.object({
        followedEntityId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Can't mirror yourself
      if (input.followedEntityId === ctx.entity.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot mirror your own signals",
        });
      }

      // Verify target entity exists
      const [target] = await ctx.db
        .select()
        .from(entities)
        .where(eq(entities.id, input.followedEntityId))
        .limit(1);

      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entity not found",
        });
      }

      // Check for existing active mirror
      const [existing] = await ctx.db
        .select()
        .from(signalSimulatePortfolios)
        .where(
          and(
            eq(signalSimulatePortfolios.entityId, ctx.entity.id),
            eq(signalSimulatePortfolios.followedEntityId, input.followedEntityId),
            eq(signalSimulatePortfolios.isActive, true),
          ),
        )
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Already mirroring this entity",
        });
      }

      // Create a dedicated paper portfolio
      const [portfolio] = await ctx.db
        .insert(paperPortfolios)
        .values({
          entityId: ctx.entity.id,
          name: `Mirror: ${target.displayName}`,
          startingBalanceCents: 10_000_000, // $100,000
        })
        .returning();

      // Link it
      const [sim] = await ctx.db
        .insert(signalSimulatePortfolios)
        .values({
          entityId: ctx.entity.id,
          followedEntityId: input.followedEntityId,
          paperPortfolioId: portfolio.id,
        })
        .returning();

      return { ...sim, portfolio, followedEntity: target };
    }),

  /** List active signal-simulate portfolios for the current user. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        sim: signalSimulatePortfolios,
        followedName: entities.displayName,
        followedSlug: entities.slug,
        followedType: entities.type,
        followedAvatar: entities.avatarUrl,
        portfolioName: paperPortfolios.name,
        startingBalanceCents: paperPortfolios.startingBalanceCents,
      })
      .from(signalSimulatePortfolios)
      .innerJoin(entities, eq(signalSimulatePortfolios.followedEntityId, entities.id))
      .innerJoin(paperPortfolios, eq(signalSimulatePortfolios.paperPortfolioId, paperPortfolios.id))
      .where(
        and(
          eq(signalSimulatePortfolios.entityId, ctx.entity.id),
          eq(signalSimulatePortfolios.isActive, true),
        ),
      )
      .orderBy(signalSimulatePortfolios.createdAt);

    // Enrich with trade counts
    const result = await Promise.all(
      rows.map(async (row) => {
        const [countResult] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(paperTrades)
          .where(eq(paperTrades.portfolioId, row.sim.paperPortfolioId));

        return {
          id: row.sim.id,
          paperPortfolioId: row.sim.paperPortfolioId,
          isActive: row.sim.isActive,
          createdAt: row.sim.createdAt,
          followedEntity: {
            id: row.sim.followedEntityId,
            displayName: row.followedName,
            slug: row.followedSlug,
            type: row.followedType,
            avatarUrl: row.followedAvatar,
          },
          portfolio: {
            name: row.portfolioName,
            startingBalanceCents: row.startingBalanceCents,
          },
          tradeCount: countResult?.count ?? 0,
        };
      }),
    );

    return result;
  }),

  /** Deactivate a signal-simulate portfolio (stops mirroring, keeps history). */
  deactivate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [sim] = await ctx.db
        .select()
        .from(signalSimulatePortfolios)
        .where(
          and(
            eq(signalSimulatePortfolios.id, input.id),
            eq(signalSimulatePortfolios.entityId, ctx.entity.id),
          ),
        )
        .limit(1);

      if (!sim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Signal-simulate portfolio not found",
        });
      }

      const [updated] = await ctx.db
        .update(signalSimulatePortfolios)
        .set({ isActive: false })
        .where(eq(signalSimulatePortfolios.id, input.id))
        .returning();

      return updated;
    }),

  /** Side-by-side comparison: signal portfolio vs user's own performance. */
  comparison: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [sim] = await ctx.db
        .select()
        .from(signalSimulatePortfolios)
        .where(
          and(
            eq(signalSimulatePortfolios.id, input.id),
            eq(signalSimulatePortfolios.entityId, ctx.entity.id),
          ),
        )
        .limit(1);

      if (!sim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Signal-simulate portfolio not found",
        });
      }

      // Get signal portfolio performance
      const signalPerf = await computePortfolioPerformance(ctx.db, sim.paperPortfolioId);

      // Get the user's own portfolios for comparison (first non-signal portfolio)
      const userPortfolios = await ctx.db
        .select()
        .from(paperPortfolios)
        .where(eq(paperPortfolios.entityId, ctx.entity.id))
        .orderBy(paperPortfolios.createdAt);

      // Find a portfolio that isn't a signal-simulate portfolio
      const signalPortfolioIds = new Set(
        (
          await ctx.db
            .select({ ppId: signalSimulatePortfolios.paperPortfolioId })
            .from(signalSimulatePortfolios)
            .where(eq(signalSimulatePortfolios.entityId, ctx.entity.id))
        ).map((r) => r.ppId),
      );

      const ownPortfolio = userPortfolios.find(
        (p) => !signalPortfolioIds.has(p.id),
      );

      const ownPerf = ownPortfolio
        ? await computePortfolioPerformance(ctx.db, ownPortfolio.id)
        : null;

      return {
        signal: signalPerf,
        own: ownPerf,
      };
    }),
});

async function computePortfolioPerformance(
  db: typeof import("@deepmint/db").db,
  portfolioId: string,
) {
  const [portfolio] = await db
    .select()
    .from(paperPortfolios)
    .where(eq(paperPortfolios.id, portfolioId))
    .limit(1);

  if (!portfolio) return null;

  const trades = await db
    .select({
      trade: paperTrades,
      ticker: instruments.ticker,
    })
    .from(paperTrades)
    .innerJoin(instruments, eq(paperTrades.instrumentId, instruments.id))
    .where(eq(paperTrades.portfolioId, portfolioId));

  let realizedPnlCents = 0;
  const closedTrades = trades.filter((t) => t.trade.closedAt !== null);
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

  let unrealizedPnlCents = 0;
  let openPositionValueCents = 0;
  const openTrades = trades.filter((t) => t.trade.closedAt === null);
  for (const t of openTrades) {
    const currentPrice = await getCurrentPrice(t.ticker);
    const qty = Number(t.trade.quantity);
    const entry = t.trade.entryPriceCents;
    const pnl =
      t.trade.side === "buy"
        ? (currentPrice - entry) * qty
        : (entry - currentPrice) * qty;
    unrealizedPnlCents += Math.round(pnl);
    openPositionValueCents += Math.round(currentPrice * qty);
  }

  // Compute cash from trade history
  let cash = portfolio.startingBalanceCents;
  for (const t of trades) {
    const qty = Number(t.trade.quantity);
    if (t.trade.side === "buy") {
      cash -= Math.round(t.trade.entryPriceCents * qty);
      if (t.trade.closedAt && t.trade.exitPriceCents) {
        cash += Math.round(t.trade.exitPriceCents * qty);
      }
    } else {
      cash += Math.round(t.trade.entryPriceCents * qty);
      if (t.trade.closedAt && t.trade.exitPriceCents) {
        cash -= Math.round(t.trade.exitPriceCents * qty);
      }
    }
  }

  const totalEquityCents = cash + openPositionValueCents;
  const totalReturnBps =
    portfolio.startingBalanceCents > 0
      ? Math.round(
          ((totalEquityCents - portfolio.startingBalanceCents) /
            portfolio.startingBalanceCents) *
            10000,
        )
      : 0;

  return {
    portfolioId,
    portfolioName: portfolio.name,
    startingBalanceCents: portfolio.startingBalanceCents,
    availableCashCents: cash,
    openPositionValueCents,
    totalEquityCents,
    realizedPnlCents,
    unrealizedPnlCents,
    totalReturnBps,
    openTradeCount: openTrades.length,
    closedTradeCount: closedTrades.length,
  };
}

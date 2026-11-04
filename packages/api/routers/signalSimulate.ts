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
import { getLatestCloses } from "@deepmint/shared";
import { closeFor, valuePortfolio } from "../lib/paperAccounting";

const MAX_ACTIVE_MIRRORS = 5;

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

      const [mirrorCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(signalSimulatePortfolios)
        .where(
          and(
            eq(signalSimulatePortfolios.entityId, ctx.entity.id),
            eq(signalSimulatePortfolios.isActive, true),
          ),
        );

      if ((mirrorCount?.count ?? 0) >= MAX_ACTIVE_MIRRORS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum ${MAX_ACTIVE_MIRRORS} active mirrors allowed`,
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

  // One latest-close lookup per distinct open ticker
  const closes = await getLatestCloses(
    trades.filter((t) => t.trade.closedAt === null).map((t) => t.ticker),
  );
  const valuation = valuePortfolio(
    portfolio.startingBalanceCents,
    trades.map((t) => ({ ...t.trade, ticker: t.ticker })),
    (t) => closeFor(closes, t.ticker),
  );

  return {
    portfolioId,
    portfolioName: portfolio.name,
    startingBalanceCents: portfolio.startingBalanceCents,
    ...valuation,
  };
}

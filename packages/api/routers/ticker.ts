import { z } from "zod";
import { eq, and, desc, sql } from "@deepmint/db";
import {
  instruments,
  consensusSignals,
  claims,
  entities,
  scores,
} from "@deepmint/db/schema";
import { router, publicProcedure } from "../trpc";
import { MAG7_TICKERS, getCurrentPrice } from "@deepmint/shared";

export const tickerRouter = router({
  /**
   * Aggregated overview for a single ticker:
   * instrument, consensus signal, current price, top guides, top players.
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

      // Parallel fetches
      const [consensus, priceCents, topGuides, topPlayers, claimStats] =
        await Promise.all([
          // Latest consensus signal
          ctx.db
            .select()
            .from(consensusSignals)
            .where(eq(consensusSignals.instrumentId, instrument.id))
            .orderBy(desc(consensusSignals.asOfDate))
            .limit(1)
            .then((rows: Array<typeof consensusSignals.$inferSelect>) => rows[0] ?? null),

          // Current price
          getCurrentPrice(ticker),

          // Top 5 Guides by EIV for this ticker
          ctx.db
            .select({
              entity: {
                id: entities.id,
                displayName: entities.displayName,
                slug: entities.slug,
                type: entities.type,
                avatarUrl: entities.avatarUrl,
                isVerified: entities.isVerified,
                brokerLinkStatus: entities.brokerLinkStatus,
              },
              eiv: scores.value,
            })
            .from(scores)
            .innerJoin(entities, eq(scores.entityId, entities.id))
            .where(
              and(
                eq(entities.type, "guide"),
                eq(scores.metric, "eiv"),
              ),
            )
            .orderBy(desc(scores.value))
            .limit(5),

          // Top 5 Players by Sharpe
          ctx.db
            .select({
              entity: {
                id: entities.id,
                displayName: entities.displayName,
                slug: entities.slug,
                type: entities.type,
                avatarUrl: entities.avatarUrl,
                isVerified: entities.isVerified,
                brokerLinkStatus: entities.brokerLinkStatus,
              },
              sharpe: scores.value,
            })
            .from(scores)
            .innerJoin(entities, eq(scores.entityId, entities.id))
            .where(
              and(
                eq(entities.type, "player"),
                eq(scores.metric, "sharpe"),
              ),
            )
            .orderBy(desc(scores.value))
            .limit(5),

          // Claim stats for this instrument
          ctx.db
            .select({
              count: sql<number>`count(*)::int`,
              avgTargetCents: sql<number>`avg(target_price_cents)::int`,
            })
            .from(claims)
            .where(
              and(
                eq(claims.instrumentId, instrument.id),
                eq(claims.status, "active"),
              ),
            )
            .then((rows: Array<{ count: number; avgTargetCents: number }>) => rows[0]),
        ]);

      return {
        isMag7: true as const,
        ticker,
        instrument,
        consensus,
        priceCents,
        topGuides,
        topPlayers,
        claimStats: {
          count: claimStats?.count ?? 0,
          avgTargetCents: claimStats?.avgTargetCents ?? null,
        },
      };
    }),
});

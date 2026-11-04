import { inngest } from "../inngest";
import { db, eq, and, gt, sql } from "@deepmint/db";
import {
  claims,
  events,
  signalSimulatePortfolios,
  paperTrades,
  paperPortfolios,
  instruments,
  notifications,
} from "@deepmint/db/schema";
import { getCurrentPrice } from "@deepmint/shared";
import { availableCashCents } from "@deepmint/api/lib/paperAccounting";
import { createNotification } from "@deepmint/db/queries/createNotification";

/**
 * A mirror copies only claims dated within this long (D13): a rating dated last
 * month, or a claim approved days after it was made, is not a signal to trade
 * on. Nor is an old post on a feed read for the first time, which the ledger
 * dates the day it was stored, so the post's own date counts too.
 */
const MIRROR_MAX_CLAIM_AGE_MS = 48 * 3_600_000;

/**
 * Tell the owner a mirror is out of cash, once: not again until one of its
 * trades has closed, since only that frees cash.
 */
async function notifyOutOfCash(
  sim: { entityId: string; paperPortfolioId: string },
  portfolioName: string,
  trades: Array<{ closedAt: Date | null }>,
  ticker: string,
) {
  const lastClosedAt = trades.reduce<Date | null>(
    (latest, t) => (t.closedAt && (!latest || t.closedAt > latest) ? t.closedAt : latest),
    null,
  );

  const [alreadyTold] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.entityId, sim.entityId),
        eq(notifications.type, "signal_trade_skipped"),
        sql`${notifications.metadata}->>'portfolioId' = ${sim.paperPortfolioId}`,
        lastClosedAt ? gt(notifications.createdAt, lastClosedAt) : undefined,
      ),
    )
    .limit(1);
  if (alreadyTold) return;

  await createNotification({
    entityId: sim.entityId,
    type: "signal_trade_skipped",
    title: `${portfolioName} is out of cash`,
    body: `Skipped a ${ticker} signal. Later signals are skipped too until a trade closes.`,
    metadata: { portfolioId: sim.paperPortfolioId, ticker },
  }).catch(() => {});
}

/**
 * Signal-simulate worker: triggered by claims/created event.
 * Auto-logs paper trades for all active signal-simulate portfolios
 * that mirror the claim's author. Markout closes them with the claim.
 */
export const signalSimulateFunction = inngest.createFunction(
  {
    id: "signal-simulate",
    retries: 2,
    triggers: [{ event: "claims/created" }],
  },
  async ({ event, step }) => {
    const { claimId, entityId, instrumentId, direction, entryPriceCents } = event.data;

    // A neutral claim takes no position, so there is nothing to mirror.
    if (direction === "neutral") return { tradesCreated: 0 };

    const result = await step.run("auto-log-signal-trades", async () => {
      const [claim] = await db
        .select({ createdAt: claims.createdAt, postedAt: events.capturedAt })
        .from(claims)
        .leftJoin(events, eq(claims.eventId, events.id))
        .where(eq(claims.id, claimId))
        .limit(1);
      if (!claim) return { tradesCreated: 0 };
      const datedAt = Math.min(
        claim.createdAt.getTime(),
        claim.postedAt?.getTime() ?? Infinity,
      );
      if (Date.now() - datedAt > MIRROR_MAX_CLAIM_AGE_MS) {
        return { tradesCreated: 0 };
      }

      // Find all active signal-simulate portfolios mirroring this entity
      const sims = await db
        .select({
          id: signalSimulatePortfolios.id,
          paperPortfolioId: signalSimulatePortfolios.paperPortfolioId,
          entityId: signalSimulatePortfolios.entityId,
        })
        .from(signalSimulatePortfolios)
        .where(
          and(
            eq(signalSimulatePortfolios.followedEntityId, entityId),
            eq(signalSimulatePortfolios.isActive, true),
          ),
        );

      if (sims.length === 0) return { tradesCreated: 0 };

      // Get instrument for price lookup
      const [instrument] = await db
        .select()
        .from(instruments)
        .where(eq(instruments.id, instrumentId))
        .limit(1);

      if (!instrument) return { tradesCreated: 0 };

      // Paper trades open at the latest available price. Self-logged claims
      // no longer carry an entry price, so if the lookup fails there may be
      // no fallback: throw and let the step retry rather than open a trade
      // at no price.
      let priceCents: number;
      try {
        priceCents = await getCurrentPrice(instrument.ticker);
      } catch (err) {
        if (entryPriceCents == null) throw err;
        priceCents = entryPriceCents;
      }

      // Map claim direction to trade side
      const side = direction === "short" ? "sell" : "buy";

      let tradesCreated = 0;

      for (const sim of sims) {
        // Get portfolio for balance calculation
        const [portfolio] = await db
          .select()
          .from(paperPortfolios)
          .where(eq(paperPortfolios.id, sim.paperPortfolioId))
          .limit(1);

        if (!portfolio) continue;

        // Calculate available cash
        const trades = await db
          .select()
          .from(paperTrades)
          .where(eq(paperTrades.portfolioId, sim.paperPortfolioId));

        const cash = availableCashCents(portfolio.startingBalanceCents, trades);

        // 1% allocation per signal trade
        const allocationCents = Math.round(portfolio.startingBalanceCents * 0.01);
        if (priceCents <= 0) continue;
        if (cash < allocationCents) {
          await notifyOutOfCash(sim, portfolio.name, trades, instrument.ticker);
          continue;
        }

        // Quantity: allocation / price (store as string for numeric column)
        const quantity = (allocationCents / priceCents).toFixed(8);

        // A step retry after a partial run must not open the trade twice.
        const inserted = await db
          .insert(paperTrades)
          .values({
            portfolioId: sim.paperPortfolioId,
            instrumentId,
            claimId,
            side,
            entryPriceCents: priceCents,
            quantity,
          })
          .onConflictDoNothing({ target: [paperTrades.claimId, paperTrades.portfolioId] })
          .returning({ id: paperTrades.id });
        if (inserted.length === 0) continue;

        // Notify the portfolio owner
        await createNotification({
          entityId: sim.entityId,
          type: "signal_trade_logged",
          title: `Signal trade: ${side.toUpperCase()} ${instrument.ticker}`,
          body: `A ${side} trade was auto-logged in your signal portfolio at $${(priceCents / 100).toFixed(2)}.`,
          metadata: { instrumentId, side, priceCents },
        }).catch(() => {});

        tradesCreated++;
      }

      console.log(
        `[signal-simulate] ${tradesCreated} trades created for entity ${entityId}`,
      );
      return { tradesCreated };
    });

    return result;
  },
);

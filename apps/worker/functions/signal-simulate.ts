import { inngest } from "../inngest";
import { db, eq, and, sql } from "@deepmint/db";
import {
  signalSimulatePortfolios,
  paperTrades,
  paperPortfolios,
  instruments,
} from "@deepmint/db/schema";
import { getCurrentPrice } from "@deepmint/shared";
import { createNotification } from "@deepmint/db/queries/createNotification";

/**
 * Signal-simulate worker: triggered by claims/created event.
 * Auto-logs paper trades for all active signal-simulate portfolios
 * that mirror the claim's author.
 */
export const signalSimulateFunction = inngest.createFunction(
  {
    id: "signal-simulate",
    retries: 2,
    triggers: [{ event: "claims/created" }],
  },
  async ({ event, step }) => {
    const { entityId, instrumentId, direction, entryPriceCents } = event.data;

    const result = await step.run("auto-log-signal-trades", async () => {
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

      // Get current price (fallback to entry price from claim)
      let priceCents: number;
      try {
        priceCents = await getCurrentPrice(instrument.ticker);
      } catch {
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

        let cash = portfolio.startingBalanceCents;
        for (const t of trades) {
          const qty = Number(t.quantity);
          if (t.side === "buy") {
            cash -= Math.round(t.entryPriceCents * qty);
            if (t.closedAt && t.exitPriceCents) {
              cash += Math.round(t.exitPriceCents * qty);
            }
          } else {
            cash += Math.round(t.entryPriceCents * qty);
            if (t.closedAt && t.exitPriceCents) {
              cash -= Math.round(t.exitPriceCents * qty);
            }
          }
        }

        // 1% allocation per signal trade
        const allocationCents = Math.round(portfolio.startingBalanceCents * 0.01);
        if (cash < allocationCents || priceCents <= 0) continue;

        // Quantity: allocation / price (store as string for numeric column)
        const quantity = (allocationCents / priceCents).toFixed(8);

        await db.insert(paperTrades).values({
          portfolioId: sim.paperPortfolioId,
          instrumentId,
          side,
          entryPriceCents: priceCents,
          quantity,
        });

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

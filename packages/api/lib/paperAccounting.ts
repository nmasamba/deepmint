/**
 * Paper-portfolio accounting, in integer cents.
 *
 * Collateral model: opening a position of either side takes entry × quantity
 * out of cash. A long is worth current × quantity; a short is worth its
 * collateral plus its unrealized P&L, (2 × entry − current) × quantity.
 * Closing returns that value to cash at the exit price. Equity is cash plus
 * the value of open positions, so a flat short leaves equity unchanged, and
 * opening either side needs the cash to cover entry × quantity.
 */

export const PAPER_STARTING_BALANCE_CENTS = 10_000_000; // $100,000

export interface PaperTradeLike {
  side: "buy" | "sell";
  quantity: string | number;
  entryPriceCents: number;
  exitPriceCents: number | null;
  closedAt: Date | string | null;
}

/** P&L in cents of a position marked at `priceCents`. */
export function positionPnlCents(t: PaperTradeLike, priceCents: number): number {
  const qty = Number(t.quantity);
  const pnl =
    t.side === "buy"
      ? (priceCents - t.entryPriceCents) * qty
      : (t.entryPriceCents - priceCents) * qty;
  return Math.round(pnl);
}

/** Value in cents of an open position marked at `priceCents`. */
export function positionValueCents(t: PaperTradeLike, priceCents: number): number {
  const cost = Math.round(t.entryPriceCents * Number(t.quantity));
  return cost + positionPnlCents(t, priceCents);
}

/** Cash in cents after every trade's opening, and its closing if closed. */
export function availableCashCents(
  startingBalanceCents: number,
  trades: PaperTradeLike[],
): number {
  let cash = startingBalanceCents;
  for (const t of trades) {
    cash -= Math.round(t.entryPriceCents * Number(t.quantity));
    if (t.closedAt && t.exitPriceCents) {
      cash += positionValueCents(t, t.exitPriceCents);
    }
  }
  return cash;
}

/** Realized P&L in cents over closed trades. */
export function realizedPnlCents(trades: PaperTradeLike[]): number {
  let total = 0;
  for (const t of trades) {
    if (t.closedAt === null) continue;
    total += positionPnlCents(t, t.exitPriceCents ?? 0);
  }
  return total;
}

export interface PaperValuation {
  availableCashCents: number;
  openPositionValueCents: number;
  totalEquityCents: number;
  realizedPnlCents: number;
  unrealizedPnlCents: number;
  totalReturnBps: number;
  openTradeCount: number;
  closedTradeCount: number;
}

/**
 * Value a portfolio. `closeCents(trade)` gives the price to mark an open
 * trade at.
 */
export function valuePortfolio<T extends PaperTradeLike>(
  startingBalanceCents: number,
  trades: T[],
  closeCents: (trade: T) => number,
): PaperValuation {
  const open = trades.filter((t) => t.closedAt === null);
  let openPositionValue = 0;
  let unrealized = 0;
  for (const t of open) {
    const price = closeCents(t);
    openPositionValue += positionValueCents(t, price);
    unrealized += positionPnlCents(t, price);
  }
  const cash = availableCashCents(startingBalanceCents, trades);
  const totalEquityCents = cash + openPositionValue;
  return {
    availableCashCents: cash,
    openPositionValueCents: openPositionValue,
    totalEquityCents,
    realizedPnlCents: realizedPnlCents(trades),
    unrealizedPnlCents: unrealized,
    totalReturnBps:
      startingBalanceCents > 0
        ? Math.round(((totalEquityCents - startingBalanceCents) / startingBalanceCents) * 10000)
        : 0,
    openTradeCount: open.length,
    closedTradeCount: trades.length - open.length,
  };
}

/** The close for `ticker` from a `getLatestCloses` map; throws if it is missing. */
export function closeFor(
  closes: Map<string, { closeCents: number }>,
  ticker: string,
): number {
  const close = closes.get(ticker.toUpperCase());
  if (!close) throw new Error(`No latest close for ${ticker}`);
  return close.closeCents;
}

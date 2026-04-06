/**
 * Player scoring metrics (build_spec §2.1).
 * All functions are pure — no DB or network access.
 */

import { avg, stddev } from "./utils";

/**
 * Annualised Sharpe Ratio from daily returns.
 * Uses sample std deviation, annualised by √252.
 */
export function sharpeRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean = avg(dailyReturns);
  const std = stddev(dailyReturns);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(252);
}

/**
 * Calmar Ratio: annualised return / max drawdown.
 */
export function calmarRatio(
  annualisedReturn: number,
  maxDD: number
): number {
  if (maxDD === 0) return 0;
  return annualisedReturn / Math.abs(maxDD);
}

/**
 * Conditional Value at Risk — average of worst 5% daily returns.
 */
export function cvar5(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.ceil(sorted.length * 0.05));
  const tail = sorted.slice(0, cutoff);
  return avg(tail);
}

/**
 * Max drawdown from an equity curve (array of portfolio values).
 * Returns a positive fraction (e.g. 0.15 = 15% drawdown).
 */
export function maxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;
  let peak = equityCurve[0]!;
  let maxDD = 0;
  for (const value of equityCurve) {
    if (value > peak) peak = value;
    const dd = (peak - value) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * Consistency score: normalised inverse of rolling Sharpe volatility.
 * Higher = more consistent. Range 0-10.
 * @param windowSize Rolling window in days (default 63 ≈ 3 months)
 */
export function consistencyScore(
  dailyReturns: number[],
  windowSize = 63
): number {
  if (dailyReturns.length < windowSize + 1) return 5; // insufficient data → neutral
  const rollingSharpes: number[] = [];
  for (let i = windowSize; i <= dailyReturns.length; i++) {
    const window = dailyReturns.slice(i - windowSize, i);
    rollingSharpes.push(sharpeRatio(window));
  }
  const std = stddev(rollingSharpes);
  return Math.max(0, Math.min(10, 10 - std * 5));
}

/**
 * Max Adverse Excursion (MAE) and Max Favorable Excursion (MFE) for a trade.
 */
export function maeAndMfe(trade: {
  entryPrice: number;
  exitPrice: number;
  highPrice: number;
  lowPrice: number;
  side: "buy" | "sell";
}): { mae: number; mfe: number } {
  if (trade.side === "buy") {
    return {
      mae: (trade.entryPrice - trade.lowPrice) / trade.entryPrice,
      mfe: (trade.highPrice - trade.entryPrice) / trade.entryPrice,
    };
  } else {
    return {
      mae: (trade.highPrice - trade.entryPrice) / trade.entryPrice,
      mfe: (trade.entryPrice - trade.lowPrice) / trade.entryPrice,
    };
  }
}

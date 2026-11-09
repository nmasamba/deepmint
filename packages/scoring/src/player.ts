/**
 * Player scoring metrics (build_spec §2.1).
 * All functions are pure — no DB or network access.
 */

import { avg, stddev } from "./utils";
import { computeMarkoutFromBars, type MarkoutBar, type MarkoutInput } from "./markout";

/** Annual risk-free rate a Player's Sharpe ratio is measured against. */
export const RISK_FREE_ANNUAL = 0.04;

const TRADING_DAYS_PER_YEAR = 252;

/**
 * Annualised Sharpe Ratio from daily returns, net of `riskFreeAnnual`.
 * Uses sample std deviation, annualised by √252.
 */
export function sharpeRatio(dailyReturns: number[], riskFreeAnnual = 0): number {
  if (dailyReturns.length < 2) return 0;
  const excess = avg(dailyReturns) - riskFreeAnnual / TRADING_DAYS_PER_YEAR;
  const std = stddev(dailyReturns);
  if (std === 0) return 0;
  return (excess / std) * Math.sqrt(TRADING_DAYS_PER_YEAR);
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

/** A scored claim as a position in a Player's book. */
export interface BookClaim extends MarkoutInput {
  ticker: string;
}

/** One session of a book. */
export interface BookDay {
  date: string; // YYYY-MM-DD
  returnFrac: number; // 0.01 = +1%
}

/**
 * A Player's claims as one daily mark-to-market book, from the first session
 * after the first entry to the last exit. Daily closes turn claims of any
 * horizon into a true daily series, which is what Sharpe, drawdown and CVaR
 * assume; a claim's whole return is not one day's return.
 *
 * - Each claim is held from its entry close to its exit close, as markout
 *   prices it (computeMarkoutFromBars), so the book cannot drift from the
 *   outcome. A claim whose exit session has no final bar yet is left out.
 * - A session's return is the average move of the positions open over it.
 *   A session with none open is cash, a 0 return, and still counts as a day.
 * - A position is marked on its entry price, so its daily moves compound to
 *   its outcome's return, for shorts too. A short at twice its entry has lost
 *   everything; its value stops at 0 and it moves no further.
 * - Neutral claims take no position.
 */
export function dailyBookReturns(
  claims: BookClaim[],
  barsByTicker: Record<string, MarkoutBar[]>,
  now: Date,
): BookDay[] {
  const positions = claims.flatMap((claim) => {
    const bars = barsByTicker[claim.ticker];
    if (claim.direction === "neutral" || !bars) return [];
    const priced = computeMarkoutFromBars(claim, bars, now);
    if (!priced) return [];
    return [
      {
        sign: claim.direction === "long" ? 1 : -1,
        entryPriceCents: priced.entryPriceCents,
        entryDate: priced.entryDate,
        exitDate: priced.exitDate,
        closes: new Map(bars.map((b) => [b.date, b.closeCents])),
        value: 1,
      },
    ];
  });
  if (positions.length === 0) return [];

  const firstEntry = positions.map((p) => p.entryDate).sort()[0]!;
  const lastExit = positions.map((p) => p.exitDate).sort().at(-1)!;
  const sessions = [...new Set(positions.flatMap((p) => [...p.closes.keys()]))]
    .filter((date) => date > firstEntry && date <= lastExit)
    .sort();

  return sessions.map((date) => {
    const moves: number[] = [];
    for (const position of positions) {
      if (date <= position.entryDate || date > position.exitDate) continue;
      // A halted stock has no bar: it stays at its last mark. A position that
      // has lost everything is gone, whatever the stock does next.
      const close = position.closes.get(date);
      const value =
        close === undefined || position.value === 0
          ? position.value
          : Math.max(0, 1 + position.sign * (close / position.entryPriceCents - 1));
      moves.push(position.value > 0 ? value / position.value - 1 : 0);
      position.value = value;
    }
    return { date, returnFrac: moves.length > 0 ? avg(moves) : 0 };
  });
}

/** Every Player risk metric, from a book's daily returns (dailyBookReturns). */
export function playerRiskMetrics(dailyReturns: number[]): {
  sharpe: number;
  maxDrawdown: number;
  calmar: number;
  cvar5: number;
  consistency: number;
} {
  const equityCurve = [1];
  for (const r of dailyReturns) {
    equityCurve.push(equityCurve[equityCurve.length - 1]! * (1 + r));
  }
  const drawdown = maxDrawdown(equityCurve);
  const annualisedReturn =
    equityCurve[equityCurve.length - 1]! **
      (TRADING_DAYS_PER_YEAR / Math.max(dailyReturns.length, 1)) -
    1;

  return {
    sharpe: sharpeRatio(dailyReturns, RISK_FREE_ANNUAL),
    maxDrawdown: drawdown,
    calmar: calmarRatio(annualisedReturn, drawdown),
    cvar5: cvar5(dailyReturns),
    consistency: consistencyScore(dailyReturns),
  };
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

import { getEODPrice, getHistoricalPrices } from "@deepmint/shared";

export type Horizon = "1d" | "1w" | "1m" | "3m" | "6m" | "1y";

/**
 * Horizon days → horizon enum value mapping.
 */
export const HORIZON_MAP: Record<number, Horizon> = {
  1: "1d",
  7: "1w",
  30: "1m",
  90: "3m",
  180: "6m",
  365: "1y",
};

/** Check if a date falls on a weekend (Saturday=6, Sunday=0). */
function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Get the next trading day (skip weekends). Does not account for holidays —
 * missing price data is handled by the caller (retry / skip).
 */
function nextTradingDay(d: Date): Date {
  const result = new Date(d);
  while (isWeekend(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
  }
  return result;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface MarkoutClaimInput {
  direction: "long" | "short" | "neutral";
  horizonDays: number;
  entryPriceCents: number | null;
  targetPriceCents: number | null;
  createdAt: Date | string;
}

export interface MarkoutComputation {
  horizon: Horizon;
  entryPriceCents: number;
  exitPriceCents: number;
  returnBps: number;
  directionCorrect: boolean;
  targetHit: boolean | null;
}

/**
 * Compute the outcome for a single claim at its horizon, given the instrument
 * ticker. Pure of DB writes/notifications so it can be reused by both the daily
 * markout worker and the historical backfill.
 *
 * Returns null when the outcome cannot be computed yet (unmapped horizon,
 * missing entry price, or exit-price data unavailable).
 *
 * returnBps is stored as POSITION P&L (negated for shorts): a profitable short
 * (price fell) is a positive return. directionCorrect is based on raw price
 * movement.
 */
export async function computeMarkoutForClaim(
  claim: MarkoutClaimInput,
  ticker: string,
): Promise<MarkoutComputation | null> {
  const horizon = HORIZON_MAP[claim.horizonDays];
  if (!horizon) return null;
  if (claim.entryPriceCents === null) return null;
  const entryPriceCents = claim.entryPriceCents;

  // Exit date = createdAt + horizonDays, advanced to the next trading day.
  const createdAt = new Date(claim.createdAt);
  const exitDate = new Date(createdAt);
  exitDate.setUTCDate(exitDate.getUTCDate() + claim.horizonDays);
  const exitDateStr = formatDate(nextTradingDay(exitDate));

  let exitPriceCents: number;
  try {
    const eod = await getEODPrice(ticker, exitDateStr);
    exitPriceCents = eod.closeCents;
  } catch {
    return null; // price data missing — caller may retry later
  }

  // Raw price movement in basis points (sign reflects price, not P&L).
  const priceReturnBps = Math.round(
    ((exitPriceCents - entryPriceCents) / entryPriceCents) * 10000,
  );

  // Direction correctness is based on price movement.
  let directionCorrect: boolean;
  if (claim.direction === "long") {
    directionCorrect = priceReturnBps > 0;
  } else if (claim.direction === "short") {
    directionCorrect = priceReturnBps < 0;
  } else {
    directionCorrect = Math.abs(priceReturnBps) <= 200; // neutral: within ±2%
  }

  // Store position P&L return: a profitable short (price fell) is positive.
  const returnBps =
    claim.direction === "short" ? -priceReturnBps : priceReturnBps;

  // Target hit: did price reach the target during the horizon window?
  let targetHit: boolean | null = null;
  if (claim.targetPriceCents !== null) {
    try {
      const bars = await getHistoricalPrices(
        ticker,
        formatDate(createdAt),
        exitDateStr,
      );
      if (claim.direction === "long") {
        targetHit = bars.some((b) => b.highCents >= claim.targetPriceCents!);
      } else if (claim.direction === "short") {
        targetHit = bars.some((b) => b.lowCents <= claim.targetPriceCents!);
      } else {
        targetHit = null;
      }
    } catch {
      targetHit = null;
    }
  }

  return {
    horizon,
    entryPriceCents,
    exitPriceCents,
    returnBps,
    directionCorrect,
    targetHit,
  };
}

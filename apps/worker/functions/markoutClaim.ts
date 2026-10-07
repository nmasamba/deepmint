import { getHistoricalPrices } from "@deepmint/shared";
import {
  computeMarkoutFromBars,
  isSessionFinal,
  markoutDueDate,
  markoutWindow,
} from "@deepmint/scoring";

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
 * Fetches one range of daily bars; the pricing rules live in
 * computeMarkoutFromBars (@deepmint/scoring). A claim without a stored entry
 * price is entered at the first close after it was made. Exits roll past
 * weekends and market holidays to the next session with a bar.
 *
 * Returns null when the outcome cannot be computed yet (unmapped horizon, or
 * a needed session has no final bar); the caller retries on its next run.
 */
export async function computeMarkoutForClaim(
  claim: MarkoutClaimInput,
  ticker: string,
): Promise<MarkoutComputation | null> {
  const horizon = HORIZON_MAP[claim.horizonDays];
  if (!horizon) return null;

  const input = {
    direction: claim.direction,
    horizonDays: claim.horizonDays,
    entryPriceCents: claim.entryPriceCents,
    targetPriceCents: claim.targetPriceCents,
    createdAt: new Date(claim.createdAt),
  };
  // Selection is by created_at + horizon; a claim entered at the next close
  // can be selected before its exit session exists. Skip the throttled fetch
  // until it can.
  const now = new Date();
  if (!isSessionFinal(markoutDueDate(input), now)) return null;

  const { from, to } = markoutWindow(input);

  let bars;
  try {
    bars = await getHistoricalPrices(ticker, from, to);
  } catch {
    return null; // price data unavailable; caller retries next run
  }

  const result = computeMarkoutFromBars(input, bars, now);
  if (!result) return null;
  return {
    horizon,
    entryPriceCents: result.entryPriceCents,
    exitPriceCents: result.exitPriceCents,
    returnBps: result.returnBps,
    directionCorrect: result.directionCorrect,
    targetHit: result.targetHit,
  };
}

/**
 * Guide scoring metrics (build_spec §2.3 + §2.5).
 * Includes hit rate, Brier scoring, z-test significance, and continuous Brier.
 */

import { avg, normalCDF } from "./utils";

// ---------------------------------------------------------------------------
// Basic Guide metrics (§2.3)
// ---------------------------------------------------------------------------

/**
 * Hit rate: fraction of outcomes where direction was correct.
 */
export function hitRate(outcomes: { directionCorrect: boolean }[]): number {
  if (outcomes.length === 0) return 0;
  const hits = outcomes.filter((o) => o.directionCorrect).length;
  return hits / outcomes.length;
}

/**
 * Average return in basis points across all outcomes.
 */
export function avgReturnBps(outcomes: { returnBps: number }[]): number {
  if (outcomes.length === 0) return 0;
  return avg(outcomes.map((o) => o.returnBps));
}

/**
 * Z-test for statistical significance of hit rate vs null hypothesis.
 * @param rate Observed hit rate (0-1)
 * @param n Sample size
 * @param nullRate Null hypothesis rate (default 0.5 = coin flip)
 */
export function zTestSignificance(
  rate: number,
  n: number,
  nullRate = 0.5
): { zScore: number; pValue: number; isSignificant: boolean } {
  if (n === 0) return { zScore: 0, pValue: 1, isSignificant: false };
  const se = Math.sqrt((nullRate * (1 - nullRate)) / n);
  if (se === 0) return { zScore: 0, pValue: 1, isSignificant: false };
  const z = (rate - nullRate) / se;
  const p = 1 - normalCDF(z);
  return {
    zScore: z,
    pValue: p,
    isSignificant: p < 0.05 && n >= 15,
  };
}

/**
 * Brier Score for confidence calibration. Lower = better.
 * Range: 0 (perfect) to 1 (worst).
 */
export function brierScore(
  predictions: { confidence: number; correct: boolean }[]
): number {
  if (predictions.length === 0) return 1;
  const sum = predictions.reduce((acc, p) => {
    const prob = p.confidence / 100;
    const outcome = p.correct ? 1 : 0;
    return acc + (prob - outcome) ** 2;
  }, 0);
  return sum / predictions.length;
}

/**
 * Target precision: how close actual price got to the target.
 * Returns 0-1 (1 = hit or exceeded target).
 */
export function targetPrecision(
  outcomes: {
    targetPriceCents: number | null;
    exitPriceCents: number;
    entryPriceCents: number;
  }[]
): number {
  const withTargets = outcomes.filter((o) => o.targetPriceCents !== null);
  if (withTargets.length === 0) return 0;

  const precisions = withTargets.map((o) => {
    const targetMove = Math.abs(o.targetPriceCents! - o.entryPriceCents);
    const actualMove = Math.abs(o.exitPriceCents - o.entryPriceCents);
    if (targetMove === 0) return 0;
    return Math.min(1, actualMove / targetMove);
  });
  return avg(precisions);
}

// ---------------------------------------------------------------------------
// Continuous Brier scoring (§2.5)
// ---------------------------------------------------------------------------

export interface BrierTimeSlice {
  daysBeforeResolution: number;
  priceCents: number;
  directionCorrect: boolean;
}

/**
 * Compute direction correctness at a price snapshot point.
 */
export function computeSliceOutcome(slice: {
  direction: "long" | "short" | "neutral";
  entryPriceCents: number;
  snapshotPriceCents: number;
}): 0 | 1 {
  const returnPct =
    (slice.snapshotPriceCents - slice.entryPriceCents) / slice.entryPriceCents;
  if (slice.direction === "long") return returnPct > 0 ? 1 : 0;
  if (slice.direction === "short") return returnPct < 0 ? 1 : 0;
  return Math.abs(returnPct) < 0.02 ? 1 : 0; // neutral: within 2%
}

/**
 * Continuous Brier score across multiple time slices.
 * Each slice represents a forecast evaluation at a point before resolution.
 */
export function continuousBrierScore(
  slices: { forecastProbability: number; outcome: 0 | 1 }[]
): number {
  if (slices.length === 0) return 1;
  const sum = slices.reduce(
    (acc, s) => acc + (s.forecastProbability - s.outcome) ** 2,
    0
  );
  return sum / slices.length;
}

/**
 * Time-decayed Brier score — recent slices weighted more heavily.
 * @param lambda Decay rate (default 0.05)
 */
export function timeDecayedBrierScore(
  slices: {
    daysBeforeResolution: number;
    forecastProbability: number;
    outcome: 0 | 1;
  }[],
  lambda = 0.05
): number {
  if (slices.length === 0) return 1;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of slices) {
    const weight = Math.exp(-lambda * s.daysBeforeResolution);
    weightedSum += weight * (s.forecastProbability - s.outcome) ** 2;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 1;
}

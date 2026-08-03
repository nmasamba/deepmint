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
 * Fraction of outcomes that carry a usable published price target.
 * Reported separately so a Guide who publishes targets on 3 of 100 calls is
 * distinguishable from one who publishes them on all 100.
 */
export function targetCoverage(
  outcomes: { targetPriceCents: number | null }[]
): number {
  if (outcomes.length === 0) return 0;
  return (
    outcomes.filter((o) => o.targetPriceCents !== null).length / outcomes.length
  );
}

/**
 * Target precision: signed progress from entry toward the published target.
 * Returns 0-1, or null when no usable target exists.
 *
 * Two defects fixed here.
 *
 * 1. NULL vs 0. "Never published a price target" and "published targets and
 *    missed every one" are different observations; the old `return 0` made
 *    them identical, so a Guide supplying no targets scored exactly 0.000 and
 *    was indistinguishable on a leaderboard. Callers must not write a score
 *    row when this returns null.
 *
 * 2. DIRECTION BLINDNESS. The old body took Math.abs of BOTH the target move
 *    and the actual move, so it could not tell a hit from its mirror image: a
 *    long from 100 with a 120 target that closed at 80 — a -20% move on a
 *    +20% call — scored a PERFECT 1.000, as did the short mirror. The signed
 *    ratio reproduces the correct cases exactly (exit 120 -> 1.0, exit 110 ->
 *    0.5) and returns 0 for a wrong-way move.
 *
 * `minMoveFrac` is the smallest |target/entry - 1| that counts as a real
 * target. Without it a 1-cent target on a $100 stock scores a trivial 1.000.
 * Outcomes below the floor are EXCLUDED (there is no target worth scoring)
 * rather than scored 0.
 */
export function targetPrecision(
  outcomes: {
    targetPriceCents: number | null;
    exitPriceCents: number;
    entryPriceCents: number;
    minMoveFrac?: number;
  }[]
): number | null {
  const precisions: number[] = [];
  for (const o of outcomes) {
    if (o.targetPriceCents === null) continue;
    if (o.entryPriceCents === 0) continue;
    const targetMove = o.targetPriceCents - o.entryPriceCents; // SIGNED
    const floor = (o.minMoveFrac ?? 0) * Math.abs(o.entryPriceCents);
    if (Math.abs(targetMove) <= floor) continue; // degenerate / trivial target
    const actualMove = o.exitPriceCents - o.entryPriceCents; // SIGNED
    precisions.push(Math.max(0, Math.min(1, actualMove / targetMove)));
  }
  if (precisions.length === 0) return null;
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

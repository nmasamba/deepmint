/**
 * Regime-Aware Expected Information Value (build_spec §2.7).
 * Bayesian shrinkage with sample size penalty.
 */

import type { MarketRegime } from "./regime";
import { avgReturnBps, brierScore, hitRate } from "./guide";
import { outcomesWithPosition } from "./markout";

/**
 * A regime's outcomes count toward its EIV once it has this many (D6). Until
 * then they count only toward the overall EIV.
 */
export const MIN_REGIME_OUTCOMES = 5;

export interface EntityRegimeHistory {
  regime: MarketRegime;
  hitRate: number;
  avgReturnBps: number;
  sampleSize: number;
  brierScore: number;
}

export interface OverallScores {
  hitRate: number;
  avgReturnBps: number;
  brierScore: number;
  totalClaims: number;
}

/** EIV on the 0-100 scale from one set of outcomes. */
function eivFrom(record: Omit<EntityRegimeHistory, "regime">): number {
  // Edge: how much better than coin flip
  const edge = record.hitRate - 0.5;
  if (edge <= 0) return 0;

  const confidenceFactor = Math.max(0, 1 - record.brierScore);
  const sampleFactor = record.sampleSize / (record.sampleSize + 20); // Bayesian shrinkage toward 0

  // Do NOT take the absolute value of the average return: a positive
  // directional edge combined with a net-negative average return is not a
  // profitable edge and must pull EIV down (toward 0), not up.
  const rawEIV = edge * (record.avgReturnBps / 100) * confidenceFactor * sampleFactor;
  const scaled = Math.max(0, Math.min(100, (rawEIV / 5) * 100));

  return Math.round(scaled * 10) / 10;
}

/**
 * EIV over all of an entity's outcomes (eiv_overall). The sample factor is
 * the only shrinkage: the old fixed 0.4 penalty for missing regime data is
 * gone (D6).
 */
export function computeOverallEIV(overallScores: OverallScores): number {
  return eivFrom({
    hitRate: overallScores.hitRate,
    avgReturnBps: overallScores.avgReturnBps,
    brierScore: overallScores.brierScore,
    sampleSize: overallScores.totalClaims,
  });
}

/**
 * EIV within the current regime, from the outcomes entered in it, or null
 * when the entity has fewer than MIN_REGIME_OUTCOMES there: its record in
 * this regime is too thin to rank, so it has none rather than its overall EIV
 * under another name.
 */
export function computeRegimeAwareEIV(
  regimeHistory: EntityRegimeHistory[],
  currentRegime: MarketRegime,
): number | null {
  const regimeData = regimeHistory.find(
    (r) => r.regime === currentRegime && r.sampleSize >= MIN_REGIME_OUTCOMES,
  );
  return regimeData ? eivFrom(regimeData) : null;
}

/**
 * The regime of the latest snapshot on or before `date` (YYYY-MM-DD), or null
 * when the first snapshot came later. `snapshots` must be sorted by asOfDate,
 * oldest first.
 */
export function regimeOnDate(
  snapshots: ReadonlyArray<{ asOfDate: string; regime: string }>,
  date: string,
): MarketRegime | null {
  let lo = 0;
  let hi = snapshots.length - 1;
  let found: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid]!.asOfDate <= date) {
      found = snapshots[mid]!.regime;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found as MarketRegime | null;
}

export interface RegimeTaggedOutcome {
  /** The regime on the outcome's entry date; null before the first snapshot. */
  regime: MarketRegime | null;
  direction: string;
  directionCorrect: boolean;
  returnBps: number;
  /** The claim's confidence, or null when it has none or is not Brier-scored. */
  confidence: number | null;
}

/**
 * Each regime's record from regime-tagged outcomes, for the regimes with at
 * least MIN_REGIME_OUTCOMES. Hit rate counts every outcome; the average return
 * counts positions only (a neutral claim takes none). Brier covers the
 * outcomes with a confidence, and is 0.5 when none has one.
 */
export function buildRegimeHistory(outcomes: RegimeTaggedOutcome[]): EntityRegimeHistory[] {
  const byRegime = new Map<MarketRegime, RegimeTaggedOutcome[]>();
  for (const outcome of outcomes) {
    if (outcome.regime === null) continue;
    const list = byRegime.get(outcome.regime) ?? [];
    list.push(outcome);
    byRegime.set(outcome.regime, list);
  }

  const history: EntityRegimeHistory[] = [];
  for (const [regime, list] of byRegime) {
    if (list.length < MIN_REGIME_OUTCOMES) continue;
    const predictions = list
      .filter((o) => o.confidence !== null)
      .map((o) => ({ confidence: o.confidence!, correct: o.directionCorrect }));
    history.push({
      regime,
      hitRate: hitRate(list),
      avgReturnBps: avgReturnBps(outcomesWithPosition(list)),
      sampleSize: list.length,
      brierScore: predictions.length > 0 ? brierScore(predictions) : 0.5,
    });
  }
  return history;
}

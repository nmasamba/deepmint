/**
 * Regime-Aware Expected Information Value (build_spec §2.7).
 * Bayesian shrinkage with sample size penalty.
 */

import type { MarketRegime } from "./regime";

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

/**
 * Compute regime-aware EIV (0-100 scale).
 *
 * Uses regime-specific data if available, otherwise falls back
 * to overall scores with a 0.4× penalty (Bayesian shrinkage).
 */
export function computeRegimeAwareEIV(
  overallScores: OverallScores,
  regimeHistory: EntityRegimeHistory[],
  currentRegime: MarketRegime
): number {
  const regimeData = regimeHistory.find((r) => r.regime === currentRegime);

  const rate = regimeData ? regimeData.hitRate : overallScores.hitRate;
  const avgReturn = regimeData
    ? regimeData.avgReturnBps
    : overallScores.avgReturnBps;
  const brier = regimeData ? regimeData.brierScore : overallScores.brierScore;
  const n = regimeData ? regimeData.sampleSize : 0;

  // Edge: how much better than coin flip
  const edge = rate - 0.5;
  if (edge <= 0) return 0;

  const confidenceFactor = Math.max(0, 1 - brier);
  const sampleFactor = n / (n + 20); // Bayesian shrinkage toward 0
  const regimePenalty = regimeData ? 1.0 : 0.4;

  const rawEIV =
    edge * Math.abs(avgReturn / 100) * confidenceFactor * sampleFactor * regimePenalty;
  const scaled = Math.min(100, (rawEIV / 5) * 100);

  return Math.round(scaled * 10) / 10;
}

/**
 * Format EIV with human-readable label and optional regime warning.
 */
export function formatEIVWithContext(
  eiv: number,
  currentRegime: MarketRegime,
  hasRegimeData: boolean
): { score: number; label: string; warning: string | null } {
  return {
    score: eiv,
    label:
      eiv >= 60
        ? "Strong Edge"
        : eiv >= 30
          ? "Moderate Edge"
          : eiv > 0
            ? "Weak Edge"
            : "No Edge",
    warning: !hasRegimeData
      ? `Limited data in ${currentRegime} regime — score based on overall performance with shrinkage applied.`
      : null,
  };
}

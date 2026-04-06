/**
 * Market regime detection (build_spec §2.4).
 */

export type MarketRegime = "bull" | "bear" | "high_vol" | "low_vol" | "rotation";

export interface RegimeInput {
  sp500Return30d: number; // S&P 500 trailing 30-day return (decimal, e.g. 0.03 = 3%)
  vixLevel: number; // Current VIX level
  sectorDispersion: number; // Cross-sector return dispersion
}

/**
 * Detect current market regime from macro indicators.
 *
 * Priority:
 * 1. High VIX (>25) → high_vol
 * 2. Low VIX (<13) → low_vol
 * 3. Strong S&P rally (>3%) → bull
 * 4. Strong S&P decline (<-3%) → bear
 * 5. High sector dispersion (>15%) → rotation
 * 6. Default → bull
 */
export function detectRegime(data: RegimeInput): MarketRegime {
  if (data.vixLevel > 25) return "high_vol";
  if (data.vixLevel < 13) return "low_vol";
  if (data.sp500Return30d > 0.03) return "bull";
  if (data.sp500Return30d < -0.03) return "bear";
  if (data.sectorDispersion > 0.15) return "rotation";
  return "bull"; // default
}

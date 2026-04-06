/**
 * Anti-gaming checks (build_spec §2.2).
 * Validates that player statistics meet minimum thresholds
 * and penalises suspicious patterns.
 */

export interface AntiGamingResult {
  isEligible: boolean;
  penalties: { reason: string; multiplier: number }[];
}

export interface PlayerStats {
  tradeCount: number;
  daysActive: number;
  returnKurtosis: number;
  avgTurnoverPerDay: number;
  maxLeverage: number;
  declaredMaxLeverage: number;
}

/**
 * Check anti-gaming rules. Returns eligibility and any penalty multipliers.
 *
 * Rules:
 * - Minimum 30 trades and 90 days active
 * - Kurtosis > 6 → penalty (lottery-ticket detection)
 * - Turnover > 5/day → penalty (overtrading)
 * - Leverage mismatch > 1.5× declared → penalty
 */
export function checkAntiGaming(stats: PlayerStats): AntiGamingResult {
  const penalties: { reason: string; multiplier: number }[] = [];

  // Minimum thresholds
  if (stats.tradeCount < 30 || stats.daysActive < 90) {
    return {
      isEligible: false,
      penalties: [{ reason: "Insufficient history", multiplier: 0 }],
    };
  }

  // Kurtosis penalty (lottery-ticket detection)
  if (stats.returnKurtosis > 6) {
    penalties.push({
      reason: `High kurtosis (${stats.returnKurtosis.toFixed(1)})`,
      multiplier: Math.max(0.5, 1 - (stats.returnKurtosis - 6) * 0.05),
    });
  }

  // Turnover penalty (overtrading)
  if (stats.avgTurnoverPerDay > 5) {
    penalties.push({ reason: "Excessive turnover", multiplier: 0.8 });
  }

  // Leverage mismatch
  if (
    stats.declaredMaxLeverage > 0 &&
    stats.maxLeverage > stats.declaredMaxLeverage * 1.5
  ) {
    penalties.push({ reason: "Undisclosed leverage", multiplier: 0.7 });
  }

  return { isEligible: true, penalties };
}

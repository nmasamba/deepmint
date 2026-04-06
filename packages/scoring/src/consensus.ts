/**
 * Consensus signal computation (build_spec §2.6).
 * Computes weighted directional signal from active claims.
 */

export type ConsensusDirection = "bullish" | "bearish" | "neutral";

export interface ClaimWithWeight {
  direction: "long" | "short" | "neutral";
  entityType: "player" | "guide";
  entityScore: number;
  hasBrokerVerification: boolean;
  confidence: number | null;
  horizonDays: number;
  ageHours: number;
}

export interface ConsensusResult {
  direction: ConsensusDirection;
  bullishScore: number;
  bearishScore: number;
  neutralScore: number;
  convictionStrength: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
}

/**
 * Compute weighted consensus signal from a set of claims.
 *
 * Weights:
 * - Base: entity score (min 1)
 * - Guide claims: ×1.2
 * - Broker-verified: ×1.5
 * - Recency decay: exp(-0.03 × ageInDays)
 * - Confidence boost: 0.5 + (confidence / 200)
 */
export function computeConsensusSignal(
  claims: ClaimWithWeight[]
): ConsensusResult {
  const empty: ConsensusResult = {
    direction: "neutral",
    bullishScore: 0,
    bearishScore: 0,
    neutralScore: 0,
    convictionStrength: 0,
    longCount: 0,
    shortCount: 0,
    neutralCount: 0,
  };

  if (claims.length === 0) return empty;

  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  let longCount = 0;
  let shortCount = 0;
  let neutralCount = 0;

  for (const c of claims) {
    let weight = Math.max(c.entityScore, 1);

    // Guide bonus
    if (c.entityType === "guide") weight *= 1.2;

    // Broker-verified bonus
    if (c.hasBrokerVerification) weight *= 1.5;

    // Recency decay (age in days)
    const decayFactor = Math.exp((-0.03 * c.ageHours) / 24);
    weight *= decayFactor;

    // Confidence boost
    if (c.confidence !== null) {
      weight *= 0.5 + c.confidence / 200;
    }

    if (c.direction === "long") {
      bullish += weight;
      longCount++;
    } else if (c.direction === "short") {
      bearish += weight;
      shortCount++;
    } else {
      neutral += weight;
      neutralCount++;
    }
  }

  const total = bullish + bearish + neutral;
  if (total === 0) return empty;

  const bNorm = bullish / total;
  const sNorm = bearish / total;
  const nNorm = neutral / total;

  const direction: ConsensusDirection =
    bNorm >= sNorm && bNorm >= nNorm
      ? "bullish"
      : sNorm >= bNorm && sNorm >= nNorm
        ? "bearish"
        : "neutral";

  // Conviction: distance from uniform distribution (higher = more conviction)
  const conviction = Math.sqrt(bNorm ** 2 + sNorm ** 2 + nNorm ** 2);
  const minConviction = 1 / Math.sqrt(3); // uniform = ~0.577
  const convictionStrength = (conviction - minConviction) / (1 - minConviction);

  return {
    direction,
    bullishScore: bNorm,
    bearishScore: sNorm,
    neutralScore: nNorm,
    convictionStrength: Math.max(0, Math.min(1, convictionStrength)),
    longCount,
    shortCount,
    neutralCount,
  };
}

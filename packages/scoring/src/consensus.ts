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
 * Weight multiplier for a claim's self-reported confidence.
 *
 * An UNSTATED confidence is the NEUTRAL MIDPOINT (1.0) — identical to stating
 * 50 — never the maximum. Under the previous form (0.5 + c/200) the maximum
 * over all stated values was 1.0, which merely TIED null: every honest value
 * below 100 was a strict penalty and saying nothing was weakly dominant.
 * Ingested third-party ratings carry a null confidence, so institutions
 * collected the maximum for free while a user who honestly moved the slider
 * to 40 was weighted 0.70× relative to them.
 *
 * Range [0.75, 1.25], symmetric about 1.0 and deliberately narrower than the
 * Guide (×1.2) and broker-verified (×1.5) multipliers it sits alongside:
 * confidence is caller-supplied and unverifiable, so it must not be able to
 * outweigh broker verification.
 *
 * The clamp is load-bearing, not defensive: claims.confidence is a bare
 * integer column with no CHECK constraint and is writable through the tRPC
 * and MCP claim APIs, so an out-of-range value would otherwise buy unbounded
 * weight (confidence 10000 => 50.75× under the old form).
 */
export function confidenceMultiplier(confidence: number | null): number {
  if (confidence === null) return 1.0;
  const c = Math.max(0, Math.min(100, confidence));
  return 0.75 + c / 200;
}

/**
 * Compute weighted consensus signal from a set of claims.
 *
 * Weights:
 * - Base: entity score (min 1)
 * - Guide claims: ×1.2
 * - Broker-verified: ×1.5
 * - Recency decay: exp(-0.03 × ageInDays)
 * - Confidence adjustment: confidenceMultiplier() — centred on 1.0, with an
 *   UNSTATED confidence at the neutral midpoint rather than the maximum.
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

    // Confidence adjustment (see confidenceMultiplier).
    weight *= confidenceMultiplier(c.confidence);

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

  // A genuine tie (bullish weight exactly equals bearish weight) is not a
  // directional signal — report neutral rather than always defaulting to
  // bullish via non-strict comparisons.
  const top = Math.max(bNorm, sNorm, nNorm);
  const direction: ConsensusDirection =
    bNorm === top && sNorm === top
      ? "neutral"
      : bNorm === top
        ? "bullish"
        : sNorm === top
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

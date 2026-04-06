import { describe, it, expect } from "vitest";
import { computeConsensusSignal } from "../consensus";
import type { ClaimWithWeight } from "../consensus";

describe("computeConsensusSignal", () => {
  it("returns neutral for empty claims", () => {
    const result = computeConsensusSignal([]);
    expect(result.direction).toBe("neutral");
    expect(result.convictionStrength).toBe(0);
  });

  it("returns bullish for all long claims", () => {
    const claims: ClaimWithWeight[] = [
      {
        direction: "long",
        entityType: "player",
        entityScore: 5,
        hasBrokerVerification: false,
        confidence: 80,
        horizonDays: 30,
        ageHours: 24,
      },
      {
        direction: "long",
        entityType: "guide",
        entityScore: 10,
        hasBrokerVerification: false,
        confidence: 90,
        horizonDays: 30,
        ageHours: 48,
      },
    ];
    const result = computeConsensusSignal(claims);
    expect(result.direction).toBe("bullish");
    expect(result.bullishScore).toBe(1);
    expect(result.longCount).toBe(2);
    expect(result.convictionStrength).toBeGreaterThan(0.5);
  });

  it("weights guides higher than players", () => {
    const guideClaim: ClaimWithWeight = {
      direction: "long",
      entityType: "guide",
      entityScore: 5,
      hasBrokerVerification: false,
      confidence: null,
      horizonDays: 30,
      ageHours: 0,
    };
    const playerClaim: ClaimWithWeight = {
      direction: "short",
      entityType: "player",
      entityScore: 5,
      hasBrokerVerification: false,
      confidence: null,
      horizonDays: 30,
      ageHours: 0,
    };
    const result = computeConsensusSignal([guideClaim, playerClaim]);
    // Guide has 1.2x weight → bullish should win
    expect(result.direction).toBe("bullish");
  });

  it("weights broker-verified higher", () => {
    const verified: ClaimWithWeight = {
      direction: "short",
      entityType: "player",
      entityScore: 5,
      hasBrokerVerification: true,
      confidence: null,
      horizonDays: 30,
      ageHours: 0,
    };
    const unverified: ClaimWithWeight = {
      direction: "long",
      entityType: "player",
      entityScore: 5,
      hasBrokerVerification: false,
      confidence: null,
      horizonDays: 30,
      ageHours: 0,
    };
    const result = computeConsensusSignal([verified, unverified]);
    // Verified has 1.5x → bearish should win
    expect(result.direction).toBe("bearish");
  });

  it("applies recency decay", () => {
    const recent: ClaimWithWeight = {
      direction: "long",
      entityType: "player",
      entityScore: 5,
      hasBrokerVerification: false,
      confidence: null,
      horizonDays: 30,
      ageHours: 1, // very recent
    };
    const old: ClaimWithWeight = {
      direction: "short",
      entityType: "player",
      entityScore: 5,
      hasBrokerVerification: false,
      confidence: null,
      horizonDays: 30,
      ageHours: 720, // 30 days old
    };
    const result = computeConsensusSignal([recent, old]);
    // Recent should dominate due to decay
    expect(result.direction).toBe("bullish");
  });
});

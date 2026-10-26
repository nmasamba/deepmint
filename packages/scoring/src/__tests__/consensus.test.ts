import { describe, it, expect } from "vitest";
import { computeConsensusSignal, computeTargetStats } from "../consensus";
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

  it("reports neutral for an exact bullish/bearish tie", () => {
    // Two mirror-image claims with identical weights → a deadlocked market
    // must not default to bullish (regression: non-strict >= comparisons used
    // to always pick bullish on a tie).
    const base = {
      entityType: "player" as const,
      entityScore: 5,
      hasBrokerVerification: false,
      confidence: null,
      horizonDays: 30,
      ageHours: 0,
    };
    const result = computeConsensusSignal([
      { ...base, direction: "long" },
      { ...base, direction: "short" },
    ]);
    expect(result.bullishScore).toBeCloseTo(0.5, 6);
    expect(result.bearishScore).toBeCloseTo(0.5, 6);
    expect(result.direction).toBe("neutral");
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
      horizonDays: 90, // still live at 30 days
      ageHours: 720, // 30 days old
    };
    const result = computeConsensusSignal([recent, old]);
    // Recent should dominate due to decay
    expect(result.direction).toBe("bullish");
  });

  it("skips claims whose horizon has passed", () => {
    const base = {
      entityType: "guide" as const,
      entityScore: 5,
      hasBrokerVerification: false,
      confidence: null,
    };
    const result = computeConsensusSignal([
      { ...base, direction: "long", horizonDays: 7, ageHours: 24 },
      // An expired 1-day short, at any age past its horizon, must not count.
      { ...base, direction: "short", horizonDays: 1, ageHours: 24 },
      { ...base, direction: "short", horizonDays: 30, ageHours: 31 * 24 },
    ]);
    expect(result.longCount).toBe(1);
    expect(result.shortCount).toBe(0);
    expect(result.direction).toBe("bullish");
    expect(result.bullishScore).toBe(1);
  });
});

describe("computeTargetStats", () => {
  const live = { horizonDays: 90, ageHours: 24 };

  it("returns nulls when no live claim has a target", () => {
    expect(
      computeTargetStats([
        { ...live, targetPriceCents: null },
        { ...live, targetPriceCents: undefined },
        { horizonDays: 1, ageHours: 48, targetPriceCents: 25000 }, // expired
      ]),
    ).toEqual({ avgTargetPriceCents: null, targetDispersionBps: null });
  });

  it("gives an average but no dispersion for a single target", () => {
    expect(computeTargetStats([{ ...live, targetPriceCents: 30000 }])).toEqual({
      avgTargetPriceCents: 30000,
      targetDispersionBps: null,
    });
  });

  it("averages live targets and reports their spread in bps of the mean", () => {
    // Targets $200 and $220: mean $210, population sd $10 => 476 bps.
    const stats = computeTargetStats([
      { ...live, targetPriceCents: 20000 },
      { ...live, targetPriceCents: 22000 },
      { ...live, targetPriceCents: null },
      { horizonDays: 7, ageHours: 7 * 24, targetPriceCents: 99900 }, // expired
    ]);
    expect(stats).toEqual({ avgTargetPriceCents: 21000, targetDispersionBps: 476 });
  });

  it("reports zero dispersion when every target agrees", () => {
    expect(
      computeTargetStats([
        { ...live, targetPriceCents: 30000 },
        { ...live, targetPriceCents: 30000 },
      ]),
    ).toEqual({ avgTargetPriceCents: 30000, targetDispersionBps: 0 });
  });
});

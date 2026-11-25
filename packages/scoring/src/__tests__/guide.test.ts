import { describe, it, expect } from "vitest";
import {
  hitRate,
  avgReturnBps,
  zTestSignificance,
  brierScore,
  targetPrecision,
  targetCoverage,
  targetHitRate,
  isUsableTarget,
} from "../guide";

describe("hitRate", () => {
  it("returns 0 for empty array", () => {
    expect(hitRate([])).toBe(0);
  });

  it("computes hit rate correctly", () => {
    const outcomes = [
      { directionCorrect: true },
      { directionCorrect: true },
      { directionCorrect: false },
      { directionCorrect: true },
    ];
    expect(hitRate(outcomes)).toBeCloseTo(0.75);
  });

  it("returns 1.0 for perfect record", () => {
    const outcomes = [{ directionCorrect: true }, { directionCorrect: true }];
    expect(hitRate(outcomes)).toBe(1);
  });
});

describe("avgReturnBps", () => {
  it("returns 0 for empty array", () => {
    expect(avgReturnBps([])).toBe(0);
  });

  it("computes average correctly", () => {
    const outcomes = [
      { returnBps: 100 },
      { returnBps: -50 },
      { returnBps: 200 },
    ];
    expect(avgReturnBps(outcomes)).toBeCloseTo(83.333, 1);
  });
});

describe("zTestSignificance", () => {
  it("returns not significant for zero sample", () => {
    const result = zTestSignificance(0.6, 0);
    expect(result.isSignificant).toBe(false);
  });

  it("returns not significant for small sample", () => {
    const result = zTestSignificance(0.7, 10);
    expect(result.isSignificant).toBe(false); // n < 15
  });

  it("returns significant for high hit rate and large sample", () => {
    const result = zTestSignificance(0.7, 100);
    expect(result.isSignificant).toBe(true);
    expect(result.zScore).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("returns not significant for coin-flip rate", () => {
    const result = zTestSignificance(0.5, 100);
    expect(result.zScore).toBeCloseTo(0, 0);
    expect(result.isSignificant).toBe(false);
  });
});

describe("brierScore", () => {
  it("returns 1 for empty predictions", () => {
    expect(brierScore([])).toBe(1);
  });

  it("returns 0 for perfect calibration", () => {
    const predictions = [
      { confidence: 100, correct: true },
      { confidence: 0, correct: false },
    ];
    expect(brierScore(predictions)).toBeCloseTo(0);
  });

  it("returns 1 for worst calibration", () => {
    const predictions = [
      { confidence: 100, correct: false },
      { confidence: 0, correct: true },
    ];
    expect(brierScore(predictions)).toBeCloseTo(1);
  });

  it("returns 0.25 for 50% confidence on all correct", () => {
    const predictions = [
      { confidence: 50, correct: true },
      { confidence: 50, correct: true },
    ];
    // (0.5 - 1)^2 = 0.25
    expect(brierScore(predictions)).toBeCloseTo(0.25);
  });
});

describe("targetPrecision", () => {
  it("returns null (not 0) when no target was ever published", () => {
    // "Never published a target" must stay distinguishable from "published
    // targets and missed every one" — a 0 would conflate the two and make a
    // Guide who publishes no targets look identical to one who is always wrong.
    const outcomes = [
      { targetPriceCents: null, exitPriceCents: 110, entryPriceCents: 100 },
    ];
    expect(targetPrecision(outcomes)).toBeNull();
  });

  it("scores a wrong-way move at 0, not a perfect 1.0", () => {
    // Regression: the old body took Math.abs of both the target move and the
    // actual move, so a long from 100 with a 120 target closing at 80 — a 20%
    // loss on a call for a 20% gain — scored a PERFECT 1.0.
    const longGoneWrong = [
      { targetPriceCents: 120, exitPriceCents: 80, entryPriceCents: 100 },
    ];
    expect(targetPrecision(longGoneWrong)).toBe(0);

    // The short mirror: target 80 (predicting a fall), price rises to 120.
    const shortGoneWrong = [
      { targetPriceCents: 80, exitPriceCents: 120, entryPriceCents: 100 },
    ];
    expect(targetPrecision(shortGoneWrong)).toBe(0);
  });

  it("scores a correct short call toward its target", () => {
    // Target 80 from 100 (predicting -20%); closes at 90, i.e. half way there.
    const outcomes = [
      { targetPriceCents: 80, exitPriceCents: 90, entryPriceCents: 100 },
    ];
    expect(targetPrecision(outcomes)).toBeCloseTo(0.5);
  });

  it("excludes a trivially small target rather than scoring it 1.0", () => {
    // A 1-cent target on a $100 stock is not a forecast. With a 1% floor it is
    // excluded, leaving no scoreable target at all.
    const outcomes = [
      {
        targetPriceCents: 10001,
        exitPriceCents: 10001,
        entryPriceCents: 10000,
        minMoveFrac: 0.01,
      },
    ];
    expect(targetPrecision(outcomes)).toBeNull();
  });

  it("returns 1.0 when target exactly met", () => {
    const outcomes = [
      { targetPriceCents: 120, exitPriceCents: 120, entryPriceCents: 100 },
    ];
    expect(targetPrecision(outcomes)).toBeCloseTo(1.0);
  });

  it("returns fraction when partially met", () => {
    const outcomes = [
      { targetPriceCents: 120, exitPriceCents: 110, entryPriceCents: 100 },
    ];
    // target move=20, actual move=10, precision=0.5
    expect(targetPrecision(outcomes)).toBeCloseTo(0.5);
  });

  it("applies the 1% floor by default", () => {
    // The scorer passes no minMoveFrac: a 1-cent target on $100 is excluded,
    // and a 0.43% target on $230 no longer scores a near-trivial result.
    expect(
      targetPrecision([{ targetPriceCents: 10001, exitPriceCents: 10500, entryPriceCents: 10000 }]),
    ).toBeNull();
    expect(
      targetPrecision([
        { targetPriceCents: 25000, exitPriceCents: 23435, entryPriceCents: 23000 },
        { targetPriceCents: 23100, exitPriceCents: 22679, entryPriceCents: 23000 },
      ]),
    ).toBeCloseTo(435 / 2000);
  });
});

describe("isUsableTarget", () => {
  it("needs a target more than 1% from entry, either side", () => {
    expect(isUsableTarget(10200, 10000)).toBe(true);
    expect(isUsableTarget(9800, 10000)).toBe(true);
    expect(isUsableTarget(10100, 10000)).toBe(false); // exactly 1%
    expect(isUsableTarget(10001, 10000)).toBe(false);
    expect(isUsableTarget(null, 10000)).toBe(false);
    expect(isUsableTarget(10200, 0)).toBe(false);
  });

  it("takes an explicit floor", () => {
    expect(isUsableTarget(10050, 10000, 0)).toBe(true);
    expect(isUsableTarget(10400, 10000, 0.05)).toBe(false);
  });
});

describe("targetCoverage", () => {
  it("counts only usable targets", () => {
    expect(
      targetCoverage([
        { targetPriceCents: 25000, entryPriceCents: 23000 },
        { targetPriceCents: 23100, entryPriceCents: 23000 }, // within 1%
      ]),
    ).toBe(0.5);
    expect(
      targetCoverage([
        { targetPriceCents: 12000, entryPriceCents: 10000 },
        { targetPriceCents: null, entryPriceCents: 10000 },
        { targetPriceCents: 8000, entryPriceCents: 10000 },
      ]),
    ).toBeCloseTo(2 / 3);
    expect(targetCoverage([])).toBe(0);
  });
});

describe("targetHitRate", () => {
  const long = { direction: "long" as const, entryPriceCents: 10000 };
  const short = { direction: "short" as const, entryPriceCents: 10000 };

  it("returns null when no usable target was published", () => {
    expect(targetHitRate([])).toBeNull();
    expect(
      targetHitRate([
        { ...long, targetPriceCents: null, targetHit: null },
        { ...long, targetPriceCents: 10050, targetHit: true }, // within 1%
      ]),
    ).toBeNull();
  });

  it("returns 0, not null, when every target was missed", () => {
    expect(targetHitRate([{ ...long, targetPriceCents: 12000, targetHit: false }])).toBe(0);
  });

  it("is the share of usable targets that were hit, long and short", () => {
    expect(
      targetHitRate([
        { ...long, targetPriceCents: 12000, targetHit: true },
        { ...long, targetPriceCents: 15000, targetHit: false },
        { ...short, targetPriceCents: 9000, targetHit: true },
        { ...long, targetPriceCents: null, targetHit: null },
      ]),
    ).toBeCloseTo(2 / 3);
  });

  it("leaves out a target the entry had already passed", () => {
    // Markout calls these hit on the first bar: a long with its target below
    // the entry, and a short with its target above it.
    expect(
      targetHitRate([
        { ...long, targetPriceCents: 9000, targetHit: true },
        { ...short, targetPriceCents: 11000, targetHit: true },
        { ...long, targetPriceCents: 12000, targetHit: false },
      ]),
    ).toBe(0);
  });

  it("leaves out neutral claims", () => {
    expect(
      targetHitRate([
        { direction: "neutral", entryPriceCents: 10000, targetPriceCents: 12000, targetHit: true },
      ]),
    ).toBeNull();
  });
});

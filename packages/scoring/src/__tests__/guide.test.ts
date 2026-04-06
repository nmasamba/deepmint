import { describe, it, expect } from "vitest";
import {
  hitRate,
  avgReturnBps,
  zTestSignificance,
  brierScore,
  targetPrecision,
  computeSliceOutcome,
  continuousBrierScore,
  timeDecayedBrierScore,
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
  it("returns 0 for no targets", () => {
    const outcomes = [
      { targetPriceCents: null, exitPriceCents: 110, entryPriceCents: 100 },
    ];
    expect(targetPrecision(outcomes)).toBe(0);
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
});

describe("computeSliceOutcome", () => {
  it("returns 1 for correct long direction", () => {
    expect(
      computeSliceOutcome({
        direction: "long",
        entryPriceCents: 10000,
        snapshotPriceCents: 10500,
      })
    ).toBe(1);
  });

  it("returns 0 for wrong long direction", () => {
    expect(
      computeSliceOutcome({
        direction: "long",
        entryPriceCents: 10000,
        snapshotPriceCents: 9500,
      })
    ).toBe(0);
  });

  it("returns 1 for correct short direction", () => {
    expect(
      computeSliceOutcome({
        direction: "short",
        entryPriceCents: 10000,
        snapshotPriceCents: 9500,
      })
    ).toBe(1);
  });

  it("returns 1 for neutral within 2%", () => {
    expect(
      computeSliceOutcome({
        direction: "neutral",
        entryPriceCents: 10000,
        snapshotPriceCents: 10100, // 1% move
      })
    ).toBe(1);
  });

  it("returns 0 for neutral beyond 2%", () => {
    expect(
      computeSliceOutcome({
        direction: "neutral",
        entryPriceCents: 10000,
        snapshotPriceCents: 10300, // 3% move
      })
    ).toBe(0);
  });
});

describe("continuousBrierScore", () => {
  it("returns 1 for empty slices", () => {
    expect(continuousBrierScore([])).toBe(1);
  });

  it("returns 0 for perfect forecasts", () => {
    const slices = [
      { forecastProbability: 1, outcome: 1 as const },
      { forecastProbability: 0, outcome: 0 as const },
    ];
    expect(continuousBrierScore(slices)).toBeCloseTo(0);
  });
});

describe("timeDecayedBrierScore", () => {
  it("returns 1 for empty slices", () => {
    expect(timeDecayedBrierScore([])).toBe(1);
  });

  it("weights recent slices more heavily", () => {
    const slices = [
      { daysBeforeResolution: 30, forecastProbability: 0.5, outcome: 1 as const }, // old, bad
      { daysBeforeResolution: 1, forecastProbability: 0.9, outcome: 1 as const }, // recent, good
    ];
    const decayed = timeDecayedBrierScore(slices);
    const uniform = continuousBrierScore(
      slices.map((s) => ({
        forecastProbability: s.forecastProbability,
        outcome: s.outcome,
      }))
    );
    // Decayed should be lower (better) because recent slice is better
    expect(decayed).toBeLessThan(uniform);
  });
});

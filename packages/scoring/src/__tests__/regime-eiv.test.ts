import { describe, it, expect } from "vitest";
import { detectRegime, toRegimeSnapshotValues, fromRegimeSnapshotValues } from "../regime";
import {
  MIN_REGIME_OUTCOMES,
  buildRegimeHistory,
  computeOverallEIV,
  computeRegimeAwareEIV,
  regimeOnDate,
  type EntityRegimeHistory,
  type RegimeTaggedOutcome,
} from "../eiv";

describe("detectRegime", () => {
  it("detects high_vol when VIX > 25", () => {
    expect(
      detectRegime({ sp500Return30d: 0.05, vixLevel: 30, sectorDispersion: 0.1 })
    ).toBe("high_vol");
  });

  it("detects low_vol when VIX < 13", () => {
    expect(
      detectRegime({ sp500Return30d: 0.01, vixLevel: 10, sectorDispersion: 0.05 })
    ).toBe("low_vol");
  });

  it("detects bull when S&P > 3%", () => {
    expect(
      detectRegime({ sp500Return30d: 0.05, vixLevel: 18, sectorDispersion: 0.1 })
    ).toBe("bull");
  });

  it("detects bear when S&P < -3%", () => {
    expect(
      detectRegime({ sp500Return30d: -0.05, vixLevel: 20, sectorDispersion: 0.1 })
    ).toBe("bear");
  });

  it("detects rotation when high sector dispersion", () => {
    expect(
      detectRegime({ sp500Return30d: 0.01, vixLevel: 18, sectorDispersion: 0.2 })
    ).toBe("rotation");
  });

  it("defaults to bull", () => {
    expect(
      detectRegime({ sp500Return30d: 0.01, vixLevel: 18, sectorDispersion: 0.05 })
    ).toBe("bull");
  });
});

const bull = (overrides: Partial<EntityRegimeHistory> = {}): EntityRegimeHistory => ({
  regime: "bull",
  hitRate: 0.65,
  avgReturnBps: 200,
  sampleSize: 50,
  brierScore: 0.2,
  ...overrides,
});

describe("computeOverallEIV", () => {
  it("returns 0 for coin-flip hit rate", () => {
    expect(
      computeOverallEIV({ hitRate: 0.5, avgReturnBps: 100, brierScore: 0.25, totalClaims: 50 }),
    ).toBe(0);
  });

  it("returns 0 for below coin-flip hit rate", () => {
    expect(
      computeOverallEIV({ hitRate: 0.4, avgReturnBps: 100, brierScore: 0.25, totalClaims: 50 }),
    ).toBe(0);
  });

  it("carries no fixed penalty: the sample factor is the only shrinkage", () => {
    // 0.15 edge × 2.00 return × 0.8 confidence × 100/120 sample = 0.2 → 4.0.
    // The old fallback multiplied this by 0.4, giving 1.6.
    expect(
      computeOverallEIV({ hitRate: 0.65, avgReturnBps: 200, brierScore: 0.2, totalClaims: 100 }),
    ).toBe(4);
  });

  it("returns 0 when average return is negative despite a positive hit rate", () => {
    // Directionally right >50% but net money-losing → not a profitable edge.
    // (regression: Math.abs(avgReturn) used to reward a negative average.)
    expect(
      computeOverallEIV({ hitRate: 0.65, avgReturnBps: -400, brierScore: 0.2, totalClaims: 100 }),
    ).toBe(0);
  });

  it("caps at 100", () => {
    expect(
      computeOverallEIV({ hitRate: 0.99, avgReturnBps: 10000, brierScore: 0, totalClaims: 1000 }),
    ).toBe(100);
  });
});

describe("computeRegimeAwareEIV", () => {
  it("scores the current regime's record", () => {
    // The same record overall and in the regime gives the same EIV.
    expect(computeRegimeAwareEIV([bull({ sampleSize: 100 })], "bull")).toBe(
      computeOverallEIV({ hitRate: 0.65, avgReturnBps: 200, brierScore: 0.2, totalClaims: 100 }),
    );
    expect(computeRegimeAwareEIV([bull({ hitRate: 0.7, avgReturnBps: 250 })], "bull")).toBeGreaterThan(0);
  });

  it("has no regime EIV below MIN_REGIME_OUTCOMES in the current regime", () => {
    expect(MIN_REGIME_OUTCOMES).toBe(5);
    expect(computeRegimeAwareEIV([bull({ sampleSize: 4 })], "bull")).toBeNull();
    expect(computeRegimeAwareEIV([bull({ sampleSize: 5 })], "bull")).toBeGreaterThan(0);
  });

  it("has no regime EIV when the record is in another regime", () => {
    expect(computeRegimeAwareEIV([bull()], "bear")).toBeNull();
    expect(computeRegimeAwareEIV([], "bull")).toBeNull();
  });

  it("returns 0 when the regime's average return is negative", () => {
    expect(computeRegimeAwareEIV([bull({ avgReturnBps: -400 })], "bull")).toBe(0);
  });
});

describe("regimeOnDate", () => {
  const snapshots = [
    { asOfDate: "2026-10-06", regime: "bull" },
    { asOfDate: "2026-10-07", regime: "high_vol" },
    { asOfDate: "2026-10-09", regime: "bear" },
  ];

  it("is null before the first snapshot", () => {
    expect(regimeOnDate(snapshots, "2026-10-05")).toBeNull();
    expect(regimeOnDate([], "2026-10-07")).toBeNull();
  });

  it("takes the snapshot of the date itself", () => {
    expect(regimeOnDate(snapshots, "2026-10-06")).toBe("bull");
    expect(regimeOnDate(snapshots, "2026-10-09")).toBe("bear");
  });

  it("takes the latest earlier snapshot on a day without one", () => {
    expect(regimeOnDate(snapshots, "2026-10-08")).toBe("high_vol");
    expect(regimeOnDate(snapshots, "2026-11-30")).toBe("bear");
  });
});

describe("buildRegimeHistory", () => {
  const outcome = (
    regime: RegimeTaggedOutcome["regime"],
    overrides: Partial<RegimeTaggedOutcome> = {},
  ): RegimeTaggedOutcome => ({
    regime,
    direction: "long",
    directionCorrect: true,
    returnBps: 100,
    confidence: null,
    ...overrides,
  });

  it("leaves out regimes with fewer than MIN_REGIME_OUTCOMES and untagged outcomes", () => {
    const history = buildRegimeHistory([
      ...Array.from({ length: 5 }, () => outcome("bull")),
      ...Array.from({ length: 4 }, () => outcome("bear")),
      ...Array.from({ length: 9 }, () => outcome(null)),
    ]);
    expect(history.map((r) => [r.regime, r.sampleSize])).toEqual([["bull", 5]]);
  });

  it("counts neutral claims toward hit rate but not average return", () => {
    const [record] = buildRegimeHistory([
      outcome("bull", { returnBps: 200 }),
      outcome("bull", { returnBps: 400 }),
      outcome("bull", { returnBps: -100, directionCorrect: false }),
      // A neutral claim's stored return is the raw move: it must not count.
      outcome("bull", { direction: "neutral", returnBps: 1000 }),
      outcome("bull", { direction: "neutral", returnBps: 0, directionCorrect: false }),
    ]);
    expect(record!.sampleSize).toBe(5);
    expect(record!.hitRate).toBeCloseTo(3 / 5, 10);
    expect(record!.avgReturnBps).toBeCloseTo(500 / 3, 10);
  });

  it("scores Brier on the outcomes with a confidence, else 0.5", () => {
    const withConfidence = buildRegimeHistory([
      outcome("bull", { confidence: 80 }),
      outcome("bull", { confidence: 60, directionCorrect: false }),
      outcome("bull"),
      outcome("bull"),
      outcome("bull"),
    ]);
    // ((0.8 - 1)^2 + (0.6 - 0)^2) / 2 = 0.2
    expect(withConfidence[0]!.brierScore).toBeCloseTo(0.2, 10);

    const without = buildRegimeHistory(Array.from({ length: 5 }, () => outcome("bull")));
    expect(without[0]!.brierScore).toBe(0.5);
  });
});

describe("regime snapshot conversion", () => {
  it("stores returns in whole basis points and VIX to 2 decimals", () => {
    expect(
      toRegimeSnapshotValues({ sp500Return30d: 0.03456, vixLevel: 17.234, sectorDispersion: 0.081249 }),
    ).toEqual({ vixLevel: "17.23", sp500Return30dBps: 346, sectorDispersionBps: 812 });
    expect(
      toRegimeSnapshotValues({ sp500Return30d: -0.0412, vixLevel: 31, sectorDispersion: 0 }),
    ).toEqual({ vixLevel: "31.00", sp500Return30dBps: -412, sectorDispersionBps: 0 });
  });

  it("round-trips to the same regime", () => {
    for (const input of [
      { sp500Return30d: 0.05, vixLevel: 18, sectorDispersion: 0.1 },
      { sp500Return30d: -0.05, vixLevel: 20, sectorDispersion: 0.1 },
      { sp500Return30d: 0.01, vixLevel: 30, sectorDispersion: 0.1 },
      { sp500Return30d: 0.01, vixLevel: 12, sectorDispersion: 0.1 },
      { sp500Return30d: 0.01, vixLevel: 18, sectorDispersion: 0.2 },
    ]) {
      const back = fromRegimeSnapshotValues(toRegimeSnapshotValues(input));
      expect(detectRegime(back)).toBe(detectRegime(input));
      expect(back.sp500Return30d).toBeCloseTo(input.sp500Return30d, 4);
    }
  });
});

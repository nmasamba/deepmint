import { describe, it, expect } from "vitest";
import { detectRegime } from "../regime";
import { computeRegimeAwareEIV, formatEIVWithContext } from "../eiv";

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

describe("computeRegimeAwareEIV", () => {
  it("returns 0 for coin-flip hit rate", () => {
    const result = computeRegimeAwareEIV(
      { hitRate: 0.5, avgReturnBps: 100, brierScore: 0.25, totalClaims: 50 },
      [],
      "bull"
    );
    expect(result).toBe(0);
  });

  it("returns 0 for below coin-flip hit rate", () => {
    const result = computeRegimeAwareEIV(
      { hitRate: 0.4, avgReturnBps: 100, brierScore: 0.25, totalClaims: 50 },
      [],
      "bull"
    );
    expect(result).toBe(0);
  });

  it("returns positive EIV for edge > 0.5", () => {
    const result = computeRegimeAwareEIV(
      { hitRate: 0.65, avgReturnBps: 200, brierScore: 0.2, totalClaims: 100 },
      [
        {
          regime: "bull",
          hitRate: 0.7,
          avgReturnBps: 250,
          sampleSize: 30,
          brierScore: 0.15,
        },
      ],
      "bull"
    );
    expect(result).toBeGreaterThan(0);
  });

  it("applies shrinkage penalty when no regime data", () => {
    const withRegime = computeRegimeAwareEIV(
      { hitRate: 0.65, avgReturnBps: 200, brierScore: 0.2, totalClaims: 100 },
      [
        {
          regime: "bull",
          hitRate: 0.65,
          avgReturnBps: 200,
          sampleSize: 50,
          brierScore: 0.2,
        },
      ],
      "bull"
    );
    const withoutRegime = computeRegimeAwareEIV(
      { hitRate: 0.65, avgReturnBps: 200, brierScore: 0.2, totalClaims: 100 },
      [],
      "bull"
    );
    expect(withRegime).toBeGreaterThan(withoutRegime);
  });

  it("caps at 100", () => {
    const result = computeRegimeAwareEIV(
      { hitRate: 0.99, avgReturnBps: 10000, brierScore: 0, totalClaims: 1000 },
      [
        {
          regime: "bull",
          hitRate: 0.99,
          avgReturnBps: 10000,
          sampleSize: 500,
          brierScore: 0,
        },
      ],
      "bull"
    );
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe("formatEIVWithContext", () => {
  it("labels strong edge for EIV >= 60", () => {
    const result = formatEIVWithContext(65, "bull", true);
    expect(result.label).toBe("Strong Edge");
    expect(result.warning).toBeNull();
  });

  it("labels moderate edge for EIV 30-59", () => {
    const result = formatEIVWithContext(45, "bear", true);
    expect(result.label).toBe("Moderate Edge");
  });

  it("warns when no regime data", () => {
    const result = formatEIVWithContext(20, "high_vol", false);
    expect(result.warning).toContain("high_vol");
    expect(result.warning).toContain("shrinkage");
  });

  it("labels no edge for 0", () => {
    const result = formatEIVWithContext(0, "bull", true);
    expect(result.label).toBe("No Edge");
  });
});

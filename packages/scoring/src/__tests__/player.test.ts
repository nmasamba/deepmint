import { describe, it, expect } from "vitest";
import {
  sharpeRatio,
  calmarRatio,
  cvar5,
  maxDrawdown,
  consistencyScore,
  maeAndMfe,
} from "../player";

describe("sharpeRatio", () => {
  it("returns 0 for empty array", () => {
    expect(sharpeRatio([])).toBe(0);
  });

  it("returns 0 for single value", () => {
    expect(sharpeRatio([0.01])).toBe(0);
  });

  it("returns 0 for zero std deviation", () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });

  it("computes annualised Sharpe for positive returns", () => {
    // Mean=0.001, std≈0.001414, Sharpe ≈ (0.001/0.001414)*√252 ≈ 11.22
    const returns = [0.002, 0.001, 0, 0.001, 0.001];
    const result = sharpeRatio(returns);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(30); // sanity check
  });

  it("returns negative Sharpe for negative returns", () => {
    const returns = [-0.01, -0.02, -0.015, -0.01, -0.02];
    expect(sharpeRatio(returns)).toBeLessThan(0);
  });
});

describe("calmarRatio", () => {
  it("returns 0 when maxDD is 0", () => {
    expect(calmarRatio(0.1, 0)).toBe(0);
  });

  it("computes ratio correctly", () => {
    expect(calmarRatio(0.2, 0.1)).toBeCloseTo(2.0);
  });

  it("handles negative annualised return", () => {
    expect(calmarRatio(-0.1, 0.2)).toBeCloseTo(-0.5);
  });
});

describe("cvar5", () => {
  it("returns 0 for empty array", () => {
    expect(cvar5([])).toBe(0);
  });

  it("returns worst returns for small sample", () => {
    const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05];
    // 5% of 8 = ceil(0.4) = 1, so just the worst return
    expect(cvar5(returns)).toBeCloseTo(-0.05);
  });

  it("averages tail for larger sample", () => {
    // 20 values, 5% = 1 value
    const returns = Array.from({ length: 20 }, (_, i) => (i - 10) * 0.01);
    const result = cvar5(returns);
    expect(result).toBeLessThan(0);
  });
});

describe("maxDrawdown", () => {
  it("returns 0 for empty array", () => {
    expect(maxDrawdown([])).toBe(0);
  });

  it("returns 0 for monotonically increasing curve", () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0);
  });

  it("computes drawdown correctly", () => {
    // Peak=120, trough=90, DD=30/120=25%
    const curve = [100, 110, 120, 90, 100, 95];
    expect(maxDrawdown(curve)).toBeCloseTo(0.25);
  });

  it("finds the largest drawdown", () => {
    const curve = [100, 80, 90, 50, 70]; // DD1=20%, DD2=100→50=50% from peak 100
    expect(maxDrawdown(curve)).toBeCloseTo(0.5);
  });
});

describe("consistencyScore", () => {
  it("returns 5 for insufficient data", () => {
    const returns = Array(30).fill(0.01);
    expect(consistencyScore(returns)).toBe(5);
  });

  it("returns high score for consistent returns", () => {
    // Slight variation to avoid zero stddev in sharpeRatio
    const returns = Array.from({ length: 200 }, (_, i) => 0.001 + (i % 2 === 0 ? 0.0001 : -0.0001));
    const score = consistencyScore(returns);
    expect(score).toBeGreaterThan(5); // Consistent returns → high consistency
    expect(score).toBeLessThanOrEqual(10);
  });
});

describe("maeAndMfe", () => {
  it("computes correctly for buy trade", () => {
    const result = maeAndMfe({
      entryPrice: 100,
      exitPrice: 110,
      highPrice: 115,
      lowPrice: 95,
      side: "buy",
    });
    expect(result.mae).toBeCloseTo(0.05); // (100-95)/100
    expect(result.mfe).toBeCloseTo(0.15); // (115-100)/100
  });

  it("computes correctly for sell trade", () => {
    const result = maeAndMfe({
      entryPrice: 100,
      exitPrice: 90,
      highPrice: 105,
      lowPrice: 88,
      side: "sell",
    });
    expect(result.mae).toBeCloseTo(0.05); // (105-100)/100
    expect(result.mfe).toBeCloseTo(0.12); // (100-88)/100
  });
});

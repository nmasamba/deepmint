import { describe, it, expect } from "vitest";
import { checkAntiGaming } from "../anti-gaming";

describe("checkAntiGaming", () => {
  const validStats = {
    tradeCount: 50,
    daysActive: 120,
    returnKurtosis: 3,
    avgTurnoverPerDay: 2,
    maxLeverage: 1,
    declaredMaxLeverage: 1,
  };

  it("rejects insufficient trade count", () => {
    const result = checkAntiGaming({ ...validStats, tradeCount: 10 });
    expect(result.isEligible).toBe(false);
    expect(result.penalties[0]?.reason).toBe("Insufficient history");
  });

  it("rejects insufficient days active", () => {
    const result = checkAntiGaming({ ...validStats, daysActive: 30 });
    expect(result.isEligible).toBe(false);
  });

  it("passes clean stats", () => {
    const result = checkAntiGaming(validStats);
    expect(result.isEligible).toBe(true);
    expect(result.penalties).toHaveLength(0);
  });

  it("penalises high kurtosis", () => {
    const result = checkAntiGaming({ ...validStats, returnKurtosis: 8 });
    expect(result.isEligible).toBe(true);
    expect(result.penalties).toHaveLength(1);
    expect(result.penalties[0]?.reason).toContain("kurtosis");
    expect(result.penalties[0]?.multiplier).toBeLessThan(1);
  });

  it("penalises excessive turnover", () => {
    const result = checkAntiGaming({ ...validStats, avgTurnoverPerDay: 10 });
    expect(result.isEligible).toBe(true);
    expect(result.penalties).toHaveLength(1);
    expect(result.penalties[0]?.reason).toBe("Excessive turnover");
  });

  it("penalises leverage mismatch", () => {
    const result = checkAntiGaming({
      ...validStats,
      maxLeverage: 5,
      declaredMaxLeverage: 2,
    });
    expect(result.isEligible).toBe(true);
    expect(result.penalties[0]?.reason).toBe("Undisclosed leverage");
  });

  it("accumulates multiple penalties", () => {
    const result = checkAntiGaming({
      ...validStats,
      returnKurtosis: 8,
      avgTurnoverPerDay: 10,
    });
    expect(result.isEligible).toBe(true);
    expect(result.penalties).toHaveLength(2);
  });
});

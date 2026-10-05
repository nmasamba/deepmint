import { describe, it, expect } from "vitest";
import { parseConfidenceScore } from "../extractor";

/**
 * claims.confidence is an INTEGER column. A fractional value from the model
 * used to reach the insert and fail it ("invalid input syntax for type
 * integer"), which aborted the rest of the post's claims.
 */
describe("parseConfidenceScore", () => {
  it("keeps whole numbers on the 0-100 scale", () => {
    for (const value of [0, 50, 85, 100]) {
      expect(parseConfidenceScore(value)).toBe(value);
    }
  });

  it("rounds fractions on the 0-100 scale", () => {
    expect(parseConfidenceScore(72.5)).toBe(73);
    expect(parseConfidenceScore(72.4)).toBe(72);
  });

  it("rescales values on a 0-1 scale", () => {
    expect(parseConfidenceScore(0.85)).toBe(85);
    expect(parseConfidenceScore(0.5)).toBe(50);
    expect(parseConfidenceScore(0.855)).toBe(86);
    expect(parseConfidenceScore(1)).toBe(100);
  });

  it("clamps out-of-range values", () => {
    expect(parseConfidenceScore(150)).toBe(100);
    expect(parseConfidenceScore(-5)).toBe(0);
  });

  it("returns null for anything that is not a finite number", () => {
    for (const value of [null, undefined, "85", NaN, Infinity, -Infinity, { score: 85 }]) {
      expect(parseConfidenceScore(value)).toBeNull();
    }
  });

  it("always yields an integer", () => {
    for (const value of [0.001, 0.333, 0.999, 1.5, 33.3333, 66.6667, 99.5]) {
      expect(Number.isInteger(parseConfidenceScore(value))).toBe(true);
    }
  });
});

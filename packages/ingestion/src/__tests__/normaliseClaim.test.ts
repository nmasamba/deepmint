import { describe, it, expect } from "vitest";
import { RATIONALE_TAGS } from "@deepmint/shared";
import { normaliseClaim, normaliseRationaleTags, normaliseTicker } from "../extractor";

const base = { instrument_ticker: "AAPL", direction: "long", horizon_days: 90 };

describe("normaliseTicker", () => {
  it.each([
    [" aapl ", "AAPL"],
    ["$NVDA", "NVDA"],
    ["$ tsla", "TSLA"],
    ["GOOG", "GOOGL"],
    ["$goog", "GOOGL"],
    ["GOOGL", "GOOGL"],
    [undefined, ""],
  ])("%s becomes %s", (input, expected) => {
    expect(normaliseTicker(input)).toBe(expected);
  });
});

describe("normaliseRationaleTags", () => {
  it("keeps vocabulary tags, once each, whatever their case", () => {
    expect(normaliseRationaleTags(["Earnings", " earnings", "macro"])).toEqual(["earnings", "macro"]);
  });

  it("drops invented, long and non-string tags", () => {
    expect(
      normaliseRationaleTags(["vibes", "x".repeat(500), 7, null, "valuation"]),
    ).toEqual(["valuation"]);
  });

  it("never exceeds the vocabulary", () => {
    const all = [...RATIONALE_TAGS, ...RATIONALE_TAGS];
    expect(normaliseRationaleTags(all)).toHaveLength(RATIONALE_TAGS.length);
  });

  it("treats anything but an array as no tags", () => {
    expect(normaliseRationaleTags("earnings")).toEqual([]);
    expect(normaliseRationaleTags(undefined)).toEqual([]);
  });
});

describe("normaliseClaim", () => {
  it("accepts a GOOG call as GOOGL", () => {
    const result = normaliseClaim({ ...base, instrument_ticker: "$GOOG" }, "text");
    expect("claim" in result && result.claim.instrumentTicker).toBe("GOOGL");
  });

  it("says why it rejects a ticker outside the Mag 7", () => {
    expect(normaliseClaim({ ...base, instrument_ticker: "SPY" }, "text")).toEqual({
      reason: "Invalid ticker: SPY",
    });
  });

  it("rejects an off-grid horizon rather than snapping it", () => {
    expect(normaliseClaim({ ...base, horizon_days: 60 }, "text")).toEqual({
      reason: "Invalid horizon: 60 (nearest valid: 30)",
    });
  });

  it("rejects a direction outside the enum", () => {
    expect(normaliseClaim({ ...base, direction: "sideways" }, "text")).toEqual({
      reason: "Invalid direction: sideways",
    });
  });

  it("cleans the tags of an accepted claim", () => {
    const result = normaliseClaim({ ...base, rationale_tags: ["macro", "MACRO", "made-up"] }, "text");
    expect("claim" in result && result.claim.rationaleTags).toEqual(["macro"]);
  });
});

import { describe, it, expect } from "vitest";
import { VALID_HORIZONS } from "@deepmint/shared";
import { isExplicitHorizon, verifyVerbatim } from "../extractor";

/**
 * Deterministic tests for the evidence gates that decide whether an extracted
 * claim may score. Both fail closed: anything not provably explicit or
 * verbatim routes the claim to human review instead of the append-only ledger.
 */

describe("isExplicitHorizon", () => {
  it("rejects the vague horizons seen on real posts, for every grid value", () => {
    // Each of these was given a grid horizon_days by the old prompt.
    for (const phrase of ["near term", "long term", "by 2028", "next 3-5 years"]) {
      for (const days of VALID_HORIZONS) {
        expect(isExplicitHorizon(phrase, days)).toBe(false);
      }
    }
  });

  it("accepts wording that names the grid duration outright", () => {
    const cases: Array<[string, number]> = [
      ["1 day", 1],
      ["within a week", 7],
      ["7 days", 7],
      ["in the next 30 days", 30],
      ["within one month", 30],
      ["within the next 90 days", 90],
      ["3 months", 90],
      ["over the next 6 months", 180],
      ["Six months' time", 180],
      ["180 days", 180],
      ["12 months", 365],
      ["12-month price target", 365],
      ["12-month target price", 365],
      ["12-month price objective", 365],
      ["a year from now", 365],
      ["the next twelve months", 365],
      ["within a year", 365],
      ["1-year", 365],
      ["in 365 days.", 365],
    ];
    for (const [phrase, days] of cases) {
      expect(isExplicitHorizon(phrase, days), phrase).toBe(true);
    }
  });

  it("rejects an explicit duration that differs from horizon_days", () => {
    expect(isExplicitHorizon("6 months", 90)).toBe(false);
    expect(isExplicitHorizon("12 months", 180)).toBe(false);
    expect(isExplicitHorizon("90 days", 30)).toBe(false);
  });

  it("rejects calendar-dated, multi-year, ranged and approximate wording", () => {
    for (const phrase of [
      "by Q3 2026",
      "by year-end",
      "by the end of 2026",
      "this year",
      "next year",
      "next week",
      "short term",
      "the coming months",
      "a few weeks",
      "2 years",
      "18 months",
      "6 to 12 months",
      "12–18 months",
      "at least 6 months",
      "6+ months",
      "4 weeks",
      "a quarter",
      "3 months after earnings",
      "over 6 months",
      // Spelled-out single units are idioms or rates without framing.
      "one day",
      "One day,",
      "a day",
      "one-day",
      "a year",
      "one month",
    ]) {
      for (const days of VALID_HORIZONS) {
        expect(isExplicitHorizon(phrase, days), phrase).toBe(false);
      }
    }
  });

  it("rejects a missing or oversized horizon", () => {
    expect(isExplicitHorizon(null, 365)).toBe(false);
    expect(isExplicitHorizon("", 365)).toBe(false);
    expect(isExplicitHorizon(`12 months${"!".repeat(64_000)}`, 365)).toBe(false);
  });
});

describe("verifyVerbatim", () => {
  const source = `Wedbush reiterated its Outperform rating on Apple.
    Analyst Dan Ives said &#8220;we see AAPL reaching $300 over the next
    12 months&#8221; as the iPhone   cycle accelerates. AT&amp;T was unchanged.`;

  it("accepts an exact quote despite different whitespace", () => {
    expect(verifyVerbatim("over the next 12 months", source)).toBe("over the next 12 months");
    expect(verifyVerbatim("  as the iPhone cycle\naccelerates.  ", source)).toBe(
      "as the iPhone cycle accelerates.",
    );
  });

  it("decodes HTML entities in the source, the quote, or both", () => {
    // Model decoded the entities; the feed text did not.
    expect(verifyVerbatim("“we see AAPL reaching $300", source)).toBe(
      "“we see AAPL reaching $300",
    );
    // Model copied the raw entity.
    expect(verifyVerbatim("&#x201C;we see AAPL", source)).toBe("“we see AAPL");
    expect(verifyVerbatim("AT&T was unchanged.", source)).toBe("AT&T was unchanged.");
  });

  it("rejects a paraphrased or invented quote", () => {
    expect(verifyVerbatim("Dan Ives expects AAPL to reach $300 within a year.", source)).toBeNull();
    // A one-character change is enough to fail.
    expect(verifyVerbatim("we see AAPL reaching $310", source)).toBeNull();
  });

  it("matches whole tokens only, so a fragment cannot change a number or range", () => {
    expect(verifyVerbatim("we see AAPL reaching $30", source)).toBeNull();
    expect(verifyVerbatim("3 months", "Target $250 within 13 months.")).toBeNull();
    expect(verifyVerbatim("12 months", "Target $900 over the next 6-12 months.")).toBeNull();
    expect(verifyVerbatim("12 months", "Target $900 over the next 6\u201312 months.")).toBeNull();
    expect(verifyVerbatim("a week", "After a weekend of headlines, we buy AAPL.")).toBeNull();
    // Punctuation edges need no boundary: scraped text often drops the space.
    expect(verifyVerbatim("as the iPhone cycle accelerates.", "as the iPhone cycle accelerates.The")).toBe(
      "as the iPhone cycle accelerates.",
    );
  });

  it("never decodes an entity into a NUL, which Postgres text rejects", () => {
    const quote = verifyVerbatim("AAPL &#0; to $300", "We think AAPL &#0; to $300 in 12 months");
    expect(quote).toBe("AAPL &#0; to $300");
  });

  it("rejects empty and non-string values", () => {
    for (const value of [null, undefined, 42, "", "   ", ["over the next 12 months"]]) {
      expect(verifyVerbatim(value, source)).toBeNull();
    }
  });
});

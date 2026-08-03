import { describe, it, expect } from "vitest";
import { isValidAnalystFirm, parseRatingDate } from "../extractor";

/**
 * Deterministic tests for rating attribution validation.
 *
 * These guard an APPEND-ONLY ledger: a claim credited to the wrong entity, or
 * backdated to a bad date, cannot be deleted or corrected afterwards. Both
 * validators therefore fail closed — returning null rather than a best guess.
 */

describe("isValidAnalystFirm", () => {
  it("accepts genuine issuing institutions", () => {
    for (const firm of [
      "Morgan Stanley",
      "Goldman Sachs",
      "Wedbush",
      "J.P. Morgan",
      "Bank of America",
      "Evercore ISI",
      "Piper Sandler",
      "UBS",
    ]) {
      expect(isValidAnalystFirm(firm)).toBe(true);
    }
  });

  it("rejects publications that report ratings but never issue them", () => {
    // The core failure mode: a leaked publication would mint a Guide entity
    // that then ranks on the leaderboard against real analysts.
    for (const publication of [
      "Yahoo Finance",
      "Nasdaq",
      "Seeking Alpha",
      "The Motley Fool",
      "Zacks",
      "Benzinga",
      "Reuters",
      "Bloomberg",
      "CNBC",
      "MarketWatch",
      "Barron's",
      "GlobeNewswire",
      "Business Insider",
    ]) {
      expect(isValidAnalystFirm(publication)).toBe(false);
    }
  });

  it("rejects stubs, boilerplate and non-strings", () => {
    for (const value of ["", " ", "N/A", "n/a", "none", "null", "unknown", "analyst", "Analysts", "X"]) {
      expect(isValidAnalystFirm(value)).toBe(false);
    }
    expect(isValidAnalystFirm(null)).toBe(false);
    expect(isValidAnalystFirm(undefined)).toBe(false);
    expect(isValidAnalystFirm(42)).toBe(false);
    expect(isValidAnalystFirm({ name: "Morgan Stanley" })).toBe(false);
  });

  it("rejects an over-long value rather than truncating it", () => {
    expect(isValidAnalystFirm("A".repeat(201))).toBe(false);
  });
});

describe("parseRatingDate", () => {
  const now = new Date("2026-07-29T12:00:00Z");

  it("accepts a plausible ISO date", () => {
    expect(parseRatingDate("2026-07-28", now)).toBe("2026-07-28");
    expect(parseRatingDate("  2026-01-02  ", now)).toBe("2026-01-02");
  });

  it("rejects non-ISO formats", () => {
    for (const value of ["28/07/2026", "July 28, 2026", "2026-7-28", "20260728", ""]) {
      expect(parseRatingDate(value, now)).toBeNull();
    }
  });

  it("rejects calendar-overflow dates that Date would silently roll over", () => {
    // new Date("2026-02-31") rolls to March 3 — accepting it would backdate a
    // claim to a day the analyst never published on.
    expect(parseRatingDate("2026-02-31", now)).toBeNull();
    expect(parseRatingDate("2026-13-01", now)).toBeNull();
  });

  it("rejects dates beyond a day of clock skew in the future", () => {
    expect(parseRatingDate("2026-07-30", now)).toBe("2026-07-30"); // within skew
    expect(parseRatingDate("2026-08-15", now)).toBeNull();
    expect(parseRatingDate("2030-01-01", now)).toBeNull();
  });

  it("rejects implausibly stale dates", () => {
    expect(parseRatingDate("2015-01-01", now)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parseRatingDate(null, now)).toBeNull();
    expect(parseRatingDate(20260728, now)).toBeNull();
  });
});

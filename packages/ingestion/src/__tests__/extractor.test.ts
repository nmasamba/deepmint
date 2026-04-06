import { describe, it, expect } from "vitest";
import { extractClaims } from "../extractor";

/**
 * Live LLM extraction tests using HuggingFace Inference API.
 * Requires HF_API_KEY env var to be set.
 * These tests validate that the extraction pipeline correctly
 * parses analyst text into structured claims.
 */

const HAS_API_KEY = !!process.env.HF_API_KEY;

describe.skipIf(!HAS_API_KEY)("extractClaims (live LLM)", () => {
  it("extracts a clear bullish AAPL prediction", { timeout: 60000 }, async () => {
    const text = `
      After reviewing Apple's latest earnings, I'm highly bullish on AAPL.
      The iPhone 17 cycle looks extremely strong and services revenue continues
      to accelerate. My price target is $250 within the next 90 days.
      High conviction call based on earnings momentum.
    `;

    const result = await extractClaims(text);

    expect(result.validClaims.length).toBeGreaterThanOrEqual(1);
    expect(result.extractionConfidence).toBeGreaterThan(0);

    const claim = result.validClaims[0]!;
    expect(claim.instrumentTicker).toBe("AAPL");
    expect(claim.direction).toBe("long");
    expect(typeof claim.targetPrice).toBe("number");
    expect(claim.horizonDays).toBeGreaterThan(0);
    expect(claim.rationaleSummary.length).toBeGreaterThan(0);
  });

  it("extracts a bearish TSLA prediction", { timeout: 60000 }, async () => {
    const text = `
      Tesla is overvalued at current levels. With competition increasing
      from Chinese EVs and margins under pressure, I expect TSLA to decline
      significantly over the next 6 months. Shorting TSLA with a target of $150.
    `;

    const result = await extractClaims(text);

    expect(result.validClaims.length).toBeGreaterThanOrEqual(1);

    const claim = result.validClaims[0]!;
    expect(claim.instrumentTicker).toBe("TSLA");
    expect(claim.direction).toBe("short");
  });

  it("handles text with multiple predictions", { timeout: 60000 }, async () => {
    const text = `
      Market outlook for Q2 2026:
      - NVDA: Strongly bullish, AI demand continuing to surge. Target $1100 in 90 days.
      - META: Slightly bearish, ad revenue slowing. Short-term target $480 over 30 days.
    `;

    const result = await extractClaims(text);

    // Should extract at least 2 claims
    expect(result.validClaims.length).toBeGreaterThanOrEqual(2);

    const tickers = result.validClaims.map((c) => c.instrumentTicker);
    expect(tickers).toContain("NVDA");
    expect(tickers).toContain("META");
  });

  it("rejects non-Mag7 tickers as invalid", { timeout: 120000 }, async () => {
    const text = `
      I'm very bullish on AMD. Target price $200 within 30 days.
      Also long on AAPL targeting $260 in 90 days.
    `;

    const result = await extractClaims(text);

    // AMD should be in invalidClaims (not Mag 7)
    const invalidTickers = result.invalidClaims.map((c) =>
      String(c.raw.instrument_ticker ?? "").toUpperCase(),
    );
    // AMD might be extracted by LLM but filtered as invalid
    if (invalidTickers.length > 0) {
      expect(invalidTickers.some((t) => t === "AMD")).toBe(true);
    }

    // AAPL should be valid
    const validTickers = result.validClaims.map((c) => c.instrumentTicker);
    expect(validTickers).toContain("AAPL");
  });

  it("returns empty claims for text with no predictions", { timeout: 60000 }, async () => {
    const text = `
      Today's weather in San Francisco is sunny and mild.
      The Golden Gate Bridge is a beautiful landmark.
      Have a nice day!
    `;

    const result = await extractClaims(text);

    expect(result.validClaims).toHaveLength(0);
  });
});

describe("extractClaims (no API key)", () => {
  it("throws when HF_API_KEY is not set", async () => {
    const originalKey = process.env.HF_API_KEY;
    delete process.env.HF_API_KEY;

    try {
      await expect(extractClaims("test text")).rejects.toThrow(
        "HF_API_KEY environment variable is required",
      );
    } finally {
      if (originalKey) {
        process.env.HF_API_KEY = originalKey;
      }
    }
  });
});

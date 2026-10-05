import { describe, it, expect } from "vitest";
import { extractClaims, isExplicitHorizon, verifyVerbatim } from "../extractor";

/**
 * Live LLM extraction tests using HuggingFace Inference API.
 * Requires HF_API_KEY env var to be set.
 * These tests validate that the extraction pipeline correctly
 * parses analyst text into structured claims.
 */

const HAS_API_KEY = !!process.env.HF_API_KEY;

// Live LLM calls (120s timeout + up to 2 retries) need headroom over the raw
// per-request timeout, so give each live test a generous budget. These hit a
// real model on the HF router and are inherently latency-bound.
const LIVE_TIMEOUT = 420000;

describe.skipIf(!HAS_API_KEY)("extractClaims (live LLM)", () => {
  it("extracts a clear bullish AAPL prediction", { timeout: LIVE_TIMEOUT }, async () => {
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

  it("extracts a bearish TSLA prediction", { timeout: LIVE_TIMEOUT }, async () => {
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

  it("handles text with multiple predictions", { timeout: LIVE_TIMEOUT }, async () => {
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

  it("returns every call from a post that overflowed the old 1,024-token cap", { timeout: LIVE_TIMEOUT }, async () => {
    // Measured on the router: ~2,800 output tokens. At the old 1,024 cap this
    // was cut off mid-array and came back as an empty result, indistinguishable
    // from "no claims"; a truncation now throws instead.
    const text = `
      Our Mag 7 playbook after earnings season.

      Apple (AAPL): We are buyers. Services margin expansion and the iPhone 17 upgrade cycle support our $275 price target over the next 12 months. High conviction.

      Microsoft (MSFT): Overweight. Azure growth re-accelerated and Copilot seat adds are inflecting, so we see MSFT reaching $600 within 12 months.

      Alphabet (GOOGL): Buy. Search share fears are overdone and Cloud is now solidly profitable. Our 12-month target is $230.

      Amazon (AMZN): Buy. AWS backlog and retail operating margins point to upside; we target $260 over the next 6 months.

      Nvidia (NVDA): We remain long. Blackwell demand exceeds supply, and we expect NVDA to reach $220 within 6 months.

      Meta (META): We turn cautious. Reality Labs losses are swamping ad strength, and we expect the stock to slide to $600 over the next 3 months.

      Tesla (TSLA): Sell. Auto gross margins keep compressing and robotaxi timelines keep slipping; we expect TSLA to fall to $250 over the next 3 months.
    `;

    const result = await extractClaims(text);

    const tickers = new Set(result.validClaims.map((c) => c.instrumentTicker));
    expect(tickers.size).toBeGreaterThanOrEqual(5);
    // Reports which model answered and the provider the router picked for it.
    expect(result.model).toMatch(/^\S+ \((?!provider not reported)[^)]+\)$/);

    // Every horizon here is stated outright inside the call's own sentence, so
    // most claims should clear processExtraction's evidence gate.
    const evidenced = result.validClaims.filter((c) =>
      isExplicitHorizon(verifyVerbatim(c.horizonStated, c.sourceExcerpt ?? ""), c.horizonDays),
    );
    expect(evidenced.length).toBeGreaterThanOrEqual(5);
  });

  it("rejects non-Mag7 tickers as invalid", { timeout: LIVE_TIMEOUT }, async () => {
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

  // No Mag-7 mention, so the pre-filter returns a genuine empty result without
  // calling the model. Model failures throw rather than returning empty.
  it("returns empty claims for text with no predictions", { timeout: LIVE_TIMEOUT }, async () => {
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

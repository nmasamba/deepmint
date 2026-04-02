import { describe, it, expect } from "vitest";
import { computeContentHash } from "../hasher";

describe("computeContentHash", () => {
  const baseArgs = {
    sourceUrl: "https://example.com/analysis/aapl",
    rawText: "AAPL is looking bullish, targeting $250 in 30 days",
    capturedAt: new Date("2026-01-15T12:00:00.000Z"),
  };

  it("produces a SHA-256 hex string", () => {
    const hash = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      baseArgs.capturedAt,
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same inputs always same hash", () => {
    const hash1 = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      baseArgs.capturedAt,
    );
    const hash2 = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      baseArgs.capturedAt,
    );
    expect(hash1).toBe(hash2);
  });

  it("changes when URL changes", () => {
    const hash1 = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      baseArgs.capturedAt,
    );
    const hash2 = computeContentHash(
      "https://example.com/analysis/msft",
      baseArgs.rawText,
      baseArgs.capturedAt,
    );
    expect(hash1).not.toBe(hash2);
  });

  it("changes when text changes", () => {
    const hash1 = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      baseArgs.capturedAt,
    );
    const hash2 = computeContentHash(
      baseArgs.sourceUrl,
      "AAPL is looking bearish",
      baseArgs.capturedAt,
    );
    expect(hash1).not.toBe(hash2);
  });

  it("changes when timestamp changes", () => {
    const hash1 = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      baseArgs.capturedAt,
    );
    const hash2 = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      new Date("2026-01-16T12:00:00.000Z"),
    );
    expect(hash1).not.toBe(hash2);
  });

  it("immutability: hash is never recomputed (same input = same output)", () => {
    // This test reinforces the critical invariant: every event gets a SHA-256
    // content hash computed at capture time, never recomputed.
    const hash = computeContentHash(
      baseArgs.sourceUrl,
      baseArgs.rawText,
      baseArgs.capturedAt,
    );

    // Even calling it 100 times should give the same result
    for (let i = 0; i < 100; i++) {
      expect(
        computeContentHash(
          baseArgs.sourceUrl,
          baseArgs.rawText,
          baseArgs.capturedAt,
        ),
      ).toBe(hash);
    }
  });
});

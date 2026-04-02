import { describe, it, expect } from "vitest";
import { DemoSourceAdapter } from "../sources/demo";
import { MAG7_TICKERS } from "@deepmint/shared";

describe("DemoSourceAdapter", () => {
  const adapter = new DemoSourceAdapter("test-entity-id");

  it("has the name 'demo'", () => {
    expect(adapter.name).toBe("demo");
  });

  it("returns 5 hardcoded analyst reports", async () => {
    const captures = await adapter.fetchLatest();
    expect(captures).toHaveLength(5);
  });

  it("all captures have required fields", async () => {
    const captures = await adapter.fetchLatest();
    for (const capture of captures) {
      expect(capture.entityId).toBe("test-entity-id");
      expect(capture.sourceUrl).toBeTruthy();
      expect(capture.rawText.length).toBeGreaterThan(50);
      expect(capture.capturedAt).toBeInstanceOf(Date);
    }
  });

  it("covers different Mag 7 tickers", async () => {
    const captures = await adapter.fetchLatest();
    const validTickers = new Set(MAG7_TICKERS);

    // Each report mentions a Mag 7 ticker
    for (const capture of captures) {
      const mentionsMag7 = MAG7_TICKERS.some((ticker) =>
        capture.rawText.includes(ticker),
      );
      expect(mentionsMag7).toBe(true);
    }
  });

  it("timestamps are in the recent past", async () => {
    const captures = await adapter.fetchLatest();
    const now = Date.now();

    for (const capture of captures) {
      const ageMs = now - capture.capturedAt.getTime();
      // All captures should be within the last 10 minutes
      expect(ageMs).toBeGreaterThan(0);
      expect(ageMs).toBeLessThan(600_000);
    }
  });

  it("source URLs are unique", async () => {
    const captures = await adapter.fetchLatest();
    const urls = captures.map((c) => c.sourceUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

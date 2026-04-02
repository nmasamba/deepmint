import { describe, it, expect, beforeEach } from "vitest";
import { getCurrentPrice } from "../polygon";

describe("getCurrentPrice", () => {
  beforeEach(() => {
    // Ensure no POLYGON_API_KEY so fallback prices are used
    delete process.env.POLYGON_API_KEY;
  });

  it("returns fallback price in cents for AAPL", async () => {
    const price = await getCurrentPrice("AAPL");
    expect(price).toBe(22500); // $225.00 in cents
  });

  it("returns fallback price for all Mag 7 tickers", async () => {
    const tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];
    for (const ticker of tickers) {
      const price = await getCurrentPrice(ticker);
      expect(price).toBeGreaterThan(0);
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  it("is case-insensitive for tickers", async () => {
    const upper = await getCurrentPrice("AAPL");
    const lower = await getCurrentPrice("aapl");
    expect(upper).toBe(lower);
  });

  it("throws for unknown tickers without API key", async () => {
    await expect(getCurrentPrice("UNKNOWN")).rejects.toThrow(
      "No fallback price for ticker: UNKNOWN",
    );
  });

  it("returns integer values (cents, not dollars)", async () => {
    const price = await getCurrentPrice("NVDA");
    expect(Number.isInteger(price)).toBe(true);
    expect(price).toBe(95000); // $950.00
  });
});

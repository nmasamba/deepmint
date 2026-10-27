import diagnostics from "node:diagnostics_channel";
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from "vitest";
import {
  getCurrentPrice,
  getEODPrice,
  getLatestClose,
  getLatestCloses,
  polygonRateLimit,
} from "../polygon";

// Read before any test deletes it; the live tests put it back.
const LIVE_POLYGON_KEY = process.env.POLYGON_API_KEY;

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

describe("without a Polygon key", () => {
  beforeEach(() => {
    delete process.env.POLYGON_API_KEY;
  });

  it("getEODPrice rejects instead of returning a dev price", async () => {
    await expect(getEODPrice("AAPL", "2025-10-01")).rejects.toThrow(
      "POLYGON_API_KEY is not set",
    );
  });

  it("getLatestClose rejects, and getLatestCloses leaves the ticker out", async () => {
    await expect(getLatestClose("AAPL")).rejects.toThrow("POLYGON_API_KEY is not set");
    expect((await getLatestCloses(["AAPL"])).size).toBe(0);
  });
});

describe.skipIf(!LIVE_POLYGON_KEY)("live Polygon (POLYGON_API_KEY)", () => {
  // Every request the client makes, as Node's HTTP client starts it.
  const requests: number[] = [];
  const onRequest = () => requests.push(Date.now());

  beforeAll(() => {
    process.env.POLYGON_API_KEY = LIVE_POLYGON_KEY;
    diagnostics.subscribe("http.client.request.start", onRequest);
  });
  afterAll(() => {
    diagnostics.unsubscribe("http.client.request.start", onRequest);
  });
  beforeEach(() => {
    requests.length = 0;
  });

  it("fires two lookups that start together at least 12.5 s apart", async () => {
    const [a, b] = await Promise.all([
      getEODPrice("AAPL", "2025-10-01"),
      getEODPrice("MSFT", "2025-10-01"),
    ]);
    expect(a.closeCents).toBeGreaterThan(0);
    expect(b.closeCents).toBeGreaterThan(0);
    expect(requests).toHaveLength(2);
    // Released 12.5 s apart; each HTTP start can trail its release by a few ms.
    expect(requests[1]! - requests[0]!).toBeGreaterThanOrEqual(12_400);
  }, 60_000);

  it("looks each ticker up once, and serves a repeat from memory", async () => {
    const first = await getLatestCloses(["AAPL", "aapl", "MSFT"]);
    expect(requests).toHaveLength(2);
    expect([...first.keys()]).toEqual(["AAPL", "MSFT"]);
    for (const close of first.values()) {
      expect(Number.isInteger(close.closeCents)).toBe(true);
      expect(close.closeCents).toBeGreaterThan(0);
      expect(close.sessionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    const started = performance.now();
    const again = await getLatestCloses(["MSFT", "AAPL"]);
    expect(performance.now() - started).toBeLessThan(50);
    expect(requests).toHaveLength(2);
    expect(again.get("AAPL")).toEqual(first.get("AAPL"));
  }, 90_000);
});

// Last in the file: it leaves the throttle's next slot up to ~40 s ahead.
describe("polygonRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues callers that start together 12.5 s apart", async () => {
    vi.useFakeTimers();
    const released: number[] = [];
    const calls = [0, 1, 2].map(() =>
      polygonRateLimit().then(() => released.push(Date.now())),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(calls);
    expect(released[1]! - released[0]!).toBe(12_500);
    expect(released[2]! - released[1]!).toBe(12_500);
  });
});

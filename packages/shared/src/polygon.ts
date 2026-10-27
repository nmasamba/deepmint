/**
 * Market data client using Massive.com API (formerly Polygon.io).
 * Sprint 3.1 — full implementation with EOD, historical, snapshot, and batch.
 * All prices returned in integer cents. Without POLYGON_API_KEY, getCurrentPrice
 * and the index helpers fall back to dev constants; getEODPrice (ledger entry
 * prices) and getLatestClose throw instead.
 */

import {
  restClient,
  GetStocksAggregatesTimespanEnum,
  GetStocksAggregatesSortEnum,
} from "@massive.com/client-js";
import { dollarsToCents } from "./utils";
import { getCached, currentPriceCacheKey } from "./polygonCache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyBar {
  date: string; // YYYY-MM-DD
  openCents: number;
  highCents: number;
  lowCents: number;
  closeCents: number;
  volume: number;
}

export interface EODPrice {
  openCents: number;
  highCents: number;
  lowCents: number;
  closeCents: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Dev fallback prices (cents) — used when POLYGON_API_KEY is unset
// ---------------------------------------------------------------------------

const DEV_FALLBACK_PRICES: Record<string, number> = {
  AAPL: 22500,
  MSFT: 42000,
  GOOGL: 17500,
  AMZN: 19000,
  NVDA: 95000,
  META: 55000,
  TSLA: 25000,
};

// ---------------------------------------------------------------------------
// Client singleton (lazy)
// ---------------------------------------------------------------------------

function getClient() {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  return restClient(apiKey);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFallbackPrice(ticker: string): number {
  const fallback = DEV_FALLBACK_PRICES[ticker.toUpperCase()];
  if (fallback) return fallback;
  throw new Error(`No fallback price for ticker: ${ticker}`);
}

// ---------------------------------------------------------------------------
// Rate limiting — simple delay queue for Massive starter plan (5 req/min)
// ---------------------------------------------------------------------------

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 12_500; // ~5 req/min = one every 12s

/**
 * Process-wide client-side throttle for EVERY Polygon/Massive request — prices
 * AND news. They draw on the same account quota, so all callers must pass
 * through this single limiter; a second independent limiter would let the
 * combined request rate exceed the plan limit (observed as HTTP 429).
 *
 * Each caller reserves its slot synchronously, before sleeping, so callers that
 * start together queue MIN_REQUEST_INTERVAL_MS apart instead of computing the
 * same wait and firing together. The queue is per process: separate serverless
 * instances each keep their own.
 */
export async function polygonRateLimit(): Promise<void> {
  const slot = Math.max(Date.now(), lastRequestTime + MIN_REQUEST_INTERVAL_MS);
  lastRequestTime = slot;
  const wait = slot - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current (previous close) price for a ticker in cents.
 *
 * Tries the previous-day aggregate FIRST: it is entitled on the current plan,
 * whereas the snapshot endpoint returns 403 NOT_AUTHORIZED — and because both
 * calls sit behind the shared 12.5s throttle, snapshot-first burned a wasted
 * request plus a full throttle interval on every single price lookup (13s
 * claim submissions, measured). Snapshot is kept as redundancy only; it never
 * offered more than prevDay.c, the same datum prev-agg returns.
 *
 * When a key IS configured and both endpoints fail, this THROWS. It previously
 * returned DEV_FALLBACK_PRICES — and the first real production claim recorded
 * NVDA at the fallback $950.00 against a real price of $217.50, permanently,
 * into an append-only table. A fabricated price in the claims ledger is
 * strictly worse than a failed request: callers either surface the error to
 * the user (tRPC) or catch-and-retry on the next run (workers).
 * The dev fallback remains only for the no-key case (local dev).
 */
export async function getCurrentPrice(ticker: string): Promise<number> {
  const client = getClient();
  if (!client) return getFallbackPrice(ticker);

  let prevAggError: unknown;
  try {
    await polygonRateLimit();
    const resp = await client.getPreviousStocksAggregates({
      stocksTicker: ticker.toUpperCase(),
    });
    const results = resp.results;
    if (results && results.length > 0 && typeof results[0].c === "number") {
      return dollarsToCents(results[0].c);
    }
    prevAggError = new Error("prev-agg returned no usable bar");
  } catch (err) {
    prevAggError = err;
    console.warn(`[polygon] prev-agg failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  let snapshotError: unknown;
  try {
    await polygonRateLimit();
    const resp = await client.getStocksSnapshotTicker({
      stocksTicker: ticker.toUpperCase(),
    });
    const close = resp.ticker?.prevDay?.c;
    if (typeof close === "number") return dollarsToCents(close);
    snapshotError = new Error("snapshot returned no prevDay close");
  } catch (err) {
    snapshotError = err;
    console.warn(`[polygon] snapshot failed for ${ticker}:`, err instanceof Error ? err.message : err);
  }

  throw new Error(
    `Polygon price lookup failed for ${ticker} ` +
      `(prev-agg: ${prevAggError instanceof Error ? prevAggError.message : prevAggError}; ` +
      `snapshot: ${snapshotError instanceof Error ? snapshotError.message : snapshotError})`,
  );
}

/**
 * Get end-of-day OHLCV for a ticker on a specific date.
 * Returns prices in cents.
 *
 * Throws without a key: callers store this as a claim's entry price, and a dev
 * constant in the append-only ledger could never be removed. They catch the
 * error and leave the entry null, which markout prices later.
 */
export async function getEODPrice(
  ticker: string,
  date: string
): Promise<EODPrice> {
  const client = getClient();
  if (!client) {
    throw new Error(`No EOD price for ${ticker} on ${date}: POLYGON_API_KEY is not set`);
  }

  await polygonRateLimit();
  const resp = await client.getStocksOpenClose({
    stocksTicker: ticker.toUpperCase(),
    date,
    adjusted: true,
  });

  // resp follows StocksOpenClose / GetOptionsOpenClose200Response shape
  const data = resp as {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  };

  if (
    typeof data.open !== "number" ||
    typeof data.close !== "number"
  ) {
    throw new Error(`No EOD data for ${ticker} on ${date}`);
  }

  return {
    openCents: dollarsToCents(data.open),
    highCents: dollarsToCents(data.high ?? data.open),
    lowCents: dollarsToCents(data.low ?? data.open),
    closeCents: dollarsToCents(data.close),
    volume: data.volume ?? 0,
  };
}

/**
 * Get historical daily bars for a ticker over a date range.
 * `from` and `to` are YYYY-MM-DD strings.
 */
export async function getHistoricalPrices(
  ticker: string,
  from: string,
  to: string
): Promise<DailyBar[]> {
  const client = getClient();
  if (!client) {
    return [];
  }

  await polygonRateLimit();
  const resp = await client.getStocksAggregates({
    stocksTicker: ticker.toUpperCase(),
    multiplier: 1,
    timespan: GetStocksAggregatesTimespanEnum.Day,
    from,
    to,
    adjusted: true,
    sort: GetStocksAggregatesSortEnum.Asc,
    limit: 5000,
  });

  const results = resp.results ?? [];

  return results.map((bar) => {
    // bar.t is millisecond timestamp
    const dateStr = bar.t
      ? new Date(bar.t).toISOString().slice(0, 10)
      : from;

    return {
      date: dateStr,
      openCents: dollarsToCents(bar.o ?? 0),
      highCents: dollarsToCents(bar.h ?? 0),
      lowCents: dollarsToCents(bar.l ?? 0),
      closeCents: dollarsToCents(bar.c ?? 0),
      volume: bar.v ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Latest close (cached) — for display and valuation, never for the ledger
// ---------------------------------------------------------------------------

export interface LatestClose {
  closeCents: number;
  /** The session (YYYY-MM-DD) whose close this is. */
  sessionDate: string;
}

const latestCloseMemo = new Map<string, { value: LatestClose; expiresAt: number }>();
const latestCloseInFlight = new Map<string, Promise<LatestClose>>();

async function fetchLatestClose(ticker: string): Promise<LatestClose> {
  const client = getClient();
  if (!client) throw new Error(`No close for ${ticker}: POLYGON_API_KEY is not set`);
  await polygonRateLimit();
  const resp = await client.getPreviousStocksAggregates({ stocksTicker: ticker });
  const bar = resp.results?.[0];
  if (typeof bar?.c !== "number" || typeof bar.t !== "number") {
    throw new Error(`Polygon returned no previous close for ${ticker}`);
  }
  return {
    closeCents: dollarsToCents(bar.c),
    sessionDate: new Date(bar.t).toISOString().slice(0, 10),
  };
}

/**
 * The latest session close, with its date, for pages and valuations. Memoised
 * per process for TTL_CURRENT (5 minutes), shared by concurrent callers, and
 * cached in Upstash when configured. Throws without a key or when Polygon fails;
 * a dev constant would be shown as a real dated close.
 *
 * Ledger writers keep the uncached getCurrentPrice and getEODPrice.
 */
export async function getLatestClose(ticker: string): Promise<LatestClose> {
  const symbol = ticker.toUpperCase();
  const hit = latestCloseMemo.get(symbol);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const pending = latestCloseInFlight.get(symbol);
  if (pending) return pending;

  const { key, ttl } = currentPriceCacheKey(symbol);
  const promise = getCached(key, ttl, () => fetchLatestClose(symbol))
    .then((value) => {
      latestCloseMemo.set(symbol, { value, expiresAt: Date.now() + ttl * 1000 });
      return value;
    })
    .finally(() => latestCloseInFlight.delete(symbol));
  latestCloseInFlight.set(symbol, promise);
  return promise;
}

/**
 * Latest closes for several tickers. Each distinct ticker is looked up once, and
 * misses are fetched one after another (the throttle serialises them anyway).
 * A ticker whose lookup fails is left out of the map.
 */
export async function getLatestCloses(
  tickers: string[],
): Promise<Map<string, LatestClose>> {
  const result = new Map<string, LatestClose>();
  for (const symbol of new Set(tickers.map((t) => t.toUpperCase()))) {
    try {
      result.set(symbol, await getLatestClose(symbol));
    } catch (err) {
      console.warn(`[polygon] latest close failed for ${symbol}:`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Index / Regime Indicator support
// ---------------------------------------------------------------------------

/** Dev fallback values for index tickers and regime computation */
const DEV_FALLBACK_INDEX: Record<string, number> = {
  "I:VIX": 18,    // VIX level (unitless)
  "I:SPX": 5300,  // S&P 500 points
};

const DEV_FALLBACK_SECTOR_RETURNS: Record<string, number> = {
  XLF: 0.02, XLK: 0.03, XLE: -0.01, XLV: 0.01, XLI: 0.015,
  XLC: 0.02, XLY: 0.01, XLP: 0.005, XLU: 0.008, XLRE: -0.005, XLB: 0.012,
};

const SECTOR_ETFS = ["XLF", "XLK", "XLE", "XLV", "XLI", "XLC", "XLY", "XLP", "XLU", "XLRE", "XLB"];

/**
 * Get the current (latest session) value for an index ticker.
 * Returns the raw value (VIX is unitless, SPX is points).
 */
export async function getIndexSnapshot(ticker: string): Promise<number> {
  const client = getClient();
  if (!client) {
    const fallback = DEV_FALLBACK_INDEX[ticker];
    if (fallback !== undefined) return fallback;
    throw new Error(`No fallback for index ticker: ${ticker}`);
  }

  try {
    await polygonRateLimit();
    const resp = await client.getIndicesSnapshot({ tickerAnyOf: ticker });
    const results = (resp as { results?: Array<{ value?: number; session?: { close?: number } }> }).results;
    if (results && results.length > 0) {
      const r = results[0];
      // Prefer session close, fall back to value
      const value = r.session?.close ?? r.value;
      if (typeof value === "number") return value;
    }
  } catch {
    // fall through to open/close
  }

  // Fallback: previous day open/close
  try {
    await polygonRateLimit();
    const yesterday = tradingDayOnOrBefore(new Date(Date.now() - 86400000))
      .toISOString()
      .slice(0, 10);
    const resp = await client.getIndicesOpenClose({ indicesTicker: ticker, date: yesterday });
    const data = resp as { close?: number };
    if (typeof data.close === "number") return data.close;
  } catch {
    // fall through
  }

  // With a key configured, never substitute the dev constant: it would be
  // reported as a live reading (the current plan has no index data at all,
  // so VIX would silently be 18 every day). Callers record it as defaulted.
  throw new Error(`Failed to fetch index value for ${ticker}`);
}

/**
 * Get end-of-day close for an index ticker on a specific date.
 */
export async function getIndexClose(ticker: string, date: string): Promise<number> {
  const client = getClient();
  if (!client) {
    const fallback = DEV_FALLBACK_INDEX[ticker];
    if (fallback !== undefined) return fallback;
    throw new Error(`No fallback for index ticker: ${ticker}`);
  }

  await polygonRateLimit();
  const resp = await client.getIndicesOpenClose({ indicesTicker: ticker, date });
  const data = resp as { close?: number };
  if (typeof data.close !== "number") {
    throw new Error(`No index close data for ${ticker} on ${date}`);
  }
  return data.close;
}

/**
 * Most recent weekday on or before the given date (skips Sat/Sun). Does not
 * account for market holidays, but eliminates the dominant weekend gap so EOD
 * lookups land on a session that actually has a bar.
 */
export function tradingDayOnOrBefore(d: Date): Date {
  const r = new Date(d);
  while (r.getUTCDay() === 0 || r.getUTCDay() === 6) {
    r.setUTCDate(r.getUTCDate() - 1);
  }
  return r;
}

/**
 * Compute 30-day returns for sector ETFs.
 * Returns a Map of ticker → 30d return as decimal (e.g. 0.03 = 3%).
 */
/**
 * Trailing ~30-day close-to-close return for a stock or ETF, or null if either
 * close is unavailable. The "current" leg is the last completed trading day
 * (today's EOD bar does not exist intraday, on weekends or on holidays); the
 * "past" leg is a trading day on or before 30 days ago.
 */
async function stockReturn30d(ticker: string): Promise<number | null> {
  const today = new Date();
  const currentStr = tradingDayOnOrBefore(new Date(today.getTime() - 86400000))
    .toISOString()
    .slice(0, 10);
  const pastStr = tradingDayOnOrBefore(new Date(today.getTime() - 30 * 86400000))
    .toISOString()
    .slice(0, 10);
  const [currentEod, pastEod] = await Promise.all([
    getEODPrice(ticker, currentStr).catch(() => null),
    getEODPrice(ticker, pastStr).catch(() => null),
  ]);
  if (!currentEod || !pastEod || pastEod.closeCents <= 0) return null;
  return (currentEod.closeCents - pastEod.closeCents) / pastEod.closeCents;
}

export async function getSectorETFReturns30d(): Promise<Map<string, number>> {
  const client = getClient();
  if (!client) {
    return new Map(Object.entries(DEV_FALLBACK_SECTOR_RETURNS));
  }

  const result = new Map<string, number>();
  for (const etf of SECTOR_ETFS) {
    const ret = await stockReturn30d(etf);
    if (ret !== null) result.set(etf, ret);
  }
  return result;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

export interface RegimeIndicators {
  sp500Return30d: number;
  vixLevel: number;
  sectorDispersion: number;
}

/** Regime indicators plus the names of any that fell back to their default. */
export interface RegimeIndicatorsResult extends RegimeIndicators {
  defaulted: Array<keyof RegimeIndicators>;
}

/**
 * Fetch live regime indicators: VIX level, S&P 500 30d return, sector dispersion.
 * Results are cached in Redis for 1 hour. An indicator whose data is
 * unavailable falls back to a default and is named in `defaulted`.
 *
 * Slow (~25 throttled Polygon calls): call it from background jobs only.
 * Interactive reads use the stored snapshot (market_regimes).
 */
export async function getRegimeIndicators(): Promise<RegimeIndicatorsResult> {
  const { getCached } = await import("./polygonCache");

  return getCached<RegimeIndicatorsResult>("regime:indicators:v2", 3600, async () => {
    const defaults: RegimeIndicators = {
      sp500Return30d: 0.01,
      vixLevel: 18,
      sectorDispersion: 0.08,
    };

    const defaulted: Array<keyof RegimeIndicators> = [];

    // Without a key every source below is a dev constant, so each indicator
    // is reported as defaulted and no snapshot gets stored from it.
    const hasKey = getClient() !== null;

    // VIX (index data: not on the current plan, so this defaults)
    let vixLevel = defaults.vixLevel;
    try {
      if (!hasKey) throw new Error("no Polygon key");
      vixLevel = await getIndexSnapshot("I:VIX");
    } catch {
      defaulted.push("vixLevel");
    }

    // S&P 500 30d return, measured on SPY: the plan has stock data but no
    // index data (I:SPX returns 403), and SPY tracks the index closely.
    let sp500Return30d = defaults.sp500Return30d;
    const spyReturn = hasKey ? await stockReturn30d("SPY") : null;
    if (spyReturn !== null) {
      sp500Return30d = spyReturn;
    } else {
      defaulted.push("sp500Return30d");
    }

    // Sector dispersion
    let sectorDispersion = defaults.sectorDispersion;
    try {
      if (!hasKey) throw new Error("no Polygon key");
      const sectorReturns = await getSectorETFReturns30d();
      if (sectorReturns.size >= 5) {
        sectorDispersion = stddev(Array.from(sectorReturns.values()));
      } else {
        defaulted.push("sectorDispersion");
      }
    } catch {
      defaulted.push("sectorDispersion");
    }

    return { sp500Return30d, vixLevel, sectorDispersion, defaulted };
  });
}

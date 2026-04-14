/**
 * Market data client using Massive.com API (formerly Polygon.io).
 * Sprint 3.1 — full implementation with EOD, historical, snapshot, and batch.
 * All prices returned in integer cents. Dev fallback when POLYGON_API_KEY unset.
 */

import {
  restClient,
  GetStocksAggregatesTimespanEnum,
  GetStocksAggregatesSortEnum,
} from "@massive.com/client-js";

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

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

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

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed)
    );
  }
  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current (previous close) price for a ticker in cents.
 * Uses snapshot endpoint; falls back to previous close agg, then dev fallback.
 */
export async function getCurrentPrice(ticker: string): Promise<number> {
  const client = getClient();
  if (!client) return getFallbackPrice(ticker);

  try {
    await rateLimit();
    const resp = await client.getStocksSnapshotTicker({
      stocksTicker: ticker.toUpperCase(),
    });
    const close = resp.ticker?.prevDay?.c;
    if (typeof close === "number") return dollarsToCents(close);
  } catch {
    // fall through
  }

  // Fallback: previous day aggregate
  try {
    await rateLimit();
    const resp = await client.getPreviousStocksAggregates({
      stocksTicker: ticker.toUpperCase(),
    });
    const results = resp.results;
    if (results && results.length > 0 && typeof results[0].c === "number") {
      return dollarsToCents(results[0].c);
    }
  } catch {
    // fall through
  }

  return getFallbackPrice(ticker);
}

/**
 * Get end-of-day OHLCV for a ticker on a specific date.
 * Returns prices in cents.
 */
export async function getEODPrice(
  ticker: string,
  date: string
): Promise<EODPrice> {
  const client = getClient();
  if (!client) {
    const fallback = getFallbackPrice(ticker);
    return {
      openCents: fallback,
      highCents: fallback,
      lowCents: fallback,
      closeCents: fallback,
      volume: 0,
    };
  }

  await rateLimit();
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

  await rateLimit();
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
    await rateLimit();
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
    await rateLimit();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const resp = await client.getIndicesOpenClose({ indicesTicker: ticker, date: yesterday });
    const data = resp as { close?: number };
    if (typeof data.close === "number") return data.close;
  } catch {
    // fall through
  }

  const fallback = DEV_FALLBACK_INDEX[ticker];
  if (fallback !== undefined) return fallback;
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

  await rateLimit();
  const resp = await client.getIndicesOpenClose({ indicesTicker: ticker, date });
  const data = resp as { close?: number };
  if (typeof data.close !== "number") {
    throw new Error(`No index close data for ${ticker} on ${date}`);
  }
  return data.close;
}

/**
 * Compute 30-day returns for sector ETFs.
 * Returns a Map of ticker → 30d return as decimal (e.g. 0.03 = 3%).
 */
export async function getSectorETFReturns30d(): Promise<Map<string, number>> {
  const client = getClient();
  if (!client) {
    return new Map(Object.entries(DEV_FALLBACK_SECTOR_RETURNS));
  }

  const result = new Map<string, number>();
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  const todayStr = today.toISOString().slice(0, 10);
  const pastStr = thirtyDaysAgo.toISOString().slice(0, 10);

  for (const etf of SECTOR_ETFS) {
    try {
      const [currentEod, pastEod] = await Promise.all([
        getEODPrice(etf, todayStr).catch(() => null),
        getEODPrice(etf, pastStr).catch(() => null),
      ]);

      if (currentEod && pastEod && pastEod.closeCents > 0) {
        const ret = (currentEod.closeCents - pastEod.closeCents) / pastEod.closeCents;
        result.set(etf, ret);
      }
    } catch {
      // Skip this ETF
    }
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

/**
 * Fetch live regime indicators: VIX level, S&P 500 30d return, sector dispersion.
 * Results are cached in Redis for 1 hour. Falls back to dev defaults when API unavailable.
 */
export async function getRegimeIndicators(): Promise<RegimeIndicators> {
  const { getCached } = await import("./polygonCache");

  return getCached<RegimeIndicators>("regime:indicators", 3600, async () => {
    const defaults: RegimeIndicators = {
      sp500Return30d: 0.01,
      vixLevel: 18,
      sectorDispersion: 0.08,
    };

    // VIX
    let vixLevel = defaults.vixLevel;
    try {
      vixLevel = await getIndexSnapshot("I:VIX");
    } catch {
      // use default
    }

    // S&P 500 30d return
    let sp500Return30d = defaults.sp500Return30d;
    try {
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
      const [current, past] = await Promise.all([
        getIndexSnapshot("I:SPX"),
        getIndexClose("I:SPX", thirtyDaysAgo.toISOString().slice(0, 10)).catch(() => null),
      ]);
      if (past && past > 0) {
        sp500Return30d = (current - past) / past;
      }
    } catch {
      // use default
    }

    // Sector dispersion
    let sectorDispersion = defaults.sectorDispersion;
    try {
      const sectorReturns = await getSectorETFReturns30d();
      if (sectorReturns.size >= 5) {
        sectorDispersion = stddev(Array.from(sectorReturns.values()));
      }
    } catch {
      // use default
    }

    return { sp500Return30d, vixLevel, sectorDispersion };
  });
}

// ---------------------------------------------------------------------------
// Batch Operations
// ---------------------------------------------------------------------------

/**
 * Get EOD close prices for multiple tickers on the same date.
 * Returns a Map of ticker → close price in cents.
 */
export async function getBatchEODPrices(
  tickers: string[],
  date: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  for (const ticker of tickers) {
    try {
      const eod = await getEODPrice(ticker, date);
      result.set(ticker.toUpperCase(), eod.closeCents);
    } catch {
      // Skip tickers with no data
      const fallback = DEV_FALLBACK_PRICES[ticker.toUpperCase()];
      if (fallback) result.set(ticker.toUpperCase(), fallback);
    }
  }

  return result;
}

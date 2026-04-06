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

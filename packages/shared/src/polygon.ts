/**
 * Minimal Polygon.io price helper for Sprint 2.
 * Sprint 3.1 will expand this into a full Polygon client with caching.
 */

const DEV_FALLBACK_PRICES: Record<string, number> = {
  AAPL: 22500,
  MSFT: 42000,
  GOOGL: 17500,
  AMZN: 19000,
  NVDA: 95000,
  META: 55000,
  TSLA: 25000,
};

/**
 * Get the current (previous close) price for a ticker in cents.
 * Falls back to hardcoded dev prices when POLYGON_API_KEY is unset.
 */
export async function getCurrentPrice(ticker: string): Promise<number> {
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    const fallback = DEV_FALLBACK_PRICES[ticker.toUpperCase()];
    if (fallback) return fallback;
    throw new Error(`No fallback price for ticker: ${ticker}`);
  }

  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?apiKey=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    // Fall back to dev prices if Polygon is unavailable
    const fallback = DEV_FALLBACK_PRICES[ticker.toUpperCase()];
    if (fallback) return fallback;
    throw new Error(`Polygon API error (${response.status}) for ${ticker}`);
  }

  const data = (await response.json()) as { results?: Array<{ c?: number }> };
  const close = data?.results?.[0]?.c;

  if (typeof close !== "number") {
    const fallback = DEV_FALLBACK_PRICES[ticker.toUpperCase()];
    if (fallback) return fallback;
    throw new Error(`No price data from Polygon for ${ticker}`);
  }

  return Math.round(close * 100); // Convert dollars to cents
}

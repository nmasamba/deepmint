import { SourceAdapter, type RawCapture } from "./base";
import { mentionsMag7 } from "../extractor";
import { resolveOrCreateGuide } from "./resolver";
import { MAG7_TICKERS, polygonRateLimit } from "@deepmint/shared";

/**
 * Wall Street ratings lane: third-party analyst calls recovered from financial
 * news carried by Polygon/Massive (the key is already provisioned for prices).
 *
 * The publisher is only the *carrier* of the text — the issuing firm is
 * recovered downstream by the extractor and becomes the claim's attributed
 * entity. The publisher entity created here holds provenance on the `events`
 * row and normally receives no claims of its own, so it never surfaces on a
 * leaderboard.
 */

/** Shape of the fields we consume from /v2/reference/news. */
interface PolygonNewsArticle {
  title?: string;
  description?: string;
  article_url?: string;
  published_utc?: string;
  publisher?: { name?: string; homepage_url?: string };
}

const NEWS_ENDPOINT = "https://api.polygon.io/v2/reference/news";
/** Articles requested per ticker. */
const PER_TICKER_LIMIT = 50;
/** Retries for a throttled (429) response before giving up on a ticker. */
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PolygonNewsSourceAdapter extends SourceAdapter {
  readonly name = "polygon-news";

  async fetchLatest(): Promise<RawCapture[]> {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) return [];

    const captures: RawCapture[] = [];
    // The same article is returned under several tickers; keep one capture.
    const seenUrls = new Set<string>();
    // One entity lookup per publisher per run, not per article.
    const publisherEntities = new Map<string, string>();

    for (const ticker of MAG7_TICKERS) {
      let articles: PolygonNewsArticle[];
      try {
        articles = await this.fetchTicker(ticker, apiKey);
      } catch (err) {
        // A single ticker failing must not abort the whole run.
        console.warn(
          `[polygon-news] ${ticker} fetch failed:`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }

      for (const article of articles) {
        const sourceUrl = article.article_url?.trim();
        if (!sourceUrl || seenUrls.has(sourceUrl)) continue;

        // Only the publisher's own text. Polygon's `insights` block is derived
        // AI output, not published content — including it would put
        // second-hand interpretation into the hashed provenance record.
        const rawText = [article.title, article.description]
          .filter((s): s is string => !!s && s.trim().length > 0)
          .join("\n\n")
          .trim();
        if (!rawText || !mentionsMag7(rawText)) continue;

        const publisherName = article.publisher?.name?.trim();
        if (!publisherName) continue; // no provenance — skip

        let entityId = publisherEntities.get(publisherName);
        if (!entityId) {
          entityId = await resolveOrCreateGuide({
            handle: publisherName,
            displayName: publisherName,
            sourceUrl: article.publisher?.homepage_url?.trim() || undefined,
            allowlisted: false, // never auto-scraped as a Guide feed
          });
          publisherEntities.set(publisherName, entityId);
        }

        seenUrls.add(sourceUrl);
        captures.push({
          entityId,
          sourceUrl,
          rawText,
          // MUST be the article's own publish time, not now(): the content hash
          // is computed over capturedAt, so a wall-clock value would produce a
          // fresh hash every run and defeat event de-duplication entirely.
          capturedAt: parsePublishedAt(article.published_utc),
          publisher: publisherName,
        });
      }
    }

    return captures;
  }

  /**
   * Fetch one ticker's news, respecting the shared Polygon throttle and backing
   * off on 429 (observed against the current plan when sweeping all 7 tickers).
   */
  private async fetchTicker(
    ticker: string,
    apiKey: string,
    attempt = 0,
  ): Promise<PolygonNewsArticle[]> {
    await polygonRateLimit();

    const url = `${NEWS_ENDPOINT}?ticker=${encodeURIComponent(ticker)}&order=desc&limit=${PER_TICKER_LIMIT}`;
    const res = await fetch(url, {
      // Header auth keeps the credential out of URLs and logs.
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 5_000);
      return this.fetchTicker(ticker, apiKey, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`Polygon news ${ticker}: HTTP ${res.status}`);
    }

    const json = (await res.json()) as { results?: PolygonNewsArticle[] };
    return json.results ?? [];
  }
}

/** Parse the article timestamp, falling back to now for a malformed value. */
function parsePublishedAt(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

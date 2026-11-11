import Parser from "rss-parser";
import { SourceAdapter, type RawCapture } from "./base";
import { mentionsMag7 } from "../extractor";

/**
 * A post published longer than this before a read is left out (maintainer's
 * choice, 2026-11-10). The feed lane dates a claim the day its post is stored,
 * so a feed's first read would otherwise turn months of old posts into claims
 * dated today, scored against a market their author never saw. History is a
 * backfill's job, which dates each claim as published. Seven days covers the
 * weekday ingest's weekend and holiday gaps.
 */
export const FEED_MAX_AGE_DAYS = 7;

export interface RssFeed {
  /** RSS/Atom feed URL. */
  feedUrl: string;
  /** Resolved Guide entity id this feed's content is attributed to. */
  entityId: string;
}

/**
 * Ingestion adapter for RSS/Atom feeds (analyst blogs, newsletters). Runs on
 * fetch (Vercel-serverless safe — no headless browser). Applies the Mag-7
 * pre-filter so only candidate items become captures, and skips posts older
 * than FEED_MAX_AGE_DAYS. An undated item cannot be judged, so it is kept and
 * dated when first seen.
 */
export class RssSourceAdapter extends SourceAdapter {
  readonly name = "rss";
  private readonly parser = new Parser({ timeout: 15_000 });

  constructor(
    private readonly feeds: RssFeed[],
    /** The time of the read; injectable for tests. */
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  async fetchLatest(): Promise<RawCapture[]> {
    const captures: RawCapture[] = [];
    const readAt = this.now();
    const oldest = readAt.getTime() - FEED_MAX_AGE_DAYS * 86_400_000;

    for (const feed of this.feeds) {
      try {
        const parsed = await this.parser.parseURL(feed.feedUrl);
        for (const item of parsed.items ?? []) {
          const rawText = [item.title, item.contentSnippet ?? item.content ?? ""]
            .filter(Boolean)
            .join("\n\n")
            .trim();
          if (!rawText) continue;

          // Skip items that cannot reference a trackable Mag-7 instrument.
          if (!mentionsMag7(rawText)) continue;

          const published = parseItemDate(item.isoDate ?? item.pubDate);
          if (published && published.getTime() < oldest) continue;

          captures.push({
            entityId: feed.entityId,
            sourceUrl: item.link ?? feed.feedUrl,
            rawText,
            capturedAt: published ?? readAt,
            undated: !published,
          });
        }
      } catch (err) {
        console.warn(
          `[rss] Failed to fetch ${feed.feedUrl}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return captures;
  }
}

/** An item's date, or null if it has none or it cannot be read. */
function parseItemDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

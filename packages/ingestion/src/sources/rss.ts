import Parser from "rss-parser";
import { SourceAdapter, type RawCapture } from "./base";
import { mentionsMag7 } from "../extractor";

export interface RssFeed {
  /** RSS/Atom feed URL. */
  feedUrl: string;
  /** Resolved Guide entity id this feed's content is attributed to. */
  entityId: string;
}

/**
 * Ingestion adapter for RSS/Atom feeds (analyst blogs, newsletters). Runs on
 * fetch (Vercel-serverless safe — no headless browser). Applies the Mag-7
 * pre-filter so only candidate items become captures.
 */
export class RssSourceAdapter extends SourceAdapter {
  readonly name = "rss";
  private readonly parser = new Parser({ timeout: 15_000 });

  constructor(private readonly feeds: RssFeed[]) {
    super();
  }

  async fetchLatest(): Promise<RawCapture[]> {
    const captures: RawCapture[] = [];

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

          const capturedAt = item.isoDate
            ? new Date(item.isoDate)
            : item.pubDate
              ? new Date(item.pubDate)
              : new Date();

          captures.push({
            entityId: feed.entityId,
            sourceUrl: item.link ?? feed.feedUrl,
            rawText,
            capturedAt,
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

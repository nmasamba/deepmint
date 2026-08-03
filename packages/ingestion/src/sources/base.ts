/**
 * Base interface for ingestion source adapters.
 * Each source (blog, RSS, social media) implements this interface
 * to provide raw captures for the ingestion pipeline.
 */

export interface RawCapture {
  entityId: string;
  sourceUrl: string;
  rawText: string;
  capturedAt: Date;
  /**
   * Publication that carried the text (Wall Street ratings lane). Left unset
   * for a Guide's own feed, where the author and the source are the same.
   */
  publisher?: string;
}

export abstract class SourceAdapter {
  abstract readonly name: string;

  /**
   * Fetch the latest content from this source.
   * Returns an array of raw captures ready for hashing and extraction.
   */
  abstract fetchLatest(): Promise<RawCapture[]>;
}

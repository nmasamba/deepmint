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
}

export abstract class SourceAdapter {
  abstract readonly name: string;

  /**
   * Fetch the latest content from this source.
   * Returns an array of raw captures ready for hashing and extraction.
   */
  abstract fetchLatest(): Promise<RawCapture[]>;
}

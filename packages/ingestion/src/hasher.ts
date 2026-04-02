import { createHash } from "crypto";

/**
 * Compute SHA-256 content hash for an event.
 * This hash is immutable — computed once at capture time, never recomputed.
 * Follows architecture.md §4.1 exactly.
 */
export function computeContentHash(
  sourceUrl: string,
  rawText: string,
  capturedAt: Date,
): string {
  const payload = JSON.stringify({
    url: sourceUrl,
    text: rawText,
    ts: capturedAt.toISOString(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

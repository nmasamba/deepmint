import { createHash } from "crypto";

/**
 * Compute SHA-256 content hash for an event.
 * This hash is immutable — computed once at capture time, never recomputed.
 * Follows architecture.md §4.1 exactly. Pass null for an item whose source gave
 * no date: the time it was seen differs on every run, so it cannot be hashed.
 */
export function computeContentHash(
  sourceUrl: string,
  rawText: string,
  capturedAt: Date | null,
): string {
  const payload = JSON.stringify({
    url: sourceUrl,
    text: rawText,
    ts: capturedAt?.toISOString() ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

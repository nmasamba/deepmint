import { computeContentHash } from "./hasher";
import { uploadSnapshot, snapshotKey } from "./r2";

export interface CaptureResult {
  rawText: string;
  snapshotPath: string | null;
  contentHash: string;
  capturedAt: Date;
}

/**
 * Capture a snapshot of a URL: take screenshot, extract text, upload to R2.
 * Uses Playwright headless Chromium for rendering.
 *
 * In environments without Playwright (e.g. Vercel), falls back to text-only capture.
 */
export async function captureSnapshot(
  url: string,
  entityId: string,
): Promise<CaptureResult> {
  const capturedAt = new Date();

  try {
    // Dynamic import — Playwright may not be available in all environments
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Extract text content
    const rawText = await page.innerText("body");

    // Take full-page screenshot
    const screenshot = await page.screenshot({ fullPage: true, type: "png" });

    await browser.close();

    // Compute content hash
    const contentHash = computeContentHash(url, rawText, capturedAt);

    // Upload to R2
    const key = snapshotKey(capturedAt, contentHash);
    let snapshotPath: string | null = null;
    try {
      snapshotPath = await uploadSnapshot(key, screenshot);
    } catch {
      // R2 upload failure is non-fatal — we still have the text
      console.warn(`Failed to upload snapshot to R2 for ${url}`);
    }

    return { rawText, snapshotPath, contentHash, capturedAt };
  } catch {
    // Fallback: text-only capture without browser (e.g., for testing)
    console.warn(`Playwright capture failed for ${url}, using fetch fallback`);
    const response = await fetch(url);
    const rawText = await response.text();
    const contentHash = computeContentHash(url, rawText, capturedAt);

    return { rawText, snapshotPath: null, contentHash, capturedAt };
  }
}

/**
 * Compute content hash and generate snapshot path without actually capturing.
 * Useful for pre-fetched text (e.g., from source adapters that provide text directly).
 */
export function processRawCapture(
  sourceUrl: string,
  rawText: string,
  capturedAt: Date,
): { contentHash: string; snapshotPath: null } {
  const contentHash = computeContentHash(sourceUrl, rawText, capturedAt);
  return { contentHash, snapshotPath: null };
}

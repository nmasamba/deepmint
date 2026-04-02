export { computeContentHash } from "./hasher";
export { uploadSnapshot, getSnapshotUrl, snapshotKey } from "./r2";
// capture.ts uses Playwright and is imported directly where needed (not via barrel)
// to avoid bundling Playwright in the Next.js web build
export { extractClaims, processExtraction, type ExtractedClaim, type ExtractionResult } from "./extractor";
export { SourceAdapter, type RawCapture } from "./sources/base";
export { DemoSourceAdapter } from "./sources/demo";

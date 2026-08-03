export { computeContentHash } from "./hasher";
export { uploadSnapshot, getSnapshotUrl, snapshotKey } from "./r2";
// capture.ts uses Playwright and is imported directly where needed (not via barrel)
// to avoid bundling Playwright in the Next.js web build
export {
  extractClaims,
  processExtraction,
  mentionsMag7,
  stripJsonFences,
  isValidAnalystFirm,
  parseRatingDate,
  RATING_GRADES,
  RATING_ACTIONS,
  type ExtractedClaim,
  type ExtractionResult,
  type ProcessExtractionOptions,
  type SourceKind,
  type RatingGrade,
  type RatingAction,
} from "./extractor";
export { SourceAdapter, type RawCapture } from "./sources/base";
export { DemoSourceAdapter } from "./sources/demo";
export { RssSourceAdapter, type RssFeed } from "./sources/rss";
export { PolygonNewsSourceAdapter } from "./sources/polygonNews";
export {
  resolveOrCreateGuide,
  slugify,
  type ResolveGuideInput,
} from "./sources/resolver";

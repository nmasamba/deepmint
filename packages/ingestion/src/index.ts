export { computeContentHash } from "./hasher";
export {
  DEFAULT_MODEL,
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
export { RssSourceAdapter, type RssFeed } from "./sources/rss";
export { PolygonNewsSourceAdapter } from "./sources/polygonNews";
export {
  resolveOrCreateGuide,
  type ResolveGuideInput,
} from "./sources/resolver";

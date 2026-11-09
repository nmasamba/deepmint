import type { ValidHorizon } from "./constants";

/**
 * Grid durations an author can name outright, keyed by "<count> <unit>".
 * Approximations (4 weeks, 52 weeks, "a quarter") are deliberately absent.
 */
const EXPLICIT_HORIZONS: Record<string, ValidHorizon> = {
  "1 day": 1,
  "7 day": 7, "1 week": 7,
  "30 day": 30, "1 month": 30,
  "90 day": 90, "3 month": 90,
  "180 day": 180, "6 month": 180,
  "365 day": 365, "12 month": 365, "1 year": 365,
};
const COUNT_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, three: 3, six: 6, seven: 7, twelve: 12, thirty: 30, ninety: 90,
};
// The whole phrase must be a single duration, optionally framed as "within",
// "in", "over the next" etc. Ranges, calendar dates, deadlines and vague terms
// cannot match.
const EXPLICIT_HORIZON_PATTERN =
  /^((?:within|in|over|for|during) the (?:next|coming) |(?:within|in) |(?:the )?(?:next|coming) )?(\d{1,3}|an?|one|three|six|seven|twelve|thirty|ninety)[ -]?(day|week|month|year)s?( (?:from now|time|horizon|timeframe|time frame|period|target|price target|target price|price objective))?$/;

/**
 * True only if the author's horizon words explicitly name the same grid
 * duration as `horizonDays` ("within 90 days" for 90, "12-month" for 365).
 * Conservative: vague ("near term"), multi-year, ranged ("next 3-5 years") or
 * calendar-dated ("by 2028") wording is never explicit, so the claim is
 * reviewed rather than scored against a horizon the author never gave.
 */
export function isExplicitHorizon(stated: string | null, horizonDays: number): boolean {
  // The longest accepted phrase is ~45 chars; the cap also bounds regex work.
  if (stated == null || stated.length > 80) return false;
  const phrase = stated
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/['\u2019"\u201C\u201D]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "");
  const match = EXPLICIT_HORIZON_PATTERN.exec(phrase);
  if (!match) return false;
  const [, framing, countWord, unit, suffix] = match;
  // A bare "one day" or "a year" is as often an idiom or a rate ("someday",
  // "20% a year") as a horizon, so a spelled-out single unit needs framing.
  if (/^(?:an?|one)$/.test(countWord!) && !framing && !suffix) return false;
  const count = COUNT_WORDS[countWord!] ?? Number(countWord);
  return EXPLICIT_HORIZONS[`${count} ${unit}`] === horizonDays;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026",
};

/** Decode HTML entities, then collapse whitespace (including &nbsp;). */
function normaliseForComparison(text: string): string {
  return text
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
      if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
      const code = /^#x/i.test(body) ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Leave NUL (which Postgres text rejects), surrogates and out-of-range codes encoded.
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Accept a quote only if it appears verbatim in the source text, compared
 * after decoding HTML entities (feed text carries e.g. &#8220;) and collapsing
 * whitespace on both sides. Returns the normalised quote, or null — a
 * paraphrased or invented quote is never stored as evidence.
 *
 * A quote that starts or ends on a word character must start or end on a
 * token boundary in the source, so "$30" does not verify inside "$300", nor
 * "3 months" inside "13 months" or "6-12 months".
 */
export function verifyVerbatim(value: unknown, sourceText: string): string | null {
  if (typeof value !== "string") return null;
  const quote = normaliseForComparison(value);
  if (!quote) return null;
  const word = "[\\p{L}\\p{N}\\-\\u2010-\\u2015]";
  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    (new RegExp(`^${word}`, "u").test(quote) ? `(?<!${word})` : "") +
      escaped +
      (new RegExp(`${word}$`, "u").test(quote) ? `(?!${word})` : ""),
    "u",
  );
  return pattern.test(normaliseForComparison(sourceText)) ? quote : null;
}

/** Why an extracted claim is waiting for review, in the admin's words. */
export const HOLD_REASON_TEXT = {
  unattributed_rating:
    "No issuing firm was identified, so this rating sits on whoever carried the text. Approving it would score them for it, so it can only be rejected.",
  firm_in_guide_post:
    "The author's own post names a firm, so the claim was moved to that firm. Approve only if the firm made this call.",
  no_verified_quote:
    "The model's quote was not found word for word in the source.",
  horizon_not_verified:
    "The quote does not state this horizon in the author's own words.",
  earlier_copy_rejected:
    "A copy of this call from the same day was already rejected.",
  low_extraction_confidence:
    "The model was less than 80% confident in this extraction.",
} as const;

export type HoldReason = keyof typeof HOLD_REASON_TEXT;

/**
 * A Wall Street rating still on the entity that carried it, because no issuing
 * firm was resolved. Scoring it would rank a publication as a Guide. A firm that
 * publishes its own rating looks the same; refusing that one is the safe error.
 */
export function isUnattributedRating(
  claim: { sourceKind: string | null; entityId: string },
  carrierEntityId: string | null,
): boolean {
  return (
    claim.sourceKind === "wall_street_rating" &&
    claim.entityId === carrierEntityId
  );
}

/**
 * Why a pending claim was held, worked out from what is stored. Extraction
 * confidence is not stored, so it is the reason left when no other applies.
 * A claim with no event never went through extraction, so has none.
 */
export function claimHoldReasons(
  claim: {
    eventId: string | null;
    entityId: string;
    sourceKind: string | null;
    horizonDays: number;
    horizonStated: string | null;
    sourceExcerpt: string | null;
  },
  context: {
    /** The entity on the claim's event, which carried the text. */
    carrierEntityId: string | null;
    /** The event's publisher; null for a Guide's own post. */
    publisher: string | null;
    earlierCopyRejected: boolean;
  },
): HoldReason[] {
  if (!claim.eventId) return [];

  const reasons: HoldReason[] = [];
  if (isUnattributedRating(claim, context.carrierEntityId)) {
    reasons.push("unattributed_rating");
  } else if (claim.sourceKind === "wall_street_rating" && !context.publisher) {
    reasons.push("firm_in_guide_post");
  }
  if (!claim.sourceExcerpt) {
    reasons.push("no_verified_quote");
  } else if (
    !isExplicitHorizon(
      verifyVerbatim(claim.horizonStated, claim.sourceExcerpt),
      claim.horizonDays,
    )
  ) {
    reasons.push("horizon_not_verified");
  }
  if (context.earlierCopyRejected) reasons.push("earlier_copy_rejected");

  return reasons.length > 0 ? reasons : ["low_extraction_confidence"];
}

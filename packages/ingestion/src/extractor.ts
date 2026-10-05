import OpenAI from "openai";
import { db, eq, and, sql } from "@deepmint/db";
import { instruments, claims } from "@deepmint/db/schema";
import {
  MAG7_TICKERS,
  VALID_HORIZONS,
  type ValidHorizon,
  getCurrentPrice,
  getEODPrice,
  tradingDayOnOrBefore,
} from "@deepmint/shared";
import { resolveOrCreateGuide } from "./sources/resolver";

/**
 * LLM extraction using HuggingFace Inference (OpenAI API-compatible).
 * Configurable model via LLM_MODEL env var.
 */

function getLLMClient(): OpenAI {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) {
    throw new Error("HF_API_KEY environment variable is required for LLM extraction");
  }

  return new OpenAI({
    baseURL: "https://router.huggingface.co/v1",
    apiKey,
    // Cap worst-case wall time — the SDK default is 10 minutes per attempt.
    timeout: LLM_TIMEOUT_MS,
    maxRetries: LLM_MAX_RETRIES,
  });
}

// Models are not pinned to a provider. The HF router's ":fastest" policy picks
// the quickest provider serving the model at request time, so a provider
// dropping it fails over with no config change (a pinned
// "meta-llama/Llama-3.3-70B-Instruct:groq" started returning 404 on
// 2026-10-05). Pinning a provider ("model:provider") brings that failure back.

// Primary model when LLM_MODEL is unset. Benchmarked fastest reliable model
// for multi-claim extraction (~1s vs 120s+ timeouts on the now-deprecated
// Qwen3-235B-A22B).
const DEFAULT_MODEL = "openai/gpt-oss-120b:fastest";

// Fallback model tried when the primary errors. A different model, so one
// model being withdrawn cannot take out both. Override via LLM_MODEL_FALLBACK;
// set to "" to disable.
const DEFAULT_FALLBACK_MODEL = "meta-llama/Llama-3.3-70B-Instruct:fastest";

/**
 * Strip markdown code fences from an LLM response so the inner JSON can be
 * parsed. Trims first so the closing fence is anchored correctly even with a
 * trailing newline, and accepts bare ``` fences (no language tag), which open
 * models commonly emit. Returns the content unchanged if it is not fenced.
 */
export function stripJsonFences(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

const EXTRACTION_PROMPT = `You are a financial claim extractor. Given raw text from an analyst, trader, or financial news article, extract structured predictions.

For each prediction found, return JSON:
{
  "claims": [
    {
      "instrument_ticker": "AAPL",
      "direction": "long" | "short" | "neutral",
      "target_price": 250.00 | null,
      "horizon_stated": "over the next 12 months" | "by Q3 2026" | "near term" | null,
      "horizon_days": 365 | 180 | 90 | 30 | 7 | 1,
      "confidence_description": "high conviction" | "speculative" | null,
      "confidence_score": 85 | 50 | null,
      "rationale_summary": "Strong iPhone cycle + services growth",
      "rationale_tags": ["earnings", "technical", "macro", "sector", "catalyst", "valuation", "momentum", "contrarian", "insider", "regulatory"],
      "analyst_firm": "Morgan Stanley" | null,
      "analyst_name": "Katy Huberty" | null,
      "rating_grade": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" | null,
      "rating_action": "initiate" | "upgrade" | "downgrade" | "maintain" | "reiterate" | null,
      "rating_date": "2026-07-28" | null,
      "source_excerpt": "We see AAPL reaching $250 over the next 12 months on a strong iPhone cycle."
    }
  ],
  "extraction_confidence": 0.95
}

ATTRIBUTION RULES (critical):
- "analyst_firm" is the institution that ISSUED the rating (e.g. "Morgan Stanley", "Wedbush", "Goldman Sachs").
- It is NOT the publication reporting it. Yahoo Finance, Nasdaq, Seeking Alpha, The Motley Fool, Zacks,
  Benzinga, Reuters, Bloomberg, CNBC, MarketWatch and Barron's are PUBLICATIONS — never return one as analyst_firm.
- If the issuing firm is not EXPLICITLY named in the text, set "analyst_firm" to null. NEVER guess or infer it.
- "analyst_name": the individual analyst, only if explicitly named, else null.
- "rating_date": ISO YYYY-MM-DD the rating was issued, only if stated in the text, else null.

EVIDENCE RULES (critical):
- "horizon_stated": the author's own words for the time frame, copied EXACTLY from the text
  (e.g. "within 90 days", "over the next 6 months", "by 2028", "long term"). If the text states
  no time frame for this prediction, set it to null. NEVER paraphrase, convert or invent one.
- "source_excerpt": the one or two sentences from the text that make this prediction, including its
  time frame when one is stated, copied EXACTLY, character for character. Do not paraphrase, shorten,
  join separate passages or fix typos.

Rules:
- Only extract EXPLICIT predictions with a directional view
- Do NOT infer predictions that aren't clearly stated, and do NOT treat general market commentary as a prediction
- horizon_days must be one of 1, 7, 30, 90, 180, 365
- If horizon is vague, use the most conservative interpretation
- Set extraction_confidence to reflect your certainty about the extraction quality
- Return empty claims array if no predictions found
- IMPORTANT: Return ONLY valid JSON, no markdown formatting or code blocks`;

export const RATING_GRADES = [
  "strong_buy", "buy", "hold", "sell", "strong_sell",
] as const;
export type RatingGrade = (typeof RATING_GRADES)[number];

export const RATING_ACTIONS = [
  "initiate", "upgrade", "downgrade", "maintain", "reiterate",
] as const;
export type RatingAction = (typeof RATING_ACTIONS)[number];

/**
 * Publications that carry ratings but never issue them. Models reliably obey
 * the prompt's attribution rule, but a leaked publication would mint a bogus
 * "Guide" entity that then ranks on the leaderboard — an unrecoverable error
 * against an append-only ledger, so it is enforced in code as well.
 */
const PUBLICATION_PATTERN =
  /\b(yahoo|nasdaq|seeking\s*alpha|motley\s*fool|the\s*fool|zacks|benzinga|reuters|bloomberg|cnbc|marketwatch|barron'?s?|globenewswire|business\s*wire|pr\s*newswire|thestreet|the\s*street|insider\s*monkey|simply\s*wall\s*st|investing\.com|forbes|wall\s*street\s*journal|wsj|financial\s*times|investor'?s\s*business\s*daily|associated\s*press|business\s*insider)\b/i;

/** Reject a firm that is really a publication, a stub, or boilerplate. */
export function isValidAnalystFirm(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const firm = value.trim();
  if (firm.length < 2 || firm.length > 200) return false;
  if (/^(n\/?a|none|null|unknown|analyst|analysts)$/i.test(firm)) return false;
  return !PUBLICATION_PATTERN.test(firm);
}

/**
 * Accept an ISO YYYY-MM-DD rating date that is real and plausible. A bad date
 * would backdate a claim and price its entry against the wrong day, so an
 * out-of-range value is dropped rather than coerced.
 */
export function parseRatingDate(value: unknown, now: Date = new Date()): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip guards against overflow dates like 2026-02-31.
  if (parsed.toISOString().slice(0, 10) !== raw) return null;
  // Allow a day of clock skew ahead; reject anything further out or very stale.
  const maxAhead = now.getTime() + 86_400_000;
  const maxBehind = now.getTime() - 5 * 365 * 86_400_000;
  if (parsed.getTime() > maxAhead || parsed.getTime() < maxBehind) return null;
  return raw;
}

/**
 * Normalise a claim's confidence onto the integer 0-100 scale of
 * claims.confidence. Models sometimes answer on a 0-1 scale (0.85) or with a
 * fraction (72.5), and either fails the integer insert. Values above 0 and up
 * to 1 are read as fractions, mirroring how extraction_confidence is rescaled.
 */
export function parseConfidenceScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, scaled)));
}

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

export interface ExtractedClaim {
  instrumentTicker: string;
  direction: "long" | "short" | "neutral";
  targetPrice: number | null;
  horizonDays: number;
  confidenceScore: number | null;
  rationaleSummary: string;
  rationaleTags: string[];
  /** Issuing institution, when explicitly named and not a publication. */
  analystFirm: string | null;
  analystName: string | null;
  ratingGrade: RatingGrade | null;
  ratingAction: RatingAction | null;
  /** ISO YYYY-MM-DD the rating was issued, when stated. */
  ratingDate: string | null;
  /** The author's own horizon words, kept only if found verbatim in the source. */
  horizonStated: string | null;
  /** Supporting quote, kept only if found verbatim in the source text. */
  sourceExcerpt: string | null;
}

export interface ExtractionResult {
  validClaims: ExtractedClaim[];
  invalidClaims: Array<{ raw: Record<string, unknown>; reason: string }>;
  extractionConfidence: number;
  /**
   * The model that answered and the provider the router picked for it, e.g.
   * "openai/gpt-oss-120b:fastest (cerebras)". Null when no model was called.
   */
  model: string | null;
}

/**
 * Extract structured claims from raw text using LLM.
 */
// Per-call request controls: bound wall time (the SDK default is 10 minutes
// per attempt) so the Inngest worker can retry the step cleanly instead of
// hanging, and cap output size. 120s accommodates a large model's cold-start +
// generation latency on the HF router while still failing far short of 10min.
const LLM_TIMEOUT_MS = 120_000;
const LLM_MAX_RETRIES = 2;
// A post naming several stocks overflowed 1024 (truncated JSON on 19% of real
// posts); none did at 4096.
const LLM_MAX_OUTPUT_TOKENS = 4096;

// High-recall pre-filter patterns: ticker symbols + $cashtags + company names
// for each Mag-7 instrument. We only track Mag-7, so a text that references
// none of these cannot contain a trackable prediction.
const MAG7_MENTION_PATTERNS: RegExp[] = [
  /\baapl\b|\bapple\b/i,
  /\bmsft\b|\bmicrosoft\b/i,
  /\bgoogl?\b|\bgoogle\b|\balphabet\b/i,
  /\bamzn\b|\bamazon\b/i,
  /\bnvda\b|\bnvidia\b/i,
  /\bmeta\b|\bfacebook\b|\binstagram\b/i,
  /\btsla\b|\btesla\b/i,
];

/**
 * High-recall pre-filter: true if the text plausibly references a Mag-7
 * instrument (ticker, $cashtag, or company name). Used to skip the slow, paid
 * LLM extraction call on text that cannot contain a trackable Mag-7 prediction.
 * Intentionally conservative — errs toward letting text through rather than
 * dropping a real prediction.
 */
export function mentionsMag7(text: string): boolean {
  return MAG7_MENTION_PATTERNS.some((re) => re.test(text));
}

/**
 * Call the extraction model. Requests JSON mode (response_format) so the output
 * is guaranteed parseable; if the routed model rejects that parameter, retries
 * once without it (stripJsonFences handles any markdown wrapping). Applies a
 * per-call timeout, bounded retries, and an output cap.
 *
 * Throws on a truncated, empty or unparseable response. Returning "no claims"
 * instead would silently drop every call in the post; throwing hands it to the
 * fallback model and then to the worker's retries.
 *
 * Also returns the provider that served the call, which the HF router reports
 * in the x-inference-provider header (":fastest" picks it per request).
 */
async function callExtractionLLM(
  client: OpenAI,
  model: string,
  rawText: string,
): Promise<{ parsed: Record<string, unknown>; provider: string | null }> {
  const base = {
    model,
    messages: [
      { role: "system" as const, content: EXTRACTION_PROMPT },
      { role: "user" as const, content: rawText },
    ],
    temperature: 0.1,
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
  };
  const options = { timeout: LLM_TIMEOUT_MS, maxRetries: LLM_MAX_RETRIES };

  let res: { data: OpenAI.Chat.ChatCompletion; response: Response };
  try {
    res = await client.chat.completions
      .create({ ...base, response_format: { type: "json_object" } }, options)
      .withResponse();
  } catch (err) {
    // Some HuggingFace-routed models reject response_format. Fall back to a
    // plain call ONLY for a parameter-support error — rethrow genuine
    // timeouts/network failures so the worker retries the whole step.
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const paramUnsupported =
      status === 400 || msg.includes("response_format") || msg.includes("json");
    if (!paramUnsupported) throw err;
    res = await client.chat.completions.create(base, options).withResponse();
  }

  const choice = res.data.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(`Model ${model} hit the ${LLM_MAX_OUTPUT_TOKENS}-token output cap (truncated)`);
  }
  const content = choice?.message?.content;
  if (!content) throw new Error(`Model ${model} returned empty content`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(content));
  } catch {
    throw new Error(`Model ${model} returned unparseable output: ${content.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { claims?: unknown }).claims)) {
    throw new Error(`Model ${model} returned JSON without a claims array: ${content.slice(0, 200)}`);
  }
  return {
    parsed: parsed as Record<string, unknown>,
    provider: res.response.headers.get("x-inference-provider"),
  };
}

export async function extractClaims(
  rawText: string,
): Promise<ExtractionResult> {
  const client = getLLMClient();

  // Skip the LLM call entirely when no Mag-7 instrument is referenced — most
  // scraped text is off-topic, so this removes the bulk of LLM volume.
  if (!mentionsMag7(rawText)) {
    return { validClaims: [], invalidClaims: [], extractionConfidence: 0, model: null };
  }

  // Try the primary model, then the fallback if it errors (e.g. a provider
  // deprecated/dropped the model). Distinct model+provider for resilience.
  const fallback = process.env.LLM_MODEL_FALLBACK ?? DEFAULT_FALLBACK_MODEL;
  const models = [
    // `||`, not `??`: an empty LLM_MODEL means "use the default", whereas an
    // empty LLM_MODEL_FALLBACK deliberately disables the fallback.
    process.env.LLM_MODEL || DEFAULT_MODEL,
    fallback,
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let parsed: Record<string, unknown> | undefined;
  let usedModel: string | null = null;
  let lastError: unknown;
  for (const model of models) {
    try {
      const reply = await callExtractionLLM(client, model, rawText);
      parsed = reply.parsed;
      usedModel = `${model} (${reply.provider ?? "provider not reported"})`;
      console.log(`[extractor] Answered by ${usedModel}`);
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[extractor] Model ${model} failed, trying next:`, err instanceof Error ? err.message : err);
    }
  }
  // All models failed — let the worker retry.
  if (!parsed) throw lastError ?? new Error("No extraction model configured");

  const rawClaims = Array.isArray(parsed.claims) ? parsed.claims : [];
  // extraction_confidence is documented on a 0-1 scale and gates active vs
  // pending_review routing (>= 0.8). Clamp into [0,1]; if a model returns a
  // 0-100-scaled value, rescale it so the threshold stays meaningful.
  const rawExtractionConfidence =
    typeof parsed.extraction_confidence === "number" &&
    Number.isFinite(parsed.extraction_confidence)
      ? parsed.extraction_confidence
      : 0;
  const extractionConfidence =
    rawExtractionConfidence > 1
      ? Math.min(1, rawExtractionConfidence / 100)
      : Math.max(0, rawExtractionConfidence);

  const validClaims: ExtractedClaim[] = [];
  const invalidClaims: Array<{ raw: Record<string, unknown>; reason: string }> = [];

  const validTickers = new Set(MAG7_TICKERS);
  const validHorizons = new Set(VALID_HORIZONS as readonly number[]);
  const validDirections = new Set(["long", "short", "neutral"]);

  for (const raw of rawClaims) {
    const ticker = String(raw.instrument_ticker ?? "").toUpperCase();
    const direction = String(raw.direction ?? "");
    const horizonDays = Number(raw.horizon_days);

    if (!validTickers.has(ticker as (typeof MAG7_TICKERS)[number])) {
      invalidClaims.push({ raw, reason: `Invalid ticker: ${ticker}` });
      continue;
    }
    if (!validDirections.has(direction)) {
      invalidClaims.push({ raw, reason: `Invalid direction: ${direction}` });
      continue;
    }
    if (!validHorizons.has(horizonDays)) {
      // Try to map to nearest valid horizon
      const nearest = [...validHorizons].reduce((prev, curr) =>
        Math.abs(curr - horizonDays) < Math.abs(prev - horizonDays) ? curr : prev,
      );
      invalidClaims.push({
        raw,
        reason: `Invalid horizon: ${horizonDays} (nearest valid: ${nearest})`,
      });
      continue;
    }

    validClaims.push({
      instrumentTicker: ticker,
      direction: direction as "long" | "short" | "neutral",
      // Only accept a finite, strictly positive target price (a money field).
      targetPrice:
        typeof raw.target_price === "number" &&
        Number.isFinite(raw.target_price) &&
        raw.target_price > 0
          ? raw.target_price
          : null,
      horizonDays,
      // Integer 0-100, the scale of the confidence column and the consensus
      // weight boost.
      confidenceScore: parseConfidenceScore(raw.confidence_score),
      rationaleSummary: String(raw.rationale_summary ?? ""),
      rationaleTags: Array.isArray(raw.rationale_tags)
        ? raw.rationale_tags.filter((t: unknown): t is string => typeof t === "string")
        : [],
      // Attribution. Anything that fails validation degrades to null rather
      // than rejecting the claim — an unattributed claim is still useful (it
      // routes to review), whereas a wrongly attributed one is not.
      analystFirm: isValidAnalystFirm(raw.analyst_firm)
        ? raw.analyst_firm.trim()
        : null,
      analystName:
        typeof raw.analyst_name === "string" && raw.analyst_name.trim().length > 0
          ? raw.analyst_name.trim().slice(0, 200)
          : null,
      ratingGrade: (RATING_GRADES as readonly string[]).includes(
        String(raw.rating_grade),
      )
        ? (String(raw.rating_grade) as RatingGrade)
        : null,
      ratingAction: (RATING_ACTIONS as readonly string[]).includes(
        String(raw.rating_action),
      )
        ? (String(raw.rating_action) as RatingAction)
        : null,
      ratingDate: parseRatingDate(raw.rating_date),
      horizonStated: verifyVerbatim(raw.horizon_stated, rawText),
      sourceExcerpt: verifyVerbatim(raw.source_excerpt, rawText),
    });
  }

  return { validClaims, invalidClaims, extractionConfidence, model: usedModel };
}

/**
 * Process an extraction: extract claims from event text and insert into DB.
 * Routes to active/pending_review based on extraction confidence, attribution,
 * a stated horizon and a verified quote.
 */
/** Which ingestion lane produced a claim; mirrors the DB `source_kind` enum. */
export type SourceKind = "wall_street_rating" | "analyst_feed" | "self_logged";

export interface ProcessExtractionOptions {
  /**
   * The true historical timestamp for backfilled claims. Inserted directly
   * (never via UPDATE) so the append-only claims invariant holds. Defaults to
   * the DB's now() for the live forward path. An extracted rating_date takes
   * precedence, since it is the date the call was actually made.
   */
  createdAt?: Date;
  /**
   * Resolve the entry price (cents) for a ticker. Backfill supplies a resolver
   * that returns the EOD price AS OF the claim's historical date; the live path
   * defaults to getCurrentPrice (price now).
   */
  entryPriceResolver?: (ticker: string) => Promise<number | null>;
  /**
   * Lane that produced these claims. Wall Street ratings additionally require a
   * resolved issuing firm before a claim may go active.
   */
  sourceKind?: SourceKind;
}

/** UTC calendar date (YYYY-MM-DD) for a timestamp. */
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function processExtraction(
  eventId: string,
  rawText: string,
  entityId: string,
  options: ProcessExtractionOptions = {},
): Promise<{
  inserted: number;
  pending: number;
  invalid: number;
  duplicates: number;
  /** Which model and provider extracted this event; null if none was called. */
  model: string | null;
}> {
  // Idempotency: claims are APPEND-ONLY, so a worker retry that re-runs this
  // event would permanently duplicate them. Skip if this event already has
  // claims (and avoid a redundant LLM call).
  const [existingClaim] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(eq(claims.eventId, eventId))
    .limit(1);
  if (existingClaim) {
    return { inserted: 0, pending: 0, invalid: 0, duplicates: 0, model: null };
  }

  const result = await extractClaims(rawText);

  let inserted = 0;
  let pending = 0;
  let duplicates = 0;
  // Every claim is resolved first and then written in ONE statement, so a
  // post's claims land together or not at all. Written one at a time, a
  // failure mid-post left some claims in place, and on retry the guard above
  // skipped the event, losing the rest for good.
  const rows: (typeof claims.$inferInsert)[] = [];
  const batchKeys = new Set<string>();

  for (const claim of result.validClaims) {
    // Look up instrument by ticker
    const [instrument] = await db
      .select()
      .from(instruments)
      .where(eq(instruments.ticker, claim.instrumentTicker))
      .limit(1);

    if (!instrument) continue;

    // --- Attribution -------------------------------------------------------
    // Credit the claim to the institution that ISSUED it, not to whoever
    // carried the text. Without this the leaderboard ranks publications.
    // `entityId` (the carrier) remains the provenance owner on the event.
    let attributedEntityId = entityId;
    let attributed = false;
    if (claim.analystFirm) {
      try {
        // No sourceUrl: a firm is identified by name, and passing the carrier's
        // feed URL here would collide distinct firms onto one entity.
        attributedEntityId = await resolveOrCreateGuide({
          handle: claim.analystFirm,
          displayName: claim.analystFirm,
          allowlisted: false,
        });
        attributed = true;
      } catch {
        attributedEntityId = entityId; // fall back to the carrier
      }
    }

    // --- Claim timestamp ---------------------------------------------------
    // A rating is dated when it was ISSUED, which may predate the article
    // reporting it. Insert-only, so the append-only invariant holds.
    const claimCreatedAt = claim.ratingDate
      ? new Date(`${claim.ratingDate}T00:00:00Z`)
      : (options.createdAt ?? null);

    // --- Entry price -------------------------------------------------------
    let entryPriceCents: number | null = null;
    try {
      if (claim.ratingDate) {
        // Price as of the rating date, snapped back to a session that has a
        // bar (a weekend-dated rating would otherwise return no price).
        const asOf = tradingDayOnOrBefore(
          new Date(`${claim.ratingDate}T00:00:00Z`),
        );
        const eod = await getEODPrice(claim.instrumentTicker, toISODate(asOf));
        entryPriceCents = eod.closeCents;
      } else if (options.entryPriceResolver) {
        entryPriceCents = await options.entryPriceResolver(claim.instrumentTicker);
      } else {
        entryPriceCents = await getCurrentPrice(claim.instrumentTicker);
      }
    } catch {
      // Non-fatal — continue with null price
    }

    // Convert target price from dollars to cents. Explicit null check (not a
    // truthiness test) — targetPrice is already validated > 0 at extraction.
    const targetPriceCents =
      claim.targetPrice != null ? Math.round(claim.targetPrice * 100) : null;

    // Route by extraction confidence. A third-party rating whose issuing firm
    // could not be identified must never score, so it goes to human review
    // instead of being credited to the publication that carried it. Likewise a
    // claim scores only with a verified quote whose own horizon words
    // explicitly name horizon_days — not words borrowed from elsewhere in the post.
    const needsAttribution =
      options.sourceKind === "wall_street_rating" && !attributed;
    const evidenced = isExplicitHorizon(
      verifyVerbatim(claim.horizonStated, claim.sourceExcerpt ?? ""),
      claim.horizonDays,
    );
    const status =
      result.extractionConfidence >= 0.8 && !needsAttribution && evidenced
        ? "active"
        : "pending_review";

    // --- Cross-source de-duplication ---------------------------------------
    // One rating is reported by many publications, producing one event each.
    // Without this the same call is counted several times for the same firm
    // and its leaderboard weight is inflated. Compared as a bound date string,
    // never a JS Date against a raw SQL expression (breaks the pg serializer).
    const dedupeDate = toISODate(claimCreatedAt ?? new Date());
    const [duplicate] = await db
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.entityId, attributedEntityId),
          eq(claims.instrumentId, instrument.id),
          eq(claims.direction, claim.direction),
          eq(claims.horizonDays, claim.horizonDays),
          sql`${claims.createdAt}::date = ${dedupeDate}::date`,
        ),
      )
      .limit(1);

    // The same call listed twice in one post is also a duplicate: the query
    // above cannot see claims from this post, as none are written yet.
    const batchKey = [
      attributedEntityId, instrument.id, claim.direction, claim.horizonDays, dedupeDate,
    ].join("|");
    if (duplicate || batchKeys.has(batchKey)) {
      duplicates++;
      continue;
    }
    batchKeys.add(batchKey);

    rows.push({
      eventId,
      entityId: attributedEntityId,
      instrumentId: instrument.id,
      direction: claim.direction,
      targetPriceCents,
      horizonDays: claim.horizonDays,
      confidence: claim.confidenceScore ?? null,
      rationale: claim.rationaleSummary || null,
      rationaleTags: claim.rationaleTags,
      entryPriceCents,
      status,
      sourceKind: options.sourceKind ?? null,
      ratingGrade: claim.ratingGrade,
      ratingAction: claim.ratingAction,
      analystName: claim.analystName,
      horizonStated: claim.horizonStated,
      sourceExcerpt: claim.sourceExcerpt,
      // Explicit historical timestamp (insert-only; no UPDATE).
      ...(claimCreatedAt ? { createdAt: claimCreatedAt } : {}),
    });

    if (status === "active") inserted++;
    else pending++;
  }

  if (rows.length > 0) await db.insert(claims).values(rows);

  return {
    inserted,
    pending,
    invalid: result.invalidClaims.length,
    duplicates,
    model: result.model,
  };
}

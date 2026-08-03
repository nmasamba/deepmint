import OpenAI from "openai";
import { db, eq, and, sql } from "@deepmint/db";
import { instruments, claims } from "@deepmint/db/schema";
import {
  MAG7_TICKERS,
  VALID_HORIZONS,
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

// Primary model when LLM_MODEL is unset. Benchmarked fastest reliable combo
// for multi-claim extraction (~0.7s on Cerebras vs 120s+ timeouts on the
// now-deprecated Qwen3-235B-A22B). Uses the HF router model:provider syntax.
const DEFAULT_MODEL = "openai/gpt-oss-120b:cerebras";

// Fallback model tried when the primary errors (e.g. a provider deprecates or
// drops the model — observed repeatedly in practice). Different model AND
// provider for resilience. Override via LLM_MODEL_FALLBACK; set to "" to disable.
const DEFAULT_FALLBACK_MODEL = "meta-llama/Llama-3.3-70B-Instruct:groq";

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
      "horizon_description": "12 months" | "by Q3 2026" | "near term",
      "horizon_days": 365 | 180 | 90 | 30 | 7 | 1,
      "confidence_description": "high conviction" | "speculative" | null,
      "confidence_score": 85 | 50 | null,
      "rationale_summary": "Strong iPhone cycle + services growth",
      "rationale_tags": ["earnings", "technical", "macro", "sector", "catalyst", "valuation", "momentum", "contrarian", "insider", "regulatory"],
      "analyst_firm": "Morgan Stanley" | null,
      "analyst_name": "Katy Huberty" | null,
      "rating_grade": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" | null,
      "rating_action": "initiate" | "upgrade" | "downgrade" | "maintain" | "reiterate" | null,
      "rating_date": "2026-07-28" | null
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
}

export interface ExtractionResult {
  validClaims: ExtractedClaim[];
  invalidClaims: Array<{ raw: Record<string, unknown>; reason: string }>;
  extractionConfidence: number;
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
const LLM_MAX_OUTPUT_TOKENS = 1024;

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
 */
async function callExtractionLLM(
  client: OpenAI,
  model: string,
  rawText: string,
): Promise<string | null> {
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

  try {
    const r = await client.chat.completions.create(
      { ...base, response_format: { type: "json_object" } },
      options,
    );
    return r.choices[0]?.message?.content ?? null;
  } catch (err) {
    // Some HuggingFace-routed models reject response_format. Fall back to a
    // plain call ONLY for a parameter-support error — rethrow genuine
    // timeouts/network failures so the worker retries the whole step.
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const paramUnsupported =
      status === 400 || msg.includes("response_format") || msg.includes("json");
    if (!paramUnsupported) throw err;
    const r = await client.chat.completions.create(base, options);
    return r.choices[0]?.message?.content ?? null;
  }
}

export async function extractClaims(
  rawText: string,
): Promise<ExtractionResult> {
  const client = getLLMClient();

  // Skip the LLM call entirely when no Mag-7 instrument is referenced — most
  // scraped text is off-topic, so this removes the bulk of LLM volume.
  if (!mentionsMag7(rawText)) {
    return { validClaims: [], invalidClaims: [], extractionConfidence: 0 };
  }

  // Try the primary model, then the fallback if it errors (e.g. a provider
  // deprecated/dropped the model). Distinct model+provider for resilience.
  const fallback = process.env.LLM_MODEL_FALLBACK ?? DEFAULT_FALLBACK_MODEL;
  const models = [
    process.env.LLM_MODEL ?? DEFAULT_MODEL,
    fallback,
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let content: string | null = null;
  let lastError: unknown;
  for (const model of models) {
    try {
      content = await callExtractionLLM(client, model, rawText);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[extractor] Model ${model} failed, trying next:`, err instanceof Error ? err.message : err);
    }
  }
  if (lastError) throw lastError; // all models failed — let the worker retry
  if (!content) {
    return { validClaims: [], invalidClaims: [], extractionConfidence: 0 };
  }

  // Parse JSON — handle potential markdown wrapping
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripJsonFences(content));
  } catch {
    console.error("Failed to parse LLM response:", content);
    return { validClaims: [], invalidClaims: [], extractionConfidence: 0 };
  }

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
      // Clamp confidence into the 0-100 scale used by the confidence column
      // and the consensus weight boost.
      confidenceScore:
        typeof raw.confidence_score === "number" &&
        Number.isFinite(raw.confidence_score)
          ? Math.max(0, Math.min(100, raw.confidence_score))
          : null,
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
    });
  }

  return { validClaims, invalidClaims, extractionConfidence };
}

/**
 * Process an extraction: extract claims from event text and insert into DB.
 * Routes to active/pending_review based on extraction confidence.
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
    return { inserted: 0, pending: 0, invalid: 0, duplicates: 0 };
  }

  const result = await extractClaims(rawText);

  let inserted = 0;
  let pending = 0;
  let duplicates = 0;

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
    // instead of being credited to the publication that carried it.
    const needsAttribution =
      options.sourceKind === "wall_street_rating" && !attributed;
    const status =
      result.extractionConfidence >= 0.8 && !needsAttribution
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

    if (duplicate) {
      duplicates++;
      continue;
    }

    await db.insert(claims).values({
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
      // Explicit historical timestamp (insert-only; no UPDATE).
      ...(claimCreatedAt ? { createdAt: claimCreatedAt } : {}),
    });

    if (status === "active") inserted++;
    else pending++;
  }

  return {
    inserted,
    pending,
    invalid: result.invalidClaims.length,
    duplicates,
  };
}

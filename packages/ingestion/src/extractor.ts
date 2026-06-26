import OpenAI from "openai";
import { db, eq } from "@deepmint/db";
import { instruments, claims } from "@deepmint/db/schema";
import { MAG7_TICKERS, VALID_HORIZONS, getCurrentPrice } from "@deepmint/shared";

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

// Fallback model when LLM_MODEL is unset. Must be a real HuggingFace
// router-available id that supports response_format json_object.
const DEFAULT_MODEL = "Qwen/Qwen3-235B-A22B";

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

const EXTRACTION_PROMPT = `You are a financial claim extractor. Given raw text from an analyst or trader, extract structured predictions.

For each prediction found, return JSON:
{
  "claims": [
    {
      "instrument_ticker": "AAPL",
      "direction": "long" | "short" | "neutral",
      "target_price": 250.00 | null,
      "horizon_description": "12 months" | "by Q3 2026" | "near term",
      "horizon_days": 365 | 180 | 90 | 30,
      "confidence_description": "high conviction" | "speculative" | null,
      "confidence_score": 85 | 50 | null,
      "rationale_summary": "Strong iPhone cycle + services growth",
      "rationale_tags": ["earnings", "technical", "macro", "sector", "catalyst", "valuation", "momentum", "contrarian", "insider", "regulatory"]
    }
  ],
  "extraction_confidence": 0.95
}

Rules:
- Only extract EXPLICIT predictions with a directional view
- Do NOT infer predictions that aren't clearly stated
- If horizon is vague, use the most conservative interpretation
- Set extraction_confidence to reflect your certainty about the extraction quality
- Return empty claims array if no predictions found
- IMPORTANT: Return ONLY valid JSON, no markdown formatting or code blocks`;

export interface ExtractedClaim {
  instrumentTicker: string;
  direction: "long" | "short" | "neutral";
  targetPrice: number | null;
  horizonDays: number;
  confidenceScore: number | null;
  rationaleSummary: string;
  rationaleTags: string[];
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
  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL;

  // Skip the LLM call entirely when no Mag-7 instrument is referenced — most
  // scraped text is off-topic, so this removes the bulk of LLM volume.
  if (!mentionsMag7(rawText)) {
    return { validClaims: [], invalidClaims: [], extractionConfidence: 0 };
  }

  const content = await callExtractionLLM(client, model, rawText);
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
    });
  }

  return { validClaims, invalidClaims, extractionConfidence };
}

/**
 * Process an extraction: extract claims from event text and insert into DB.
 * Routes to active/pending_review based on extraction confidence.
 */
export async function processExtraction(
  eventId: string,
  rawText: string,
  entityId: string,
): Promise<{ inserted: number; pending: number; invalid: number }> {
  // Idempotency: claims are APPEND-ONLY, so a worker retry that re-runs this
  // event would permanently duplicate them. Skip if this event already has
  // claims (and avoid a redundant LLM call).
  const [existingClaim] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(eq(claims.eventId, eventId))
    .limit(1);
  if (existingClaim) {
    return { inserted: 0, pending: 0, invalid: 0 };
  }

  const result = await extractClaims(rawText);

  let inserted = 0;
  let pending = 0;

  for (const claim of result.validClaims) {
    // Look up instrument by ticker
    const [instrument] = await db
      .select()
      .from(instruments)
      .where(eq(instruments.ticker, claim.instrumentTicker))
      .limit(1);

    if (!instrument) continue;

    // Get current price
    let entryPriceCents: number | null = null;
    try {
      entryPriceCents = await getCurrentPrice(claim.instrumentTicker);
    } catch {
      // Non-fatal — continue with null price
    }

    // Convert target price from dollars to cents. Explicit null check (not a
    // truthiness test) — targetPrice is already validated > 0 at extraction.
    const targetPriceCents =
      claim.targetPrice != null ? Math.round(claim.targetPrice * 100) : null;

    // Route by extraction confidence
    const status =
      result.extractionConfidence >= 0.8 ? "active" : "pending_review";

    await db.insert(claims).values({
      eventId,
      entityId,
      instrumentId: instrument.id,
      direction: claim.direction,
      targetPriceCents,
      horizonDays: claim.horizonDays,
      confidence: claim.confidenceScore ?? null,
      rationale: claim.rationaleSummary || null,
      rationaleTags: claim.rationaleTags,
      entryPriceCents,
      status,
    });

    if (status === "active") inserted++;
    else pending++;
  }

  return {
    inserted,
    pending,
    invalid: result.invalidClaims.length,
  };
}

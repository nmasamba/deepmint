/**
 * Benchmark the multi-claim extraction on one model.
 *
 * Usage: tsx scripts/bench-providers.ts [model]
 *
 * `model` is a full Hugging Face router id, with an optional provider or policy
 * suffix (e.g. "openai/gpt-oss-120b:fastest", "openai/gpt-oss-120b:cerebras").
 * The default is LLM_MODEL, else the extractor's DEFAULT_MODEL.
 *
 * Runs the exact production extractClaims() path (JSON mode, max_tokens,
 * timeout) on a 2-claim prompt twice, with the fallback model off so that only
 * `model` can answer, and prints one JSON line:
 * { provider, model, runs, minMs, ok, claims }.
 */
import { readFileSync } from "node:fs";

// Load this checkout's root .env.local, wherever the script is run from.
try {
  const txt = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // env may already be present
}

const { DEFAULT_MODEL, extractClaims } = await import("../src/extractor");

const model = process.argv[2] || process.env.LLM_MODEL || DEFAULT_MODEL;
const provider = model.includes(":") ? model.split(":").pop()! : "default";
process.env.LLM_MODEL = model;
// Empty turns the fallback off; unset would let it answer for a dead model.
process.env.LLM_MODEL_FALLBACK = "";

const TEXT = `Market outlook for Q2 2026:
- NVDA: Strongly bullish, AI demand continuing to surge. Target $1100 in 90 days.
- META: Slightly bearish, ad revenue slowing. Short-term target $480 over 30 days.`;

async function once(): Promise<{ ms: number; claims: number; ok: boolean; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await extractClaims(TEXT);
    return { ms: Date.now() - t0, claims: res.validClaims.length, ok: true };
  } catch (e) {
    return {
      ms: Date.now() - t0,
      claims: 0,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const runs: Array<{ ms: number; claims: number; ok: boolean; error?: string }> = [];
for (let i = 0; i < 2; i++) runs.push(await once());
const okRuns = runs.filter((r) => r.ok);
const minMs = okRuns.length ? Math.min(...okRuns.map((r) => r.ms)) : null;

console.log(
  JSON.stringify({
    provider,
    model,
    ok: okRuns.length > 0,
    minMs,
    claims: okRuns.at(-1)?.claims ?? 0,
    runs,
  }),
);

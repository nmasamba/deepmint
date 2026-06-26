/**
 * Benchmark the multi-claim extraction across HuggingFace inference providers.
 *
 * Usage: tsx scripts/bench-providers.ts <provider>   (e.g. cerebras, nebius, default)
 *
 * Routes the base LLM_MODEL to the given provider via the HF router's
 * `model:provider` syntax, runs the exact production extractClaims() path
 * (JSON mode, max_tokens, timeout) on a 2-claim prompt twice, and prints one
 * JSON line: { provider, model, runs, minMs, ok, claims }.
 */
import { readFileSync } from "node:fs";

// Load root .env.local (absolute path — script may run from any cwd).
try {
  const txt = readFileSync("/Users/nm/Projects/Deepmint/.env.local", "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // env may already be present
}

// Arg is the FULL model id, optionally with a `:provider` suffix
// (e.g. "Qwen/Qwen3-235B-A22B-Instruct-2507:cerebras").
const model = process.argv[2] ?? process.env.LLM_MODEL ?? "Qwen/Qwen3-235B-A22B";
const provider = model.includes(":") ? model.split(":").pop()! : "default";
process.env.LLM_MODEL = model;

const TEXT = `Market outlook for Q2 2026:
- NVDA: Strongly bullish, AI demand continuing to surge. Target $1100 in 90 days.
- META: Slightly bearish, ad revenue slowing. Short-term target $480 over 30 days.`;

const { extractClaims } = await import("../src/extractor.ts");

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

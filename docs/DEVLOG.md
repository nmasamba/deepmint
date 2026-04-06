# Devlog

Ongoing development notes, decisions, and status updates for Deepmint.

---

## 2026-04-04 — Sprint 3 Complete

### Status
- **Sprint 1**: Complete
- **Sprint 2**: Complete
- **Sprint 3**: Complete
- **Sprint 4**: Not started

### What was built
Sprint 3 (Scoring Engine) delivers the full scoring pipeline: market data integration, markout computation, entity scoring, leaderboards, consensus signals, and regime-aware EIV. All scoring formulas implemented as pure functions with comprehensive tests.

Prompts completed: 3.1 (Market Data), 3.2 (Markout Worker), 3.3 (Scoring Functions + Worker), 3.4 (Leaderboard), 3.5 (Leaderboard UI), 3.6 (Profile Tabs), 3.7 (Consensus Signals), 3.8 (Continuous Brier), 3.9 (Regime-Aware EIV).

### Key decisions
- **Massive.com SDK** — Polygon.io rebranded to Massive.com in Oct 2025. Using `@massive.com/client-js` v10.5.0. API endpoints at `api.massive.com` (old `api.polygon.io` still works). Env var stays `POLYGON_API_KEY`.
- **Rate limiting** — Simple delay queue (12.5s between requests) for Massive starter plan (5 req/min).
- **Regime detection simplified** — Using placeholder VIX/S&P values until live macro data integration. Regime detection is functional with real inputs.
- **Score upsert strategy** — Delete old + insert new for entity+date combination (not true upsert, simpler and avoids complex unique constraints).
- **vitest env loading** — Added `vitest.config.ts` to all test packages to load `.env.local` from monorepo root. Previously, live API tests (LLM extraction) were silently skipped because env vars weren't available.

### Test results
```
pnpm check  — 8/8 packages, 0 errors
pnpm build  — clean (web + worker, 7 functions registered)
pnpm test   — 105 passed (71 scoring + 16 shared + 18 ingestion)
  - 71 scoring tests (player, guide, anti-gaming, consensus, regime, EIV)
  - 6 live LLM extraction tests against HuggingFace Inference
  - 11 Merkle tree tests
  - 6 content hasher tests
  - 6 demo source adapter tests
  - 5 Polygon price fallback tests
```

### Env vars required for Sprint 3
| Variable | Status | Notes |
|----------|--------|-------|
| `POLYGON_API_KEY` | Set | Massive.com (formerly Polygon.io) — added 2026-04-04 |
| `UPSTASH_REDIS_REST_URL` | Not set | Optional — cache bypassed gracefully |
| `UPSTASH_REDIS_REST_TOKEN` | Not set | Optional |

### Schema changes
- Added `brier_slices` JSONB column to `outcomes` table via Drizzle migration (`0001_supreme_eternity.sql`)

### What's next
Sprint 4: Notifications + Error Tracking — Resend email, Sentry integration, and polish.

---

## 2026-04-03 — Post-Sprint 2: Env Var Remediation + Clerk Webhooks

### What was done
- Audited all env vars in `.env.local` — identified 13 empty keys, triaged by priority
- Installed **ngrok** via Homebrew for local webhook tunnelling
- Started ngrok tunnel: `https://uncourteously-augmentable-hyman.ngrok-free.dev` → `localhost:3000`
- Configured **Clerk webhook** endpoint at `/api/webhooks/clerk` with signing secret
- Set `CLERK_WEBHOOK_SECRET` in `.env.local` — entity auto-creation on sign-up now works
- Verified tunnel end-to-end: ngrok → Next.js dev server → webhook route returns correctly

### Dev environment setup note
ngrok free-tier URLs are ephemeral — they change on restart. After restarting ngrok:
1. Run `ngrok http 3000`
2. Copy the new `https://...ngrok-free.dev` URL
3. Update the webhook endpoint URL in Clerk Dashboard → Webhooks

### Created documentation
- `docs/CHANGELOG.md` — structured changelog (Keep a Changelog format)
- `docs/DEVLOG.md` — development log with status, decisions, env var tracking, issue log

---

## 2026-04-02 — Sprint 2 Complete

### Status
- **Sprint 1**: Complete
- **Sprint 2**: Complete
- **Sprint 3**: Not started
- **Sprint 4**: Not started

### What was built
Sprint 2 (Claims Ledger + Ingestion Pipeline) delivers the core product loop: users can submit immutable predictions, view them on timelines, and an ingestion pipeline captures external analyst content for LLM-powered extraction.

Prompts completed: 2.1 (Claims Router), 2.2 (Submission UI), 2.3 (Timeline), 2.4 (Hashing + Snapshots), 2.5 (LLM Extraction), 2.6 (Ingestion Worker), 2.7 (Merkle Audit).

### Key decisions
- **HuggingFace Inference over Anthropic Claude** — LLM extraction uses open models (Qwen/Qwen3-235B-A22B) through HuggingFace's OpenAI-compatible router. Model is configurable via `LLM_MODEL` env var.
- **Rate limiting graceful degradation** — When `UPSTASH_REDIS_REST_URL` is not set, claim submission skips rate limiting instead of crashing. Allows local dev without Upstash.
- **Drizzle operator re-exports** — Added `eq`, `desc`, `and`, etc. re-exports from `@deepmint/db` to avoid duplicate `drizzle-orm` instance issues in the pnpm workspace. All packages should import operators from `@deepmint/db`, not directly from `drizzle-orm`.
- **Inngest v4 API** — Worker functions use the 2-argument `createFunction` pattern with triggers in the options object (not the v3 3-argument pattern).

### Test results
```
pnpm check  — 8/8 packages, 0 errors
pnpm build  — clean (web + worker)
pnpm test   — 34 passed (16 shared + 18 ingestion)
  - 5 live LLM extraction tests against HuggingFace Inference
  - 11 Merkle tree tests
  - 6 content hasher tests
  - 6 demo source adapter tests
  - 5 Polygon price fallback tests
  - 1 missing API key error test
```

### Bugs fixed
1. `drizzle-orm` duplicate instances — 7 files consolidated to import from `@deepmint/db`
2. Inngest v4 API mismatch — 3 worker functions rewritten
3. Inngest Date serialization — `step.run()` deserializes Dates as strings
4. Worker tsconfig — rootDir and declaration emit issues
5. R2 env var naming — code vs .env.local mismatch
6. SubmitClaimForm tag types — `string[]` → `RationaleTag[]`

### Env vars required for Sprint 2
| Variable | Status | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Set | Local Docker Postgres |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Set | Clerk dashboard |
| `CLERK_SECRET_KEY` | Set | Clerk dashboard |
| `CLERK_WEBHOOK_SECRET` | Set | Configured 2026-04-03 via ngrok + Clerk Dashboard |
| `HF_API_KEY` | Set | HuggingFace token with Inference API |
| `LLM_MODEL` | Set | Defaults to `Qwen/Qwen3-235B-A22B` |
| `UPSTASH_REDIS_REST_URL` | Not set | Optional — rate limiting degrades gracefully |
| `UPSTASH_REDIS_REST_TOKEN` | Not set | Optional |
| `POLYGON_API_KEY` | Not set | Dev fallback prices used |
| `CLOUDFLARE_R2_*` | Not set | Snapshot storage not needed for core flow |

### Open issues

| # | Issue | Priority | Notes |
|---|-------|----------|-------|
| 1 | ~~`CLERK_WEBHOOK_SECRET` not configured~~ | ~~High~~ | **Resolved 2026-04-03.** Configured via ngrok tunnel + Clerk Dashboard webhook endpoint. |
| 2 | `UPSTASH_REDIS_REST_URL` not configured | **High** | Rate limiting on claim submission is disabled. Works in dev (graceful degradation) but must be set before production. Free tier at https://console.upstash.com. |
| 3 | `UPSTASH_REDIS_REST_TOKEN` not configured | **High** | Same as above — paired with REST_URL. |
| 4 | `POLYGON_API_KEY` not configured | Medium | Using hardcoded dev fallback prices for Mag 7. Needed for Sprint 3 (live markout scoring). Free tier at https://polygon.io. |
| 5 | `CLOUDFLARE_R2_ACCOUNT_ID` not configured | Medium | Snapshot storage for ingestion pipeline. Not blocking core claim flow. |
| 6 | `CLOUDFLARE_R2_ACCESS_KEY_ID` not configured | Medium | Same as above. |
| 7 | `CLOUDFLARE_R2_SECRET_ACCESS_KEY` not configured | Medium | Same as above. |
| 8 | `INNGEST_API_KEY` not configured | Low | Inngest dev server runs locally without a key. Needed for cloud deployment. |
| 9 | `RESEND_API_KEY` not configured | Low | Sprint 4 (email notifications). |
| 10 | `SNAPTRADE_CLIENT_ID` not configured | Low | Sprint 5+ (broker verification). |
| 11 | `SNAPTRADE_CONSUMER_KEY` not configured | Low | Sprint 5+. |
| 12 | `SENTRY_AUTH_TOKEN` not configured | Low | Sprint 4 (error tracking). |
| 13 | `NEXT_PUBLIC_SENTRY_DSN` not configured | Low | Sprint 4. |

### What's next
Sprint 3: Scoring Engine — markout calculations, accuracy scores, leaderboards, consensus signals, and Earned Influence Value (EIV).

**Before Sprint 3**: Issues #1–3 should ideally be resolved. Issue #4 (`POLYGON_API_KEY`) will be needed for live price scoring.

---

## 2026-03-28 — Sprint 1 Complete

### Status
- **Sprint 1**: Complete

### What was built
Monorepo foundation: Drizzle schema (15 tables), tRPC routers (entities, instruments), Clerk auth with webhook-based entity creation, Next.js frontend shell with sidebar/topbar/profiles, database seeding with Mag 7 instruments and demo entities.

### Env vars required for Sprint 1
| Variable | Status | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Set | Local Docker Postgres |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Set | |
| `CLERK_SECRET_KEY` | Set | |

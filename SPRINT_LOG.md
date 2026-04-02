# Deepmint Sprint Log

## Sprint 1 — Foundations ✅
**Status**: Complete
Monorepo setup, database schema, Clerk auth, entity CRUD, instrument seeds, entity profiles.

## Sprint 2 — Claims Ledger + Ingestion Pipeline ✅
**Status**: Complete
**Completed**: 2026-04-02

### What was built

#### Prompt 2.1 — Claims Router (`packages/api/routers/claims.ts`)
- 6 tRPC endpoints: `submit`, `list`, `detail`, `addNote`, `pendingReview`, `reviewClaim`
- Rate limiting: 10 claims/hour via Upstash Redis
- Cursor-based pagination on list queries
- Entry price fetched from Polygon.io (with dev fallback prices)
- Status transitions: `pending_review → active | rejected` (only allowed update)

#### Prompt 2.2 — Claim Submission UI (`apps/web/components/claims/`)
- `SubmitClaimForm.tsx` — Sheet modal with instrument search, direction, horizon, target price, confidence slider, rationale, tags
- `ClaimCard.tsx` — Renders individual claims with direction badges, horizon pills, entry price
- `ClaimsTimeline.tsx` — Infinite scroll timeline with IntersectionObserver

#### Prompt 2.3 — Claim Timeline on Entity + Ticker Pages
- Entity profile tabs updated with live ClaimsTimeline
- Ticker pages show instrument-filtered claims
- Dashboard has "Make a Prediction" CTA + recent claims feed
- My Claims page with entity-filtered view

#### Prompt 2.4 — Ingestion Pipeline (`packages/ingestion/`)
- `hasher.ts` — SHA-256 content hashing (sourceUrl + rawText + capturedAt)
- `r2.ts` — Cloudflare R2 client for snapshot storage
- `capture.ts` — Playwright headless capture with fetch fallback
- `sources/base.ts` — Abstract SourceAdapter interface
- `sources/demo.ts` — 5 hardcoded Mag 7 analyst reports

#### Prompt 2.5 — LLM Extraction (`packages/ingestion/src/extractor.ts`)
- HuggingFace Inference API (OpenAI SDK compatible)
- Default model: `Qwen/Qwen3-235B-A22B` (configurable via `LLM_MODEL` env var)
- Structured JSON extraction with Mag 7 ticker + direction + horizon validation
- Confidence-based routing: ≥0.8 → active, <0.8 → pending_review

#### Prompt 2.6 — Inngest Workers (`apps/worker/functions/`)
- `ingest.ts` — Weekday cron (20:30 UTC), fetches sources, deduplicates by content hash
- `extract.ts` — Event-driven, processes new events through LLM extraction
- `audit.ts` — Daily cron (22:00 UTC), computes Merkle root of day's claims

#### Prompt 2.7 — Merkle Audit (`packages/shared/src/merkle.ts`)
- `computeClaimLeafHash()` — Deterministic SHA-256 claim hashing
- `buildMerkleTree()` — Recursive pair-hashing with odd-leaf duplication
- Audit roots stored in `audit_roots` table

#### Admin Review Page (`apps/web/app/(app)/admin/review/page.tsx`)
- Lists pending_review claims with Approve/Reject buttons

### Key Architecture Decisions
- **HuggingFace Inference** (not Anthropic Claude) for LLM extraction — OpenAI API compatible, supports Qwen/Kimi/GLM models
- **drizzle-orm operators** re-exported from `@deepmint/db` to avoid duplicate instance issues across the monorepo
- **Playwright excluded** from web bundle via separate barrel export (capture.ts not in ingestion index)
- **Inngest v4 API** — triggers in options object, not as separate 3rd argument

### Test Results
- `@deepmint/shared`: 16 tests passed (merkle tree, polygon prices)
- `@deepmint/ingestion`: 13 passed, 5 skipped (hasher, demo source, LLM extractor — LLM tests need HF_API_KEY)
- `@deepmint/scoring`: 0 tests (pass with no tests)
- TypeScript: All 8 packages pass `tsc --noEmit`
- Build: Production build succeeds for web + worker

### Environment Variables Added
- `HF_API_KEY` — HuggingFace Inference API key
- `LLM_MODEL` — LLM model override (default: `Qwen/Qwen3-235B-A22B`)

# Changelog

All notable changes to the Deepmint project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased] — Sprint 2 Fixes + Env Remediation (2026-04-03)

### Known Issues
- ~~`CLERK_WEBHOOK_SECRET` not configured~~ — **Resolved 2026-04-03** via ngrok tunnel + Clerk Dashboard
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` not configured — rate limiting on claim submission is bypassed (graceful degradation)
- `POLYGON_API_KEY` not configured — using hardcoded dev fallback prices; needed for Sprint 3 live scoring

### Added
- Installed **ngrok** for local Clerk webhook tunnelling
- Configured Clerk webhook endpoint (`/api/webhooks/clerk`) with signing secret — entity auto-creation on sign-up now functional
- Created `docs/CHANGELOG.md` and `docs/DEVLOG.md` for ongoing project documentation and issue tracking
- `@deepmint/db` now re-exports drizzle-orm operators (`eq`, `desc`, `and`, `or`, etc.) for consistent single-instance usage
- Rate limiter gracefully degrades when `UPSTASH_REDIS_REST_URL` is not configured (logs warning, skips limiting)

### Fixed
- Consolidated `drizzle-orm` imports through `@deepmint/db` re-exports to eliminate duplicate instance TypeScript errors across 7 files
- Inngest v4 API: rewrote all 3 worker functions from 3-arg (v3) to 2-arg (v4) with triggers in options object
- Inngest JSON serialization: convert `capturedAt` back to `Date` after `step.run()` deserialization in `ingest.ts`
- Worker `tsconfig.json`: fixed `rootDir` to include `functions/` and `inngest.ts`, disabled declaration emit
- R2 env var naming mismatch: `r2.ts` now reads `CLOUDFLARE_R2_*` to match `.env.local` and `.env.example`
- `SubmitClaimForm.tsx`: typed `selectedTags` state as `RationaleTag[]` instead of `string[]`

---

## [0.2.0] — Sprint 2: Claims Ledger + Ingestion Pipeline (2026-04-02)

### Added
- **Claims Router** (`packages/api/routers/claims.ts`) — 6 tRPC endpoints: `submit`, `list`, `detail`, `addNote`, `pendingReview`, `reviewClaim`
- **Claim Submission UI** (`SubmitClaimForm.tsx`) — Sheet modal with instrument search, direction, horizon, target price, confidence slider, rationale, tags
- **Claims Timeline** (`ClaimsTimeline.tsx`) — Infinite scroll with `IntersectionObserver`, cursor-based pagination
- **Claim Card** (`ClaimCard.tsx`) — Direction badges, horizon pills, entry price, expandable rationale, outcomes, notes
- **LLM Extraction** (`packages/ingestion/src/extractor.ts`) — HuggingFace Inference API (OpenAI-compatible) with Qwen/Qwen3-235B-A22B, structured JSON extraction, Mag 7 ticker validation, confidence-based routing
- **Content Hashing** (`packages/ingestion/src/hasher.ts`) — SHA-256 content hash per architecture.md §4.1
- **Merkle Audit** (`packages/shared/src/merkle.ts`) — `computeClaimLeafHash()` + `buildMerkleTree()` for immutability proof
- **Snapshot Storage** (`packages/ingestion/src/r2.ts`) — Cloudflare R2 client (S3-compatible)
- **Web Capture** (`packages/ingestion/src/capture.ts`) — Playwright headless + fetch fallback
- **Source Adapters** — Abstract `SourceAdapter` base class + `DemoSourceAdapter` with 5 hardcoded analyst reports
- **Polygon Price Helper** (`packages/shared/src/polygon.ts`) — Polygon.io API with dev fallback prices for Mag 7
- **Inngest Workers** (`apps/worker/functions/`) — 3 functions: `ingest` (weekday cron), `extract` (event-driven), `audit` (daily cron)
- **Inngest API Route** (`apps/web/app/api/inngest/route.ts`) — Next.js serve endpoint
- **Admin Review Page** (`apps/web/app/(app)/admin/review/page.tsx`) — Pending claim review with approve/reject
- **Dashboard** — "Make a Prediction" CTA + recent claims feed
- **My Claims** — Entity-filtered claims timeline with new claim button
- **Ticker Page** — Instrument details + consensus + claims timeline
- **Entity Profile Tabs** — Claims tab wired with `ClaimsTimeline`
- **Topbar** — "New Claim" button for authenticated users
- **Toast notifications** via sonner with dark theme

### Dependencies
- `@upstash/ratelimit`, `@upstash/redis` (packages/api)
- `@aws-sdk/client-s3`, `openai` (packages/ingestion)
- `playwright` (packages/ingestion, dev)
- `inngest` (apps/worker, apps/web)
- `sonner` (apps/web)
- shadcn/ui: `slider`, `textarea`, `label`

### Tests (34 total)
- Merkle tree: 11 tests (determinism, 0/1/2/3/4 leaves, odd duplication)
- Polygon price: 5 tests (fallback prices, case-insensitive, unknown ticker)
- Content hasher: 6 tests (SHA-256, determinism, sensitivity to each field)
- Demo source adapter: 6 tests (field validation, Mag 7 coverage, uniqueness)
- LLM extractor: 6 tests (5 live HuggingFace calls + 1 missing key check)

---

## [0.1.0] — Sprint 1: Foundations (2026-03-28)

### Added
- Turborepo monorepo with pnpm workspaces
- Next.js 15 (App Router) + Tailwind CSS + shadcn/ui frontend shell
- tRPC v11 with Zod validation (public, protected, admin procedures)
- Drizzle ORM with PostgreSQL 16 — 15 tables including: entities, instruments, claims, events, outcomes, notes, audit_roots, consensus_signals
- Clerk authentication with SSO (Google, Facebook, X) + email fallback
- Entity CRUD: Guide and Player profile pages with tabs
- Instrument browser with search
- Sidebar navigation + Topbar with user controls
- Database seeding with Mag 7 instruments + demo entities
- Dark-mode-only design system with teal accent

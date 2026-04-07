# Changelog

All notable changes to the Deepmint project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [0.4.0] — Sprint 4: Social + Polish (2026-04-07)

### Added
- **Social Router** (`packages/api/routers/social.ts`) — 11 tRPC endpoints:
  - Follow/unfollow with self-follow prevention and duplicate guards
  - `isFollowing`, `followers`, `following` (cursor-paginated), `followerCount` (Redis-first, DB fallback)
  - Social feed: claims from followed entities with cursor pagination
  - Watchlist: `addToWatchlist`, `removeFromWatchlist`, `myWatchlist`, `isWatching`
  - Email preferences: `emailPreferences`, `updateEmailPreferences` (upsert)
- **FollowButton** — Client component with optimistic follow/unfollow + count invalidation
- **WatchButton** — Toggle watch state for instruments with Eye/EyeOff icons
- **SocialFeed** — Infinite scroll feed of claims from followed entities
- **WatchlistSidebar** — Dashboard sidebar widget showing watched instruments with links and remove buttons
- **Dashboard Grid Layout** — Two-column layout (main + sidebar) with Following/All Claims tabs
- **EntityProfileHeader** — Live follower counts via tRPC, functional Follow button integration

- **Ticker Router** (`packages/api/routers/ticker.ts`) — `overview` procedure: instrument + consensus + price + top 5 guides (by EIV) + top 5 players (by Sharpe) + claim stats
- **Ticker Page Redesign** — Full layout: header with live price, large consensus signal badge with conviction meter, consensus breakdown (Recharts donut chart + stats), top entities panels, recent claims, watch button
- **ConsensusBreakdown** — Recharts PieChart (donut) with weighted bullish/bearish/neutral percentages, raw counts, avg target vs current, dispersion
- **TopEntitiesPanel** — Ranked entity list with avatar, name, verified badge, metric value
- **Non-Mag-7 Guard** — Ticker pages for non-Mag-7 symbols show "Coming soon" state

- **Paper Router** (`packages/api/routers/paper.ts`) — 6 tRPC endpoints:
  - `createPortfolio` (max 5), `myPortfolios` with summary stats
  - `addTrade` with cash balance validation, `closeTrade` at current market price
  - `portfolioDetail` with all trades + available cash, `portfolioPerformance` with equity/P&L/return bps
- **Paper Portfolio Page** — Split layout: portfolio list (create/select) + detail view
  - Positions table (open/closed), P&L tracking, equity curve (Recharts LineChart)
  - NewTradeForm dialog with instrument search, side toggle, quantity input

- **Email Digest Worker** (`apps/worker/functions/digest.ts`) — Inngest cron (noon UTC weekdays): gathers new claims + outcomes from followed entities, sends via Resend
- **Email Preferences Schema** (`packages/db/schema/emailPreferences.ts`) — `digestEnabled`, `digestFrequency` per entity
- **Settings Page** — Email notification toggle (daily/weekly digest) with frequency selector

- **Education Track** (`apps/web/app/(app)/learn/`) — 5 static learning modules:
  1. "What Makes a Good Trade?" — risk/reward, position sizing, Kelly criterion
  2. "Reading a Track Record" — Sharpe, Calmar, max drawdown, win rate
  3. "Why Predictions Need Horizons" — timeframe accuracy, horizon skills
  4. "The Confidence Calibration Trap" — Brier scores, overconfidence
  5. "Paper Trading Your First Portfolio" — step-by-step guide
- **ModuleCard** — Progress bar, difficulty badge, estimated time
- **ModuleContent** — Section navigation, inline content rendering, quiz system
- **useLearnProgress** hook — localStorage-based progress tracking

- **Landing Page** — Hero ("Follow people who are provably good"), How It Works (3-step), Social Proof (live DB counters), Footer
- **Entity Stats** — `entity.stats` public procedure for live claim/outcome/entity counts
- **Error Pages** — `not-found.tsx` (404), `error.tsx` (error boundary), `global-error.tsx` (root error)
- **OpenGraph / Twitter Card Metadata** — Enhanced root layout metadata with OG tags

- **CI Pipeline** (`.github/workflows/ci.yml`) — Type check, test, build on push/PR
- **Vercel Config** (`vercel.json`) — Next.js deployment settings
- **Sentry Integration** — Client, server, and edge config files for error tracking

### Dependencies
- `recharts` (apps/web) — Charts for consensus breakdown and equity curves
- `resend` (apps/worker) — Email delivery for digest worker
- `@sentry/nextjs` (apps/web) — Error tracking and monitoring

### Database Migrations
- Migration 0002: `email_preferences` table (entityId unique, digestEnabled, digestFrequency)

---

## [0.3.0] — Sprint 3: Scoring Engine (2026-04-04)

### Added
- **Market Data Client** (`packages/shared/src/polygon.ts`) — Full Massive.com (formerly Polygon.io) integration: `getEODPrice()`, `getHistoricalPrices()`, `getCurrentPrice()`, `getBatchEODPrices()` with `@massive.com/client-js` SDK
- **Polygon Cache** (`packages/shared/src/polygonCache.ts`) — Redis cache layer (Upstash) with 1hr historical / 5min current TTLs, graceful bypass when unconfigured
- **Markout Worker** (`apps/worker/functions/markout.ts`) — Inngest cron (17:00 ET weekdays): resolves expired claims with entry/exit prices, return bps, direction correctness, target hit detection
- **Scoring Package** (`packages/scoring/src/`) — 7 pure-function modules:
  - `player.ts` — Sharpe ratio, Calmar ratio, CVaR5, max drawdown, consistency score, MAE/MFE
  - `guide.ts` — Hit rate, avg return bps, z-test significance, Brier score, target precision, continuous Brier, time-decayed Brier
  - `anti-gaming.ts` — Minimum thresholds (30 trades, 90 days), kurtosis/turnover/leverage penalties
  - `consensus.ts` — Weighted consensus signal (Guide ×1.2, broker-verified ×1.5, recency decay, confidence boost)
  - `regime.ts` — Market regime detection (bull/bear/high_vol/low_vol/rotation) from VIX, S&P return, sector dispersion
  - `eiv.ts` — Regime-Aware Expected Information Value with Bayesian shrinkage
  - `utils.ts` — avg, stddev, normalCDF
- **Scoring Worker** (`apps/worker/functions/score.ts`) — Triggered by `markouts/completed`; computes all entity scores and upserts to DB
- **Consensus Signal Worker** (`apps/worker/functions/consensus-signal.ts`) — Computes weighted signals per Mag 7 instrument
- **Leaderboard Refresh Worker** (`apps/worker/functions/leaderboard-refresh.ts`) — Triggered by `scoring/completed`
- **Leaderboard Router** (`packages/api/routers/leaderboard.ts`) — `top` and `byTicker` endpoints
- **Consensus Router** (`packages/api/routers/consensus.ts`) — `byInstrument`, `mag7`, `history` endpoints
- **Scores Router** (`packages/api/routers/scores.ts`) — `byEntity`, `history` endpoints
- **Leaderboard Page** (`apps/web/app/(app)/leaderboard/page.tsx`) — Full UI with entity type tabs, metric filters, ranked table
- **Entity Profile Tabs** — Overview tab with EIV card + score cards, Stats tab with full metrics table
- **ConsensusSignalBadge** — BULLISH/BEARISH/NEUTRAL badge with conviction meter
- **Mag7Grid** — Dashboard widget showing consensus signals for all 7 instruments
- **brierSlices** JSONB column on outcomes table (Drizzle migration)
- **vitest env loading** — All test packages now load `.env.local` for live API testing

### Dependencies
- `@massive.com/client-js` (packages/shared) — Massive.com REST API client (formerly @polygon.io/client-js)

### Tests (105 total)
- Player scoring: 19 tests (Sharpe, Calmar, CVaR5, drawdown, consistency, MAE/MFE)
- Guide scoring: 25 tests (hit rate, avg return, z-test, Brier, target precision, continuous Brier, slice outcomes)
- Anti-gaming: 7 tests (eligibility, kurtosis, turnover, leverage)
- Consensus: 5 tests (direction, weighting, decay)
- Regime + EIV: 15 tests (detection thresholds, EIV computation, shrinkage, formatting)
- Merkle tree: 11 tests
- Polygon price: 5 tests
- Content hasher: 6 tests
- Demo source adapter: 6 tests
- LLM extractor: 6 tests (5 live HuggingFace + 1 key check)

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

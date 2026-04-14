# Changelog

All notable changes to the Deepmint project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [0.7.0] — Sprint 7: Hardening + Mobile PWA (2026-04-14)

### Added
- **generateKey() unit tests** — extracted `generateKey()` from `apiKeys` router into `packages/api/lib/generateKey.ts` with 5 unit tests (format, hash stability, prefix extraction, determinism, uniqueness). New vitest config for the `@deepmint/api` package.
- **Live regime data from Polygon.io** — replaced hardcoded placeholder values (VIX=18, S&P=1%, dispersion=8%) with live market data. New functions in `packages/shared/src/polygon.ts`: `getIndexSnapshot()`, `getIndexClose()`, `getSectorETFReturns30d()`, `getRegimeIndicators()`. Results cached in Redis (1hr TTL). Graceful fallback to dev defaults when `POLYGON_API_KEY` is unset or API errors occur.
- **Notification triggers** — "outcome matured" notifications fire when the markout worker resolves claims (includes return %, direction correctness, ticker). "rank change" notifications fire when an entity's EIV leaderboard rank shifts by 3+ positions between scoring runs. Both respect `notificationPreferences`.
- **B2B REST API integration tests** — 15 tests across 3 test files covering entity scores, instrument consensus, and leaderboard endpoints (happy path, 401, 404, 400, rate limit headers). Tests require `TEST_API_KEY` env var and a running dev server; gracefully skip when unavailable. New vitest config for `apps/web`.
- **API documentation page** — Swagger UI at `/docs/api` rendering the existing OpenAPI 3.1 spec via `swagger-ui-react` (dynamically imported, SSR disabled). Dark theme CSS overrides scoped to `.swagger-wrapper`. New "API Docs" nav item in sidebar.
- **Mobile navigation overhaul** — hamburger menu button in Topbar (visible on mobile) opens a full-nav Sheet (shadcn/ui) with all 9 nav items + admin links. Bottom nav reduced from 5 to 4 items (Dashboard, Leaderboard, Explore, My Claims) for breathing room.
- **Responsive audit** — dashboard sidebar content (watchlist, trending influencers) now visible on mobile via `order-first`. Leaderboard metric/regime filter buttons wrapped in horizontally scrollable containers with `overflow-x-auto`.
- **PWA manifest + service worker** — `manifest.json` with standalone display, dark theme color, 192px/512px icons. `@serwist/next` integration for service worker (disabled in development). Offline fallback page at `/offline`. Apple Web App meta tags added to root layout.

### Changed
- Scoring worker and regime router now fetch live VIX, S&P 500, and sector ETF data instead of using hardcoded placeholders.
- `Topbar` now accepts `isAdmin` prop from the server layout for mobile nav admin section visibility.

---

## [0.6.0] — Sprint 6: B2B API, Proof-of-Skin, Instrument Expansion (2026-04-09)

### Changed
- **LLM extraction model** switched from `Qwen/Qwen3-235B-A22B` to `google/gemma-4-31B-it:fastest` (HuggingFace router). The `:fastest` suffix routes to the lowest-latency provider currently serving the model. Observed extraction time dropped to 7–26s per call (previously 18–60s+ with intermittent cold-start timeouts). `LLM_MODEL` env var still overrides the default.
- **Extractor test timeouts** raised from 60s/120s to 180s per test to give cold-start calls sufficient headroom on any upstream provider.

### Security
- **Admin role moved from `publicMetadata` to `privateMetadata`** — the admin role flag was previously readable from any client-side `useUser()` call, exposing admin identity in JS bundles. Now stored in Clerk `privateMetadata.role` (server-only). Admin checks in `apps/web/app/(app)/layout.tsx` and `apps/web/app/api/trpc/[trpc]/route.ts` use a two-tier lookup: first try the `sessionClaims.metadata` fast path (requires Clerk session token customization exposing `{{user.private_metadata}}` as `metadata`); fall back to `clerkClient().users.getUser(userId).privateMetadata.role` via the backend API if the claim is absent. `Sidebar` no longer calls `useUser()` — it accepts `isAdmin: boolean` as a server-resolved prop, so the `"admin"` string never lands in the client bundle.

### Fixed
- **B2B API was unreachable** — Clerk middleware was protecting `/api/v1/*` with session auth, blocking all Bearer-token requests. Added `/api/v1(.*)` to the `isPublicRoute` matcher in `apps/web/middleware.ts` so these routes are authenticated via the Bearer API key pipeline instead of Clerk.
- **Consensus endpoint leaked internal UUID** — `GET /api/v1/instruments/{ticker}/consensus` was returning `instrument.id` because the handler spread the full DB row into the response. Now constructs an explicit `publicInstrument` projection (ticker/name/exchange/assetClass/sector only) matching the OpenAPI schema.
- **Clerk sign-in/sign-up icon inversion broke Google logo** — the `socialButtonsProviderIcon` filter (`brightness(0) invert(1)`) was intended to whiten Apple's black logo but was applied to every provider, turning Google's multicolor G into a white-on-white blank box. Scoped the filter to `socialButtonsProviderIcon__apple` only in both auth pages.
- **Clerk "Last used" pill was dark-on-dark** — Clerk's default badge text color is unreadable on the dark theme. Added a scoped global CSS override in `apps/web/app/globals.css` matching `.cl-rootBox [class*="cl-badge"]` / `[class*="cl-internal"][class*="badge" i]` to force `color: var(--color-text-primary)` with `!important`. (The `badge` element key in Clerk's appearance API didn't match this element, so targeting by class attribute was the reliable path.)


### Added
- **Expand Beyond Mag 7** — admin-driven instrument universe expansion
  - New `ticker_requests` table (pending/approved/rejected) for user-submitted tickers
  - Seed file `packages/db/seed/sp500-top50.ts` with ~50 S&P 500 tickers beyond Mag 7 (JPM, V, MA, LLY, UNH, AVGO, ORCL, XOM, and others with sector/industry metadata)
  - `instruments` router extended with admin procedures: `adminList`, `adminCreate`, `adminBatchCreate` (idempotent, emits `instruments/batch-added` event), `adminToggleActive`, `requestTicker` (user-facing, rate limited), `listRequests`, `reviewRequest`
  - Real admin check in `adminProcedure` via Clerk `privateMetadata.role === "admin"` (replaces prior placeholder; see Security section below for the move from `publicMetadata`)
  - `backfill-prices` Inngest worker: on `instruments/batch-added`, validates Polygon.io historical coverage by fetching 365 days of daily bars; deactivates instruments with no data
  - Admin page `/admin/instruments` with Instruments and User Requests tabs, active toggle, "Seed S&P 500 Top 50" button, approve/reject workflow
  - Sidebar admin section (Shield/Database/KeyRound) conditionally rendered for admins
- **Proof-of-Skin (SnapTrade broker verification)** — read-only broker linking
  - `entities.snaptradeUserId` column; SnapTrade credentials stored in `brokerLinks.metadata` jsonb
  - `snaptrade-typescript-sdk` added to `@deepmint/api`
  - `packages/api/lib/snaptrade.ts` — SDK wrapper exposing only read-only methods: `getSnapTradeClient`, `registerUser`, `getLoginLink`, `listAccounts`, `getAccountActivities` (BUY/SELL filter), `deleteUser`. Returns null when credentials are unconfigured for graceful degradation.
  - `broker` tRPC router with 5 procedures: `initLink`, `completeLink`, `status`, `disconnect` (preserves trade history, revokes SnapTrade user), `syncTrades` (rate limited 1/hour, inserts verified `playerTrades`)
  - `broker-sync` Inngest daily cron (22:00 UTC weekdays) — syncs all active links since `lastSyncAt`, inserts trades with `isVerified=true`, backoff between calls
  - `BrokerVerification` client component with states: unlinked / pending / verified / error; handles `snaptrade_success=true` OAuth return on settings page
  - `leaderboard` router returns `entity.brokerLinkStatus`; leaderboard UI shows `ShieldCheck` icon next to verified Players
  - Existing consensus weighting (`1.5x` for verified Players) automatically applies once an entity's status flips to `verified`
- **B2B Scoring REST API** at `/api/v1/`
  - `api_keys` table with SHA-256 `keyHash`, `keyPrefix`, `scopes` jsonb, `rateLimit`, `lastUsedAt`, `expiresAt`, `revokedAt`
  - `apiKeys` tRPC router (admin-only): `create` (returns plaintext ONCE), `list`, `revoke`
  - `/api/v1/lib/auth.ts` — Bearer extraction, SHA-256 lookup, active/expiry/scope validation, Upstash sliding-window rate limit, best-effort `lastUsedAt` update
  - `/api/v1/lib/rateLimit.ts` — Upstash Redis sliding window keyed by API key id
  - `/api/v1/lib/response.ts` — `jsonSuccess` / `jsonError` / `corsPreflight` with `X-RateLimit-*` headers and CORS
  - `GET /api/v1/entities/{slug}/scores` — latest scores per `(metric, horizon, regime)`
  - `GET /api/v1/instruments/{ticker}/consensus` — latest weighted consensus signal
  - `GET /api/v1/leaderboard?metric=...` — ranked entities with optional `entityType`, `horizon`, `regimeTag`, `limit`
  - `GET /api/v1/openapi.json` — OpenAPI 3.1 spec for all 3 endpoints
  - Admin page `/admin/api-keys` — create (with scope selection + rate-limit input), list, revoke; displays plaintext key exactly once with copy-to-clipboard

### Migration
- `0005_colorful_nemesis.sql` — adds `api_keys`, `ticker_requests`, `entities.snaptrade_user_id`

### Env vars
- `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` — optional in Sprint 6 (wrapper no-ops gracefully when missing); **must be provisioned in Sprint 7** before the broker flow can be exercised live (see DEVLOG "Sprint 7 prerequisite — SnapTrade credentials")
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — required for B2B API rate limiting

### Dependencies
- `@deepmint/api` adds `snaptrade-typescript-sdk`
- `@deepmint/web` adds `@upstash/ratelimit`, `@upstash/redis`
- `@deepmint/worker` now depends on `@deepmint/api` (to share the SnapTrade wrapper)

### Invariants preserved
- Append-only claims/events/notes untouched
- Broker integration is READ-ONLY (no trade execution path exists)
- Consensus still uses weighted scores (never raw vote counts)
- Individual influence events remain private; the B2B API only exposes aggregated scores

---

## [0.5.0] — Sprint 5: Signal Simulate, Influence Graph, Regime Leaderboards, Notifications (2026-04-08)

### Added
- **Follow-Signal Simulate** — Mirror a Guide or Player's claims as auto-logged paper trades
  - New `signal_simulate_portfolios` table linking followers to dedicated paper portfolios
  - `signalSimulate` tRPC router: create, list, deactivate, comparison (side-by-side performance)
  - Inngest worker: auto-logs paper trades on `claims/created` events (1% allocation per signal)
  - Signal Simulate page with ComparisonChart (Recharts) showing signal vs own portfolio
  - "Mirror Signals" button on entity profile headers
  - Sidebar navigation item
- **Regime-Aware Leaderboards** — Filter leaderboard by market regime
  - `regime` tRPC router: `current` (detects regime via VIX/S&P thresholds), `history` (regime tags over time)
  - `bestInCurrentConditions` leaderboard procedure: top entities by EIV within current regime
  - RegimeBadge component (bull=green, bear=red, high_vol=amber, low_vol=blue, rotation=purple)
  - BestInRegime featured section on leaderboard page
  - Regime filter buttons alongside existing metric filters
- **Shadow Order Book (Influence Graph)** — Tracks who moves retail liquidity
  - `detectInfluenceEvents` pure scoring function (packages/scoring) with 8 unit tests
  - `influence-track` Inngest worker: real-time detection on `claims/created`
  - `influence-aggregate` Inngest worker: nightly 30-day aggregation on `scoring/completed`
  - `influence` tRPC router: `topInfluencers`, `byGuide`, `myInfluencers` (aggregated only — raw events never exposed)
  - Influence tab on Guide profiles (follower count, events, avg response time, top instruments)
  - TrendingInfluencers dashboard widget
  - "Most Influential" metric added to leaderboard
- **Notification System** — In-app notifications with preference controls
  - `notifications` and `notification_preferences` tables
  - `notifications` tRPC router: list (cursor-paginated), unreadCount, markRead, preferences, updatePreferences
  - `createNotification` utility (respects user preferences before inserting)
  - Notification triggers: new_follower, signal_trade_logged (more types ready for Sprint 6)
  - NotificationBell in topbar with unread badge (polls every 30s)
  - NotificationPreferences toggles on settings page
  - `claims/created` Inngest event emitted from claims router (powers signal-simulate + influence tracking)
  - `social/followed` Inngest event emitted from social router (powers new-follower notification)

### Fixed
- **Auth redirect** — Authenticated users visiting `/` now redirect to `/dashboard` (previously stayed on landing page)
- **Sticky landing navbar** — Logo + Sign In / Get Started buttons fixed to top of landing page on scroll
- **Clickable logos** — Sidebar logo links to `/dashboard`; mobile topbar also shows logo linking to `/dashboard`
- **Clerk dark theme** — Social login buttons (Apple, Google) now have visible backgrounds, borders, and white icons; header title/subtitle text visible; footer centered

### Changed
- Claims router now emits `claims/created` Inngest event after claim submission
- Social router now emits `social/followed` Inngest event after follow
- Leaderboard page includes regime indicators, filters, and "Best in Current Conditions" section
- Dashboard sidebar includes TrendingInfluencers widget
- Guide entity profile includes "Influence" tab
- Settings page includes "In-App Notifications" preference section
- `@deepmint/api` now depends on `inngest` and `@deepmint/scoring`
- Worker count: 8 → 12 functions registered

### Technical
- New schema: `signal_simulate_portfolios`, `notifications`, `notification_preferences` (2 migrations)
- New routers: `signalSimulate`, `regime`, `influence`, `notifications`
- New workers: `signal-simulate`, `influence-track`, `influence-aggregate`, `notify-new-follower`
- New scoring function: `detectInfluenceEvents` with full test coverage
- Tests: 95 passing (79 scoring + 16 shared + ingestion tests require HF API key)

---

## [0.4.1] — Sprint 4: Landing Page + Branding Overhaul (2026-04-07)

### Changed
- **Landing Page Rewrite** — Complete messaging overhaul emphasising AI-powered analyst ranking and dual user paths (Guide / Player):
  - Hero: "Follow the market's smart movers. Or better yet, become one." — left-aligned layout with compact logo
  - How It Works: "Choose Your Path → AI Scores the Outcome → The Best Rise the Ranks"
  - New **ChoosePath** section — side-by-side Guide ("I'm an Analyst") and Player ("I'm a Trader") cards with dedicated sign-up CTAs
  - Social Proof: "Predictions Tracked" / "AI-Scored Outcomes" / "Guides & Players"
  - Footer: "AI-ranked analysts. Verified track records."
- **Design System Palette** — Shifted to match logo's native colours:
  - Backgrounds deepened: `#0A0F1A` → `#080C14` (primary), `#111827` → `#0D1219` (secondary)
  - Accent shifted from teal `#2DD4BF` → mint-green `#34D399` to match logo's green glow
  - Borders softened, text-secondary nudged cooler
- **Logo Integration** — Transparent-background PNGs generated from source logo via sharp:
  - `logo-hero.png` (400w, ~47KB) — hero + auth pages
  - `logo-sidebar.png` (280w, ~25KB) — sidebar + footer + 404 page
  - Background removal via luminance + saturation thresholding with anti-aliased edges
- **Favicon Suite** — `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`
- **SEO Metadata** — Title: "Deepmint — AI-Ranked Analyst Track Records", updated OG/Twitter descriptions
- **In-App Copy** — Dashboard, explore, learn, leaderboard, paper portfolio, settings pages updated with AI-aware descriptions

### Added
- `apps/web/components/landing/ChoosePath.tsx` — Dual-path sign-up section (Guide vs Player)

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

- **Landing Page** — Hero, How It Works, Social Proof, Footer (later overhauled in 0.4.1)
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

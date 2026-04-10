# Devlog

Ongoing development notes, decisions, and status updates for Deepmint.

---

## 2026-04-09 — Sprint 6 Complete

### Status
- **Sprint 1–5**: Complete
- **Sprint 6**: Complete (B2B API, Proof-of-Skin, Instrument Expansion)

### What was built
Sprint 6 closes out the "Post-Launch Prompts" with the three remaining features — the B2B monetization layer, the broker-verified trust signal, and instrument universe expansion beyond Mag 7.

#### 6.1 Expand Beyond Mag 7
- New `ticker_requests` table lets authenticated users submit tickers they want tracked; admins approve/reject from `/admin/instruments` User Requests tab.
- `packages/db/seed/sp500-top50.ts` provides ~50 curated tickers (JPM, V, LLY, UNH, AVGO, XOM …) with sector/industry/marketCapBucket metadata.
- `instruments` router gained admin CRUD + batch seed procedures. `adminBatchCreate` is idempotent — it skips tickers already in the table and emits `instruments/batch-added` with only the newly-created ids.
- `backfill-prices` Inngest worker listens for that event and validates each ticker against Polygon.io (365-day daily bars). Instruments Polygon can't serve are immediately deactivated, so the consensus worker (which only queries `isActive = true`) never starts quoting stale-data tickers.
- `adminProcedure` now performs a real admin check against Clerk `privateMetadata.role === "admin"` — previously a placeholder. (Originally shipped against `publicMetadata`; moved to `privateMetadata` the same day — see "Post-sprint hardening" below.)
- Sidebar renders a dedicated admin section (conditionally) with links to Review, Instruments, and API Keys.

#### 6.2 Proof-of-Skin (SnapTrade broker verification)
- **Read-only by design.** The SnapTrade wrapper in `packages/api/lib/snaptrade.ts` only exposes `registerUser`, `getLoginLink`, `listAccounts`, `getAccountActivities`, `deleteUser`. No trade-placement method exists, so the "no auto-execution" invariant is enforced at the import surface.
- SnapTrade `userId`/`userSecret` credentials are stored in `brokerLinks.metadata` (jsonb) rather than dedicated columns — avoids another migration and keeps the schema generic across broker providers.
- `broker` router has five procedures. `disconnect` does not delete `playerTrades` — historical verified trades remain in the record forever, matching the append-only spirit of the platform even though `playerTrades` is not strictly append-only.
- `broker-sync` daily cron fetches activities since `lastSyncAt`, maps BUY/SELL actions to `playerTrades` with `isVerified=true`, stores entry price in integer cents, and staggers calls with `step.sleep("rate-limit", "1s")` to respect SnapTrade throttles.
- `BrokerVerification` component handles the OAuth round-trip by reading `snaptrade_success=true` from the URL after the user returns from the broker login page.
- The 1.5x consensus multiplier for verified Players required no code changes — `consensus-signal.ts` was already gated on `brokerLinkStatus === "verified"`, so flipping an entity's status immediately changes its weight on the next signal rebuild.
- Graceful degradation: if `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY` are missing, `getSnapTradeClient()` returns `null`, the UI shows "not configured", and `broker-sync` exits with `{ skipped: 0, reason: "snaptrade-not-configured" }` instead of crashing.

#### 6.3 B2B Scoring REST API
- Brand-new `/api/v1/` surface using Next.js App Router route handlers — deliberately separate from the tRPC internal API. External clients speak plain REST with JSON envelopes; internal clients stay on tRPC.
- Keys use a `dm_live_<32 hex>` format. Only the SHA-256 hash plus a 16-char prefix are persisted; the plaintext is returned exactly once at creation time and must be stored by the caller. Admin list/revoke operations never touch plaintext.
- Rate limiting is per API key via Upstash sliding window (default 60 req/min, configurable per key). Responses include `X-RateLimit-Limit`, `-Remaining`, `-Reset` headers; 429s include the same headers so clients can back off cleanly.
- All responses follow a `{ data, meta: { requestId, timestamp } }` / `{ error: { code, message }, meta }` envelope. CORS is open on `/api/v1/*` since B2B consumers will hit this from browser-side dashboards.
- Three endpoints ship in 6.3: entity scores, instrument consensus, and leaderboard. `openapi.json` serves a full OpenAPI 3.1 document so Swagger / Redoc / client generators work without extra setup.
- Admin UI `/admin/api-keys` lets admins create (with scope + rate-limit selection), list, and revoke keys. On create, the plaintext is shown once in an amber warning banner with copy-to-clipboard; the prefix is used as the list identifier afterwards.

### Architectural notes
- The worker package now depends on `@deepmint/api` solely to import `@deepmint/api/lib/snaptrade`. This is a one-way dependency — `@deepmint/api` does not import from worker — so no circularity.
- `packages/api/package.json` uses a subpath export (`./lib/snaptrade`) so the worker pulls only the SDK wrapper without dragging in tRPC router code.
- All Sprint 6 schema changes landed in a single migration (`0005_colorful_nemesis.sql`) by editing the schema files first and then running `drizzle-kit generate` once.
- No changes to the existing consensus/scoring workers were required. Both already respected `isActive` filtering and `brokerLinkStatus === "verified"` weighting, so they picked up the new instruments and verified players automatically.

### Tests & verification
- `pnpm check` (turbo typecheck across all 9 packages) — ✅ green across the board after fixing:
  - Inngest v4 API change: triggers go inside the config block as `triggers: [...]`, not as a second positional arg.
  - `FAILED_PRECONDITION` → `PRECONDITION_FAILED` (correct tRPC error code).
  - Added `@deepmint/api` to worker deps and `@upstash/ratelimit` + `@upstash/redis` to web.
- `pnpm test` — **113/113 passing** after switching the LLM extraction model to `google/gemma-4-31B-it:fastest` and bumping extractor test timeouts to 180s.
  - `@deepmint/shared`: 16 ✅
  - `@deepmint/scoring`: 79 ✅
  - `@deepmint/ingestion`: 18 ✅ (6 live-LLM extractor tests between 7.8–25.8s each)
- Live end-to-end verification of the B2B API via `curl`:
  - `GET /api/v1/openapi.json` (public) → 200 + spec
  - No/invalid/malformed auth → 401 with proper JSON error envelopes and codes
  - Valid key → 200 on leaderboard, consensus (AAPL bullish, conviction 0.3478), 404 on unknown entity slug
  - `X-RateLimit-Limit` / `-Remaining` / `-Reset` headers present on all responses
- Bugs caught during live verification and fixed before shipping:
  1. Clerk middleware was gating `/api/v1/*` with session auth — added `/api/v1(.*)` to `isPublicRoute`.
  2. Consensus endpoint was leaking `instrument.id` (internal UUID) — added explicit `publicInstrument` projection.
  3. Migration `0005_colorful_nemesis.sql` wasn't applied to dev DB — ran `drizzle-kit migrate` cleanly.
- Unit test coverage for SnapTrade OAuth flow and Upstash rate limit is deferred to follow-up work — requires provisioning `SNAPTRADE_*` and live `UPSTASH_*` env vars.

### LLM model change (post-Sprint 6)
- Switched default extraction model from `Qwen/Qwen3-235B-A22B` to `google/gemma-4-31B-it:fastest` via the HuggingFace router (`https://router.huggingface.co/v1`). The `:fastest` suffix tells the router to dispatch to whichever upstream provider is currently serving the model with the lowest latency, eliminating the cold-start timeouts that were flaking the AAPL extraction test.
- No other code changes — client construction (OpenAI SDK pointed at the HF router), auth (`HF_API_KEY`), and extraction flow are identical. `LLM_MODEL` env var still overrides the default.
- Performance: extractor suite runs in ~102s wall time (was 170s+ with frequent 60s timeouts). Individual calls now 7.8–25.8s vs 18–60s+ on Qwen.

### Post-sprint hardening (same day)

#### Admin role → `privateMetadata` (security)
- Original implementation stored the admin flag in Clerk `publicMetadata.role`, which is readable from any client via `useUser()` and ends up in the JS bundle. Not acceptable for an admin gate.
- Refactored to `privateMetadata.role` (server-only). Two-tier lookup handles both possible Clerk setups:
  1. **Fast path** — read `sessionClaims.metadata.role` (requires the Clerk session token customization `{ "metadata": "{{user.private_metadata}}" }` — configured in Clerk Dashboard → Sessions → Customize session token).
  2. **Fallback** — if the claim is absent, call `clerkClient().users.getUser(userId)` and read `privateMetadata.role` directly from the backend API. Adds one Clerk API call per admin page load but works regardless of session-token config.
- `apps/web/components/layout/Sidebar.tsx` no longer imports `useUser` — it accepts `isAdmin: boolean` as a prop resolved server-side in `apps/web/app/(app)/layout.tsx` (converted to an `async` server component). Result: the string `"admin"` never appears in the client JS bundle.
- Same two-tier check is applied in `apps/web/app/api/trpc/[trpc]/route.ts` so tRPC `adminProcedure` stays consistent with the UI gating.

#### Clerk sign-in UI fixes
- **Google logo rendered as a white box.** The blanket `socialButtonsProviderIcon` element override with `filter: brightness(0) invert(1)` was whitening Google's multicolor G into an empty box inside the white button border. Fix: scoped the filter to `socialButtonsProviderIcon__apple` (Clerk's per-provider modifier key). Apple's monochrome logo still flips to white; Google/Facebook/X pass through unfiltered.
- **"Last used" pill was dark-on-dark.** Clerk's `badge` element key did not target this particular element and the appearance API override had no effect. Clerk's docs don't enumerate the key, and both the preview browser and Chrome-extension bridge were unavailable for DOM inspection. Went with a scoped global CSS rule in `apps/web/app/globals.css` targeting `.cl-rootBox [class*="cl-badge"]` and `[class*="cl-internal"][class*="badge" i]` with `color: var(--color-text-primary) !important`. Minimal, robust, and survives Clerk internal class renames as long as `badge` stays in the class string.

### Known follow-ups
- Add integration tests for the 3 REST endpoints (happy path + 401/403/429/404).
- Add a unit test for `generateKey()` ensuring SHA-256 hash stability and prefix extraction.
- Wire up a lightweight API docs page under `/docs/api` that renders the `openapi.json` spec via a client-side Swagger/Redoc component.
- Seed an initial admin user by setting `privateMetadata.role = "admin"` in Clerk for the development account (Dashboard → Users → select user → Metadata → **Private metadata** tab).

### ⚠️ Sprint 7 prerequisite — SnapTrade credentials
Sprint 6 shipped the Proof-of-Skin broker verification flow against `packages/api/lib/snaptrade.ts`, but no live credentials have been provisioned yet. **Before any Sprint 7 work that touches the broker flow (integration tests, live sync verification, UI polish):**
- Register a SnapTrade client at <https://snaptrade.com> and obtain a `CLIENT_ID` / `CONSUMER_KEY`.
- Set `SNAPTRADE_CLIENT_ID` and `SNAPTRADE_CONSUMER_KEY` in `.env.local` (and in Vercel env for preview / prod).
- Smoke-test: sign in → Settings → "Verify Broker" → complete the OAuth round-trip → confirm `brokerLinks.status` flips to `verified` and a `syncTrades` run inserts at least one `playerTrades` row.
- Update `docs/DEVLOG.md` with any quirks discovered during the live round-trip.
- Until credentials are set, the wrapper will continue to return `null` from `getSnapTradeClient()` and the UI will show "Broker verification is not configured on this deployment." — this is the intended graceful-degradation path, not a bug.

---

## 2026-04-08 — Sprint 5 Complete

### Status
- **Sprint 1**: Complete
- **Sprint 2**: Complete
- **Sprint 3**: Complete
- **Sprint 4**: Complete (including post-sprint branding overhaul)
- **Sprint 5**: Complete

### What was built
Sprint 5 (Post-MVP Features) delivers four major features building on the MVP foundation.

Features completed:
- **5.1 Follow-Signal Simulate** — Users can mirror any Guide/Player's future claims as auto-logged paper trades with side-by-side performance comparison
- **5.2 Regime-Aware Leaderboards** — Current market regime detection (bull/bear/high_vol/low_vol/rotation) with leaderboard filtering and "Best in Current Conditions" featured section
- **5.3 Shadow Order Book** — Influence detection scoring function, real-time + nightly aggregation workers, influence API (aggregated only — raw events private), Guide profile influence tab, dashboard trending widget
- **5.4 Notification System** — In-app notifications (bell icon with polling), new_follower and signal_trade_logged triggers, preference toggles per notification type

### UX Fixes (post-implementation)
- **Auth redirect loop** — Middleware now checks `userId` and redirects authenticated users from `/` → `/dashboard`. Previously, signing in would return to the landing page with no visible change.
- **Sticky landing navbar** — Created `LandingNavbar` component (sticky, backdrop-blur). Logo removed from HeroSection to avoid duplication. Navbar has Sign In + Get Started CTAs.
- **Clickable logos** — Sidebar logo wrapped in `<Link href="/dashboard">`. Topbar shows logo on mobile (where sidebar is hidden).
- **Clerk social buttons invisible** — Apple logo was black-on-dark. Fixed with `filter: brightness(0) invert(1)` on provider icons. Added explicit `backgroundColor`, `border`, and `color` to `socialButtonsBlockButton` elements. Added `headerTitle` and `headerSubtitle` color overrides.

### Key Decisions
- **Signal-simulate reuses paper portfolios** — No parallel trade system. Signal-simulate portfolios are standard `paperPortfolios` rows linked via a `signal_simulate_portfolios` join table. All existing P&L logic from `packages/api/routers/paper.ts` is reused.
- **Regime detection uses placeholder data** — `detectRegime()` from `packages/scoring/src/regime.ts` works with configurable VIX/S&P thresholds. Sprint 5 uses placeholder indicators (VIX=18, S&P return=1%). Live data integration deferred to Sprint 6.
- **Influence privacy enforced at router level** — The `influence` router only queries the aggregated `influence_scores` table. Raw `influence_events` are never exposed. No procedure leaks individual event data. This is a critical invariant (AGENTS.md §10.9).
- **Notifications use polling, not SSE** — `NotificationBell` polls `unreadCount` every 30 seconds via `refetchInterval`. Avoids SSE/WebSocket complexity. Can upgrade to Supabase Realtime in Sprint 6 as a drop-in enhancement.
- **createNotification is a shared utility** — Called directly by workers rather than via event pipeline. Checks `notification_preferences` before inserting. Simple and debuggable.
- **Inngest events emitted from tRPC routers** — `claims/created` (from claims.submit) and `social/followed` (from social.follow) are emitted non-blocking (`.catch(() => {})`) to avoid failing user actions when Inngest is unavailable.

### Tests
- **95 tests passing** (79 scoring + 16 shared)
- 8 new influence detection tests (happy path, wrong instrument, no follow, before guide, lag exceeded, direction match/mismatch, multiple claims, empty arrays)
- Ingestion tests require HF_API_KEY (not counted in CI-safe total)

### Sprint 6+ Available
1. B2B Scoring API (public REST at /api/v1/)
2. Proof-of-Skin (SnapTrade read-only broker verification)
3. Expand Beyond Mag 7 (S&P 500 top 50 → full S&P → Russell 1000)
4. Live regime data (VIX/S&P from Polygon.io replacing placeholders)
5. Supabase Realtime upgrade for notifications
6. Outcome matured + rank change notification triggers

---

## 2026-04-07 — Sprint 4 Complete + Landing Page & Branding Overhaul

### Status
- **Sprint 1**: Complete
- **Sprint 2**: Complete
- **Sprint 3**: Complete
- **Sprint 4**: Complete (including post-sprint branding overhaul)
- **Sprint 5**: Not started

### What was built
Sprint 4 (Social + Polish) delivers social features, paper trading, education, and production readiness. All 8 prompts completed (4.1–4.8). Post-sprint work overhauled the landing page, branding, and design system.

Prompts completed:
- 4.1 Social Router (follow, unfollow, feed, follower counts with Redis)
- 4.2 Watchlist Router (add/remove instruments, sidebar widget)
- 4.3 Ticker Page (full redesign with consensus breakdown, donut chart, top entities, conviction meter)
- 4.4 Paper Portfolio (create portfolios, add/close trades, P&L tracking, equity curve)
- 4.5 Email Digest Worker (Inngest cron, Resend integration, email preferences)
- 4.6 Education Track (5 learning modules with quizzes, localStorage progress)
- 4.7 Landing Page + Polish (hero, how-it-works, social proof, 404/error pages, OG meta tags)
- 4.8 Deployment (CI pipeline, Vercel config, Sentry integration)

Post-sprint:
- **Logo integration** — Transparent-background PNGs generated from source logo via sharp pixel manipulation (luminance + saturation thresholding). Deployed across hero, sidebar, footer, auth pages, 404 page.
- **Landing page rewrite** — Messaging overhauled three times:
  1. Initial: generic "provably good" track record messaging
  2. AI-heavy: overemphasised web scraping and AI agents
  3. Final: balanced — AI-powered ranking + clear Guide/Player dual CTAs
- **New ChoosePath component** — Side-by-side cards for Guide ("I'm an Analyst") and Player ("I'm a Trader") with dedicated sign-up flows
- **Design system palette shift** — Accent from teal `#2DD4BF` → mint-green `#34D399` to match logo; backgrounds deepened to `#080C14`
- **Hero layout** — Left-aligned with compact logo (brand mark style, not centred splash)
- **Favicon suite** — favicon.ico, 16px, 32px, apple-touch-icon
- **SEO metadata** — Updated all OG/Twitter card titles and descriptions

### Key decisions
- **Social feed** uses tRPC infinite query matching ClaimsTimeline data shape for component reuse
- **Watchlist** extends the social router rather than creating a separate router — keeps related social features grouped
- **Ticker page** uses SSR for initial data (consensus, price) + client-side tRPC for top entities
- **Paper portfolio cash** calculated from trade history (not stored) to avoid state sync issues
- **Education modules** are pure client-side with localStorage — no backend needed for MVP
- **Landing page** outside `(app)` layout (no sidebar) for clean public presentation
- **Entity stats** added to entity router for live counters on landing page
- **Logo transparency** — Sharp pixel manipulation (not external tools) to remove logo background; luminance < 65 + saturation range < 25 = transparent, with gradual alpha fade for anti-aliasing
- **Accent colour shift** — Teal → mint-green was a deliberate move to match the logo's green glow centre, making the entire palette feel cohesive
- **Left-aligned hero** — Moved away from centred logo layout (felt dated) to modern left-aligned brand mark + headline

### New files created
```
packages/api/routers/social.ts       — 11 endpoints (follow + watchlist + email prefs)
packages/api/routers/ticker.ts       — overview endpoint
packages/api/routers/paper.ts        — 6 endpoints (portfolio + trades)
packages/db/schema/emailPreferences.ts — email digest settings

apps/worker/functions/digest.ts       — daily email digest

apps/web/components/FollowButton.tsx
apps/web/components/WatchButton.tsx
apps/web/components/dashboard/SocialFeed.tsx
apps/web/components/dashboard/WatchlistSidebar.tsx
apps/web/components/ticker/ConsensusBreakdown.tsx
apps/web/components/ticker/TopEntitiesPanel.tsx
apps/web/components/paper/PortfolioList.tsx
apps/web/components/paper/PortfolioDetail.tsx
apps/web/components/paper/NewTradeForm.tsx
apps/web/components/paper/EquityCurve.tsx
apps/web/components/learn/ModuleCard.tsx
apps/web/components/learn/ModuleContent.tsx
apps/web/components/landing/HeroSection.tsx
apps/web/components/landing/HowItWorks.tsx
apps/web/components/landing/SocialProof.tsx
apps/web/components/landing/Footer.tsx
apps/web/components/landing/ChoosePath.tsx  — NEW (post-sprint)
apps/web/lib/learnModules.ts
apps/web/hooks/useLearnProgress.ts
apps/web/app/(app)/learn/[moduleId]/page.tsx
apps/web/app/(app)/ticker/[symbol]/TickerClientSection.tsx
apps/web/app/not-found.tsx
apps/web/app/error.tsx
apps/web/app/global-error.tsx
apps/web/sentry.client.config.ts
apps/web/sentry.server.config.ts
apps/web/sentry.edge.config.ts
.github/workflows/ci.yml
vercel.json
```

### Assets created
```
apps/web/public/logo-hero.png         — 400w transparent PNG (~47KB)
apps/web/public/logo-sidebar.png      — 280w transparent PNG (~25KB)
apps/web/public/favicon.ico           — 32x32
apps/web/public/favicon-16.png        — 16x16
apps/web/public/favicon-32.png        — 32x32
apps/web/public/apple-touch-icon.png  — 180x180
```

### Test results
```
pnpm --filter @deepmint/scoring test  — 71 passed
pnpm --filter @deepmint/shared test   — 16 passed
Total: 87 passing (scoring + shared)
```

### Env vars needed for Sprint 4
| Variable | Status | Notes |
|----------|--------|-------|
| `RESEND_API_KEY` | Not set | Needed for email digest worker |
| `NEXT_PUBLIC_SENTRY_DSN` | Not set | Needed for Sentry error tracking |
| `SENTRY_AUTH_TOKEN` | Not set | Needed for Sentry source maps |

### Schema changes
- Migration 0002: `email_preferences` table

### Design system changes (globals.css)
| Token | Before | After |
|-------|--------|-------|
| `--color-bg-primary` | `#0A0F1A` | `#080C14` |
| `--color-bg-secondary` | `#111827` | `#0D1219` |
| `--color-bg-tertiary` | `#1A2332` | `#151C28` |
| `--color-accent` | `#2DD4BF` | `#34D399` |
| `--color-accent-hover` | `#14B8A6` | `#2BBF88` |
| `--color-border` | `#1E293B` | `#1A2233` |

### What's next
Sprint 5+ features available (prompts.md):
1. **Follow-Signal Simulate** — Mirror Guide/Player signals as paper trades
2. **Regime-Aware Leaderboards** — Filter by market regime (bull/bear/high_vol)
3. **B2B Scoring API** — REST API at `/api/v1/` with API key auth
4. **Notification System** — In-app notifications via SSE, bell icon with unread count
5. **Shadow Order Book** — Influence graph tracking who moves retail liquidity
6. **Proof-of-Skin** — SnapTrade read-only broker verification
7. **Expand Beyond Mag 7** — S&P 500 top 50 → full S&P → Russell 1000

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

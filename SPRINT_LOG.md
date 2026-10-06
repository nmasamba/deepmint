# Deepmint Sprint Log

An index of the project's phases, oldest first. Each entry gives the dates, the goal, what shipped and what has changed since. Full detail is in [docs/CHANGELOG.md](docs/CHANGELOG.md) (per version) and [docs/DEVLOG.md](docs/DEVLOG.md) (per session).

- **Dates** are git commit dates on `main` (`git log --first-parent origin/main`). Where the CHANGELOG gives a different date, both are shown.
- **Superseded** marks a detail that was true when it shipped and is not true today; what replaced it follows the arrow.
- "Status today" lines describe the code at `cd63901` (2026-10-05).

| Phase | Dates (git) | Record | Headline |
|---|---|---|---|
| [Sprint 1](#sprint-1--foundations) | 2026-03-30 → 04-01 | [0.1.0](docs/CHANGELOG.md#010--sprint-1-foundations-2026-03-28) | Monorepo, schema, Clerk auth, profiles |
| [Sprint 2](#sprint-2--claims-ledger--ingestion-pipeline) | 2026-04-02 → 04-03 | [0.2.0](docs/CHANGELOG.md#020--sprint-2-claims-ledger--ingestion-pipeline-2026-04-02), [0.2.1](docs/CHANGELOG.md#021--sprint-2-fixes--env-remediation-2026-04-03) | Claim ledger, LLM extraction, Merkle audit |
| [Sprint 3](#sprint-3--scoring-engine) | 2026-04-06 | [0.3.0](docs/CHANGELOG.md#030--sprint-3-scoring-engine-2026-04-04) | Markout, scoring, leaderboard, consensus |
| [Sprint 4](#sprint-4--social--polish) | 2026-04-06 → 04-07 | [0.4.0](docs/CHANGELOG.md#040--sprint-4-social--polish-2026-04-07), [0.4.1](docs/CHANGELOG.md#041--sprint-4-landing-page--branding-overhaul-2026-04-07) | Follows, paper trading, Learn, landing page, CI |
| [Sprint 5](#sprint-5--signal-simulate-influence-regimes-notifications) | 2026-04-08 | [0.5.0](docs/CHANGELOG.md#050--sprint-5-signal-simulate-influence-graph-regime-leaderboards-notifications-2026-04-08) | Signal Simulate, influence, regimes, notifications |
| [Sprint 6](#sprint-6--b2b-api-proof-of-skin-instrument-expansion) | 2026-04-09 → 04-10 | [0.6.0](docs/CHANGELOG.md#060--sprint-6-b2b-api-proof-of-skin-instrument-expansion-2026-04-09) | REST API, SnapTrade, S&P expansion, admin role |
| [Sprint 7](#sprint-7--hardening--mobile-pwa) | 2026-04-14 | [0.7.0](docs/CHANGELOG.md#070--sprint-7-hardening--mobile-pwa-2026-04-14) | Live regime data, notifications, API docs, PWA |
| [Hardening + production wiring](#may-to-july-2026--hardening-and-production-wiring) | 2026-05-04 → 07-03 | [0.8.0](docs/CHANGELOG.md#080--logic-error-audit-extraction-hardening-backfill-mcp-production-wiring-2026-07-03) | Vercel, logic-error audit, backfill, MCP, Inngest in production |
| [Rating attribution + scoring fairness](#august-2026--rating-attribution-and-scoring-fairness) | 2026-08-03 → 08-14 | [0.9.0](docs/CHANGELOG.md#090--first-production-use-attribution-scoring-fairness-first-use-fixes-2026-08-14) (PRs #1–#5) | Firm attribution, fairness fixes, entity self-heal, no fabricated prices |
| [Extractor integrity, backfill, CI](#october-2026--extractor-integrity-backfill-and-ci) | 2026-10-05 | [0.10.0](docs/CHANGELOG.md#0100--extraction-integrity-backfill-fixes-ci-2026-10-05) (PRs #6–#9) | Evidence gate, `:fastest` models, active-only outcomes, CI fixed |

---

## Sprint 1 — Foundations

- **Dates:** commits 2026-03-30 (`8696f25`) to 2026-04-01 (`d7f7baf`, "sprint 1 complete"). The CHANGELOG dates it 2026-03-28, before the first commit.
- **Goal:** a working monorepo with a schema, auth and profile pages.
- **Shipped:**
  - Turborepo with pnpm workspaces; Next.js 15 App Router with Tailwind and shadcn/ui.
  - tRPC v11 with public, protected and admin procedures. The admin check was a placeholder until Sprint 6.
  - Drizzle on Postgres 16. Migration `0000_medical_hammerhead.sql` creates 17 tables.
  - Clerk auth, with a `user.created` webhook that creates the user's entity.
  - Guide and Player profile pages, instrument search, sidebar and topbar.
  - `db:seed`: the 7 Mag-7 instruments plus fictional Guides, Players and claims.
- **Status today:**
  - The webhook is no longer the only way an entity is created. Since PR #2 (2026-08-11) the tRPC context creates a missing Player on the user's first request.
  - Sign-in methods are set in the Clerk dashboard, not in code. Facebook and X sign-in were never configured.
  - `db:seed` inserts fake Guides and 100 backdated active claims into the append-only ledger. Run it locally only, never against production.

## Sprint 2 — Claims ledger + ingestion pipeline

- **Dates:** 2026-04-02 (`ec568ba`, `006bb6d`), with a follow-up commit on 2026-04-03 (`bb20619`). CHANGELOG 0.2.0 (2026-04-02) and 0.2.1 (2026-04-03).
- **Goal:** users log immutable claims; a pipeline captures analyst text and extracts claims with an LLM; a daily Merkle root covers each day's claims.

### Still accurate

- **Claims router** (`packages/api/routers/claims.ts`): `submit`, `list`, `detail`, `addNote`, `pendingReview`, `reviewClaim`.
  - `list` uses cursor pagination.
  - `submit` allows 10 claims per hour per entity through Upstash. Without Upstash the limit is skipped.
  - The only update to a claim is the admin status change `pending_review` → `active` or `rejected`. Application code enforces this; the database does not.
  - No page calls `detail` or `addNote`; only the MCP `add_note` tool calls `addNote`.
- **Claim UI:** `SubmitClaimForm`, `ClaimCard` and `ClaimsTimeline` (infinite scroll). Claims appear on the dashboard ("Make a Prediction"), My Claims, profile and ticker pages. Claim cards never show outcomes, because no caller passes them.
- **Content hashing** (`packages/ingestion/src/hasher.ts`): SHA-256 of `{url, text, ts}`. Ingest skips any capture whose hash is already in `events`.
- **Inngest workers:** `ingest-sources` (weekdays 20:30 UTC), `extract-claims` (on `ingestion/completed`) and `merkle-audit` (daily 22:00 UTC).
- **Merkle audit** (`packages/shared/src/merkle.ts`): `computeClaimLeafHash()` and `buildMerkleTree()`. Pairs are hashed level by level, duplicating the last node when a level is odd, and the root is stored in `audit_roots`.
  - Nothing reads `audit_roots`, and `bitcoin_tx_id` is never written.
  - Claims inserted with a backdated `created_at` (rating dates, backfill) are never covered by any root.
- **Admin review page** (`/admin/review`): approve or reject `pending_review` claims.
- **Decisions that still hold:**
  - The LLM runs through Hugging Face's OpenAI-compatible router (`HF_API_KEY`), not Anthropic.
  - drizzle-orm operators are re-exported from `@deepmint/db`, so there is a single drizzle instance.
  - `capture.ts` stays out of the ingestion barrel, which keeps Playwright out of the web bundle.
  - Inngest v4: `createFunction` takes its triggers in the options object.

### Superseded

- **Default model `Qwen/Qwen3-235B-A22B`** → `google/gemma-4-31B-it:fastest` (2026-04-09) → Qwen again (2026-06-26, `dc2d8e3`) → `openai/gpt-oss-120b:cerebras` with fallback `meta-llama/Llama-3.3-70B-Instruct:groq` (2026-06-26, `2070eb5`, after Qwen was deprecated) → today `openai/gpt-oss-120b:fastest` with fallback `meta-llama/Llama-3.3-70B-Instruct:fastest` (PR #6, 2026-10-05).
  - `LLM_MODEL` and `LLM_MODEL_FALLBACK` are optional emergency overrides. Both were deleted from Vercel and `.env.local` on 2026-10-05.
- **Routing on confidence alone** (≥ 0.8 → `active`) → plus a resolved firm for Wall Street ratings (PR #1) → the evidence gate (PR #6). A claim is `active` only if all three hold:
  - extraction confidence ≥ 0.8;
  - a Wall Street rating has a resolved issuing firm;
  - a verified quote contains horizon words that name exactly the claim's horizon.

  Anything else goes to `pending_review`.
- **Entry price "from Polygon with dev fallback prices"** → the entry price is the previous trading day's close (`getCurrentPrice`).
  - The fixed Mag-7 dev prices apply only when `POLYGON_API_KEY` is unset.
  - With a key, a failed lookup throws (PR #4, 2026-08-13).
- **Snapshot storage** (`r2.ts`) and **Playwright capture** (`capture.ts`) → still in the repo, but nothing calls them; `events.snapshot_path` is always null.
- **Demo source adapter** (`sources/demo.ts`, 5 hard-coded reports) → only a unit test uses it. Ingest relied on it, later as a fallback, until 2026-08-03. An unconfigured environment now ingests nothing.

## Sprint 3 — Scoring engine

- **Dates:** the CHANGELOG dates it 2026-04-04. The code was committed on 2026-04-06 in `43766cf` ("init sprint 4"), together with the start of Sprint 4.
- **Goal:** turn matured claims into outcomes, scores, leaderboards and consensus signals.
- **Shipped:**
  - The full Polygon (Massive.com) client in `packages/shared/src/polygon.ts` (Sprint 2's version had only a price helper), with a 12.5 s throttle per process for the 5 req/min plan.
  - `markout-computation` (weekdays 21:00 UTC, which is 17:00 EDT and 16:00 EST). It writes one outcome per matured active claim, priced at the exit date's close.
  - `packages/scoring`, pure statistical functions:
    - Player: Sharpe, max drawdown, Calmar, CVaR5, consistency.
    - Guide: hit rate, average return, z-test, Brier, target precision.
    - Consensus, regime detection and EIV.
  - `entity-scoring` (on `markouts/completed`); `consensus-signal` and `leaderboard-refresh` (on `scoring/completed`).
  - `leaderboard`, `consensus` and `scores` routers; the leaderboard page; profile Overview and Stats tabs; the dashboard consensus grid.
- **Status today:**
  - No job calls `checkAntiGaming`, `maeAndMfe`, `calmarRatio`, `continuousBrierScore` or `timeDecayedBrierScore`, so anti-gaming is not applied. `outcomes.brier_slices` (migration 0001) is never written.
  - "Regime-aware" EIV is not regime-aware in practice. The worker always passes an empty regime history, so the 0.4 penalty always applies and `eiv` equals `eiv_overall`.
  - Player metrics treat each claim's outcome as one daily return, whatever its horizon.
  - `polygonCache.ts` was meant to cache prices (1 h historical, 5 min current). In fact only regime indicators are cached (1 h, and only when Upstash is set); prices are never cached.
  - Consensus covers every active instrument, not just the Mag 7, using active claims from the last 90 days.
  - `leaderboard-refresh` only writes a log line.
  - Regime inputs were placeholders (VIX 18, S&P +1%) until Sprint 7.

## Sprint 4 — Social + polish

- **Dates:** 2026-04-06 (`43766cf`) to 2026-04-07 (`a7eb223`). CHANGELOG 0.4.0 and 0.4.1, both 2026-04-07.
- **Goal:** social features, paper trading, education, a public landing page and deployment plumbing.
- **Shipped:**
  - `social` router: follows, social feed, watchlist and email preferences. Follow and Watch buttons.
  - Redesigned ticker page with a consensus breakdown and top Guides and Players. Non-Mag-7 symbols show "Coming soon".
  - Paper portfolios (up to 5 per entity) with trades and P&L (`paper` router).
  - `daily-digest` email worker (weekdays 12:00 UTC, through Resend).
  - Learn: 5 static modules, 3 of them with quizzes; progress is kept in localStorage.
  - Landing page, rewritten in 0.4.1: ChoosePath Guide/Player cards, mint-green palette, logo and favicons. Also 404 and error pages.
  - The CI workflow, root `vercel.json` and the Sentry config files.
- **Status today:**
  - The digest is sent to a placeholder `user+<clerkUserId>@deepmint.app` address, and it is skipped when `RESEND_API_KEY` is unset. No user receives it.
  - Sentry is inert. No `instrumentation.ts` or `withSentryConfig` loads the config files, so setting the DSN does nothing.
  - Both landing "Sign Up" buttons lead to plain `/sign-up`, and every new user becomes a Player.
  - The live stats section (`SocialProof`) has been hidden before launch since PR #5.
  - The landing copy says AI grades the calls, but scoring is deterministic statistics.
  - The paper "Equity Curve" plots two points (start and now), and paper trades fill at the previous close.
  - The ticker page's Avg Target and Dispersion panels never render, because the consensus worker never writes those fields. Its Top Guides and Top Players lists are global, not per ticker.
  - CI failed at pnpm setup from August until PR #9 (2026-10-05).

## Sprint 5 — Signal Simulate, influence, regimes, notifications

- **Dates:** 2026-04-08 (`9287600`). CHANGELOG 0.5.0, 2026-04-08.
- **Goal:** post-MVP features on top of the claim ledger.
- **Shipped:**
  - Signal Simulate: "Mirror Signals" creates a paper portfolio. On each `claims/created` event from the mirrored entity, it logs a trade sized at 1% of the starting balance. A comparison page sits alongside.
  - Regime filters on the leaderboard, a regime badge, and "Best in Current Conditions".
  - Influence tracking: `influence-track` (on `claims/created`) and `influence-aggregate` (on `scoring/completed`). A Guide Influence tab and a Trending Influencers widget.
  - In-app notifications with per-type preferences; the bell polls every 30 s.
  - `claims/created` and `social/followed` events. The worker count went from 8 to 12.
  - Signed-in users who open `/` are redirected to `/dashboard`.
- **Status today:**
  - Only tRPC `claims.submit` (self-logged claims) emits `claims/created`. Ingested and admin-approved claims never do, so mirroring a Guide never logs a trade.
  - The regime filter chips always return an empty board, because only `eiv` rows carry a regime tag.
  - "Best in Current Conditions" returned no rows until it was repointed at the `eiv` rows on 2026-08-03.
  - The "Most Influential" leaderboard tab is always empty. It reads `scores`, but the value lives only in `influence_scores`.
  - Four notification types fire: `new_follower`, `signal_trade_logged`, and, since Sprint 7, `outcome_matured` and `rank_change`. `new_claim_from_follow` has a preference toggle but is never sent.

## Sprint 6 — B2B API, Proof-of-Skin, instrument expansion

- **Dates:** 2026-04-09 (`874a37f`) to 2026-04-10 (`ec7291e`). CHANGELOG 0.6.0, 2026-04-09.
- **Goal:** a paid API, a broker-verified trust signal and a wider instrument universe.
- **Shipped:**
  - REST `/api/v1`: `GET /entities/{slug}/scores`, `GET /instruments/{ticker}/consensus`, `GET /leaderboard`, plus `openapi.json`. Migration 0005.
    - Keys are Bearer `dm_live_` keys; only the SHA-256 hash and a 16-character prefix are stored.
    - Only admins can mint keys, at `/admin/api-keys`.
    - Each key gets an Upstash per-minute limit (default 60), which is a no-op without Upstash.
  - Proof-of-Skin: read-only SnapTrade linking (`broker` router; `broker-sync` runs weekdays 22:00 UTC). Verified Players get ×1.5 weight in consensus.
  - Instrument expansion:
    - the `/admin/instruments` page and the `ticker_requests` table;
    - `SP500_TOP_50_EXPANSION`;
    - the `backfill-prices` worker, which deactivates any ticker for which Polygon returns no bars.
  - The admin role is read from Clerk `privateMetadata.role`. It moved there from `publicMetadata` on 2026-04-10 (`ec7291e`).
- **Status today:**
  - SnapTrade keys were empty at the last recorded check (2026-07-02), so broker linking is dormant. When it is enabled, "verified" means only that SnapTrade lists at least one account; trades are never compared with claims.
  - The expansion list has 50 tickers, 57 with the Mag 7. The file's "~43" header comment is stale.
  - Those tickers are added only when an admin presses "Seed S&P 500 Top 50". Whether that happened in production is not recorded.
  - Extraction and ticker pages stay Mag-7 only.
  - No UI calls `instruments.requestTicker`, and approving a request does not create an instrument.
  - **Expansion is deferred by design.** Deepmint stays Mag-7 only until the core product has matured; this tooling is dormant groundwork for that later step (maintainer decision, 2026-10-05). The surfaces that would disagree once more stocks exist are listed in [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md#instrument-universe-inconsistent).
  - Superseded: the default model `google/gemma-4-31B-it:fastest` (see Sprint 2).

## Sprint 7 — Hardening + mobile PWA

- **Dates:** 2026-04-14 (`0574a26`). CHANGELOG 0.7.0, 2026-04-14.
- **Goal:** close the Sprint 6 follow-ups and make the app usable on phones.
- **Shipped:**
  - `generateKey()` extracted to `packages/api/lib/generateKey.ts`, with 5 unit tests.
  - Live regime indicators from Polygon: VIX, the S&P 500 30-day return and 11 sector ETFs.
  - `outcome_matured` notifications (from markout) and `rank_change` notifications (an EIV rank move of 3 or more).
  - `/api/v1` integration tests, which skip without `TEST_API_KEY` and need a running server.
  - `/docs/api`: Swagger UI over `/api/v1/openapi.json`.
  - Mobile hamburger navigation; the bottom bar was cut to 4 items.
  - PWA manifest, Serwist service worker and an `/offline` page.
- **Status today:**
  - With a key set, if both index endpoints fail, regime detection still falls back to fixed values (VIX 18, SPX 5300).
  - Without Upstash, the regime lookup (about 25 throttled Polygon calls) runs uncached on every scoring run and leaderboard view.
  - The web suite has 18 tests in 4 files; an MCP test file was added in June. All of them skip without `TEST_API_KEY`, and CI does not run them.
  - `/docs/api` is shown to every signed-in user, but only admins can mint keys.
  - `/manifest.json` and `/offline` sit behind sign-in. The manifest returns 404, and the offline page is never precached, so neither works.

---

## May to July 2026 — Hardening and production wiring

CHANGELOG [0.8.0](docs/CHANGELOG.md#080--logic-error-audit-extraction-hardening-backfill-mcp-production-wiring-2026-07-03); reasoning is in the [DEVLOG](docs/DEVLOG.md). These are git dates; the DEVLOG headings for the June and July work read 2026-05-05.

- **Vercel (2026-05-04/05, `dee6b3a`, `6bafd9a`).** Project `deepmint-web-7ald` builds `apps/web` from `main`. The root `vercel.json` uses `cd ../..`, which only makes sense with Root Directory `apps/web`.
  - `packages/db/run-migration.mjs` was added in `6bafd9a`. Do not use it: it hard-codes the main-checkout path and exits 0 on failure.
- **Logic-error audit (2026-06-26, `875bb08`).** 25 confirmed fixes, among them:
  - the P&L sign for shorts;
  - parsing of Markdown-fenced JSON;
  - the leaderboard entity-type filter now applies before `LIMIT`;
  - the Merkle audit now covers the previous complete UTC day;
  - duplicate broker trades;
  - an exact consensus tie now resolves to neutral.
- **LLM hardening (2026-06-26, `dc2d8e3`).**
  - JSON mode, with a fallback for models that reject it.
  - A 120 s timeout with 2 retries.
  - The `mentionsMag7` pre-filter: no LLM call for text that names no Mag-7 company.
  - Idempotent extraction: an event that already has claims is skipped.
  - Superseded: `max_tokens` 1024 → 4096 (PR #6).
- **Data flywheel (2026-06-26, `8c6a588`).**
  - `resolveOrCreateGuide`.
  - `RssSourceAdapter` over allowlisted Guides that have a `source_url`. No UI or API sets those fields, so the lane is switched on by editing rows in SQL.
  - `computeMarkoutForClaim`.
  - The `historical-backfill` worker and its CLI, `pnpm --filter @deepmint/worker backfill <archive.json>` (the path is relative to `apps/worker`; locally, prefix `INNGEST_DEV=1`). The worker count reached 15.
- **MCP server (2026-06-26, `92ec088`).** `/api/mcp` has 5 read tools and 2 write tools (`submit_claim`, `add_note`).
  - `createMcpHandler` is called with no `basePath`, so every authenticated request returns 404. Only the 401 auth gate works.
  - The write tools act as the admin who minted the key.
- **Model switch (2026-06-26, `2070eb5`).** Qwen had been deprecated on the router, so the default became `openai/gpt-oss-120b:cerebras` with a Llama fallback. Superseded by `:fastest` (PR #6).
- **Inngest in production (2026-07-02).**
  - `.env.example` now names `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
  - The Vercel integration delivers the keys with an `INNGEST_WORKFLOW_` prefix. `inngest-env.ts` maps them, and `/api/inngest` imports it first.
  - `/api/inngest` became a public route in middleware. `GET /api/inngest` then reported 15 functions in cloud mode.
  - `docs/EXTERNAL_KEYS.md` and `docs/NEXT_SESSION_PROMPT.md` were added.
- **Markout fix (2026-07-03, `a050e58`).** `markout-computation` had failed on every production run because a JS `Date` was bound against raw SQL. It now compares with `now()` in SQL.

## August 2026 — Rating attribution and scoring fairness

PRs #1–#5, merged 2026-08-03 to 2026-08-14. Detail is in CHANGELOG [0.9.0](docs/CHANGELOG.md#090--first-production-use-attribution-scoring-fairness-first-use-fixes-2026-08-14), the DEVLOG's 2026-08-03 entry and each PR. The Mag-7 instruments were seeded in production on 2026-08-11.

- **[PR #1](https://github.com/nmasamba/deepmint/pull/1) (2026-08-03): rating attribution and scoring fairness.**
  - Migration 0006 adds `claims.source_kind`, `rating_grade`, `rating_action` and `analyst_name`, plus `events.publisher`.
  - A claim is credited to the firm that issued the rating, as that firm's own Guide, and never to the publication; a denylist blocks publications.
  - A stated rating date backdates `created_at`, with that day's closing price as the entry.
  - Cross-source dedupe on entity, instrument, direction, horizon and UTC date.
  - The Polygon news ("Wall Street ratings") lane is parked behind `INGEST_POLYGON_NEWS=1`. A 210-article run produced 0 attributed ratings.
  - The demo adapter fallback was removed.
  - Scoring fixes:
    - `targetPrecision` is now signed, so a wrong-way call no longer scores 1.000, and it is null when no target exists;
    - the confidence multiplier is `0.75 + c/200`, clamped to 0.75–1.25, and a missing confidence counts as 1.0;
    - the leaderboard defaults to horizon `all` and excludes soft-deleted entities;
    - non-finite scores are rejected;
    - "Best in Current Conditions" reads the `eiv` rows.
  - Not fixed:
    - EIV's horizon bias: for the same record, the DEVLOG measured EIV 9.9 at 1 year against 0.8 at 30 days;
    - the fixed 0.4 regime penalty;
    - the unused anti-gaming check.
- **[PR #2](https://github.com/nmasamba/deepmint/pull/2) (2026-08-11): entity self-heal.** `ensureEntityForClerkUser` is idempotent. The webhook calls it, and so does the tRPC context whenever a signed-in user has no entity. The commit notes that no Clerk webhook endpoint was registered in production; the self-heal does not need one.
- **[PR #3](https://github.com/nmasamba/deepmint/pull/3) (2026-08-12): first-use read bugs.**
  - Cursor inputs now accept `null`; before this, every infinite query returned 400 on its first page.
  - `/api/trpc` became public in middleware, so public procedures answer signed-out callers.
- **[PR #4](https://github.com/nmasamba/deepmint/pull/4) (2026-08-13): no fabricated entry prices.**
  - With a key set, `getCurrentPrice` throws when both endpoints fail. The first production claim had recorded NVDA at the $950.00 dev fallback price.
  - The previous-day aggregate is tried first, because the snapshot endpoint returns 403 on the current plan.
- **[PR #5](https://github.com/nmasamba/deepmint/pull/5) (2026-08-14): landing stats.** `entity.stats` counts only active claims and non-deleted entities, and `SocialProof` is off the landing page until launch.

## October 2026 — Extractor integrity, backfill and CI

PRs #6, #8, #9 and #7 were merged in that order on 2026-10-05; detail is in CHANGELOG [0.10.0](docs/CHANGELOG.md#0100--extraction-integrity-backfill-fixes-ci-2026-10-05). The latest production deploy is `cd63901`.

- **[PR #6](https://github.com/nmasamba/deepmint/pull/6): extractor integrity.**
  - `max_tokens` went from 1024 to 4096. A reply that is truncated (`finish_reason: "length"`), empty, unparseable or missing its `claims` array now throws, so the fallback model and then Inngest retries take over.
  - `extract-claims` isolates failures per event and lists them in `failedEventIds`. Nothing re-drives them.
  - Migration 0007 adds `claims.horizon_stated` and `claims.source_excerpt`. Each is stored only if it is found verbatim in the source. The migration was applied to Supabase on 2026-10-05.
  - The evidence gate decides `active` versus `pending_review` (see [Sprint 2, Superseded](#superseded)).
  - Both models now use the router's `:fastest` policy. The pinned Groq Llama fallback had started returning 404.
  - The logs name the model and provider that answered, for example `[extractor] Answered by openai/gpt-oss-120b:fastest (cerebras)`.
- **[PR #8](https://github.com/nmasamba/deepmint/pull/8): claim inserts.**
  - Confidence is rounded and clamped to an integer from 0 to 100; values in (0, 1] are read as fractions.
  - All of a post's claims are written in one all-or-nothing insert, with dedupe inside the batch.
- **[PR #9](https://github.com/nmasamba/deepmint/pull/9): CI.** `pnpm/action-setup` reads the pnpm version from `packageManager`. CI had failed at pnpm setup since August and was green on this PR. It type-checks scoring and shared, tests scoring, shared and ingestion, and builds web.
- **[PR #7](https://github.com/nmasamba/deepmint/pull/7): backfill and active-only outcomes.**
  - Backfill matures only `active` claims.
  - Event insert and extraction are separate steps, so a retry recovers the whole post. A post that fails every attempt is skipped, and posts naming no Mag-7 company skip extraction.
  - Scores, the digest and landing stats count only the outcomes of active claims.

---

## State on 2026-10-05

- **Production:** https://www.deepmint.ai, served by Vercel project `deepmint-web-7ald` and built from `main`.
  - Auth runs on a Clerk **development** instance (`pk_test_` keys).
  - Supabase has migrations 0000–0007. Schema changes are applied by hand in the Supabase SQL editor; 0007 was applied and verified on 2026-10-05.
  - The Inngest app `deepmint` is synced through the Vercel integration.
- **Keys:** last recorded on 2026-07-02 in [docs/EXTERNAL_KEYS.md](docs/EXTERNAL_KEYS.md); they could not be re-verified on 2026-10-05.
  - Set: `DATABASE_URL`, Clerk, `POLYGON_API_KEY`, `HF_API_KEY`, Inngest.
  - Empty: Upstash, Sentry, R2, SnapTrade, Resend.
- **Ingestion:** the weekday ingest does nothing unless one of the two lanes is configured:
  - RSS needs Guides with `is_allowlisted=true` and a `source_url`, set by hand in SQL;
  - the Polygon news lane needs `INGEST_POLYGON_NEWS=1`.
- **Tests without keys:** scoring 87, shared 16, api 5, ingestion 56 (6 live LLM tests skip without `HF_API_KEY`), web 18 skipped.
- **Open issues to know first:**
  - Self-logged claims are entered at the previous close, so a Player can book a price move they have already seen.
  - The leaderboard page waits about 3 minutes for an uncached regime lookup (about 25 throttled Polygon calls) on every view while Upstash is unset.
  - Leaderboards have no minimum sample size.
  - `claims/created` fires only for self-logged claims.
  - The `packages/api` Inngest clients do not map the `INNGEST_WORKFLOW_` keys. This matters only if production lacks an unprefixed `INNGEST_EVENT_KEY`, which is not verified.
  - Sentry and R2 are inert.
  - The digest reaches no one.

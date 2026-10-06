# Changelog

All notable changes to Deepmint are recorded here, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/). Versions are not tagged in git: from 0.8.0 on, each entry names the commits or pull requests it covers (`git log --first-parent origin/main`). Reasoning and verification notes live in [DEVLOG.md](DEVLOG.md).

Entries before 0.8.0 are kept as history. Where one was wrong about the code at the time, it now carries a dated *Correction* note; a wrong count, time or name was fixed in place. [Unreleased] lists every such fix.

---

## [Unreleased]

### Added
- **Stored daily market regime.** A new `market_regimes` table (migration 0008) holds one snapshot per weekday, written by the new `market-regime-snapshot` job at 21:30 UTC (16 Inngest functions in total). Scoring reuses that day's snapshot. Each snapshot records its indicators in basis points and lists any that were unavailable in `defaulted_fields`; a day where all three are unavailable is not stored.

### Fixed
- **MCP server answers at `/api/mcp`.** `createMcpHandler` had no `basePath`, so mcp-handler served only `/mcp` and every authenticated request returned 404; no agent tool had ever worked. It now passes `basePath: "/api"`. Closes `mcp-unreachable-basepath`.
- **The leaderboard no longer waits about 3 minutes.** `regime.current`, `leaderboard.bestInCurrentConditions` and MCP `get_current_regime` read the latest stored snapshot instead of making ~25 throttled Polygon calls on every view (measured locally: 177 s before, under 0.5 s after). With no snapshot yet they return nothing rather than a default. Closes `regime-lookup-on-interactive-pages`.
- **No made-up index values.** With a key configured, `getIndexSnapshot` threw no error and returned the dev constants (VIX 18, SPX 5300) when the index endpoints failed, and the current plan has no index data at all (both return 403). It now throws, the regime records VIX as defaulted, and the S&P 500 30-day return is measured on SPY, which the plan covers. The "yesterday" fallback also snaps to a trading day. Closes `index-fallback-fabricates-values`.

### Migration
- `0008_fixed_valeria_richards.sql`: `CREATE TABLE market_regimes`. No existing rows are touched. Apply it to Supabase before this ships.

---

## [0.10.1] — Documentation pass (2026-10-05)

Markdown docs and `.env.example` only; no application code changed. Statements were checked against the code at `cd63901` (= `origin/main`). How the audit was done, and the most serious findings, are in [DEVLOG.md](DEVLOG.md).

### Added
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md): the register of verified code issues, with evidence.

### Changed
- [README.md](../README.md) rewritten. Its setup could not work as written: `cp .env.example .env` creates a root `.env` that no tool reads, and it ran `db:generate` as a setup step.
- [EXTERNAL_KEYS.md](EXTERNAL_KEYS.md) covers every env var the code reads. Production status is given as last recorded (2026-07-02), because it could not be re-checked on 2026-10-05.
- [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md) rewritten; it named the old `openai/gpt-oss-120b:cerebras` pin.
- [SPRINT_LOG.md](../SPRINT_LOG.md) rewritten as an index of every phase; it covered only Sprints 1–2.
- All docs now state that Mag-7 only is the deliberate current scope, with expansion planned once the core product has matured; the Sprint 6 expansion tooling is described as dormant groundwork.
- [`.env.example`](../.env.example) lists every variable the code reads and the file each belongs in. `DATABASE_URL` uses port 5433, which `docker-compose.yml` publishes.
- [DEVLOG.md](DEVLOG.md): a new audit entry at the top. Repo links in the 2026-05-05 entries were written relative to the repo root and did not resolve from `docs/`; they now do.
- This changelog: added [0.8.0], [0.9.0] and [0.10.0], which cover everything merged since 2026-04-14. The misplaced "[Unreleased] — Sprint 2 Fixes" section is now [0.2.1].

### Fixed
- Corrected older entries that were wrong about the code at the time, with a *Correction (2026-10-05)* note or, for a count, time or name, in place:
  - 0.1.0: the first migration creates 17 tables, not 15; Facebook and X sign-in were never configured.
  - 0.2.0: snapshot capture and R2 upload were never called; a citation of an untracked spec file was replaced by the hash formula.
  - 0.2.1: the claims rate limiter logs no warning when Upstash is unset.
  - 0.3.0: the Polygon cache never cached prices; markout runs at 21:00 UTC and failed on every production run until 0.8.0; several scoring functions are called by no job.
  - 0.4.0 and 0.4.1: "current price" is the previous close; paper cash is checked only for buys; the equity curve has two points; the ticker page's target panels never render; digests go to a placeholder address and ignore `digestFrequency`; Sentry never loads; "Sign Up as a Guide" creates a Player; the "AI" wording is copy, not how scoring works.
  - 0.5.0: `bestInCurrentConditions` returned no rows until 0.9.0; regime filters and "Most Influential" always return empty boards; mirroring an ingested Guide logs no trades; `influence-aggregate` runs only on days a claim matures, not nightly.
  - 0.6.0: the `google/gemma-4-31B-it:fastest` default returned 404; the S&P list has 50 tickers; `requestTicker` is not rate limited and has no UI; approving a ticker request creates no instrument; the admin check calls Clerk for every non-admin; broker "verified" means only that an account is linked.
  - 0.7.0: the PWA manifest returns 404 and the offline page is never served.

---

## [0.10.0] — Extraction integrity, backfill fixes, CI (2026-10-05)

Pull requests [#6](https://github.com/nmasamba/deepmint/pull/6), [#8](https://github.com/nmasamba/deepmint/pull/8), [#9](https://github.com/nmasamba/deepmint/pull/9) and [#7](https://github.com/nmasamba/deepmint/pull/7), merged in that order on 2026-10-05. The production deploy is `cd63901`.

### Added
- **Evidence on every extracted claim** (#6). `claims.horizon_stated` holds the author's own horizon words and `claims.source_excerpt` a short verbatim quote. Each is stored only if `verifyVerbatim` finds it in the source text on token boundaries, after decoding HTML entities and collapsing whitespace ("$30" does not verify inside "$300"). `/admin/review` shows both as "Stated Horizon" and "Verified Quote".
- **`isExplicitHorizon`** (#6) accepts only a whole phrase that names the same grid duration ("3 months" → 90, "1 year" → 365, "12-month price target"). Vague ("near term"), ranged ("next 3-5 years"), calendar-dated ("by 2028"), approximate ("4 weeks", "a quarter") and bare spelled-out units ("one day", "a year") never pass.
- **Which model answered is visible** (#6). `extractClaims` and `processExtraction` return `model`, taking the provider from the router's `x-inference-provider` header, e.g. `openai/gpt-oss-120b:fastest (cerebras)`. Log lines, in Inngest run logs and the Vercel function logs for `/api/inngest`:
  - `[extractor] Answered by <model> (<provider>)`, or `provider not reported`;
  - `[extractor] Model <model> failed, trying next: <message>`;
  - per event: `Extracted from event <id> (<sourceKind>): N active, N pending review, N invalid, N duplicate via <model>`.

  Each `extract-<eventId>` step output includes `model`; the `extract-claims` run's final return value does not, and backfill ignores it.
- **`parseConfidenceScore`** (#8) rounds and clamps a claim's `confidence_score` to an integer 0–100, reading values in (0, 1] as fractions (0.85 → 85).
- Tests: `claimEvidence.test.ts`, `confidenceScore.test.ts`, and a live 7-call extraction (2,842 output tokens) that truncated under the old cap.

### Changed
- **Routing of extracted claims** (#6). A claim is `active` only if `extraction_confidence >= 0.8`, it is not a `wall_street_rating` without a resolved firm, and `isExplicitHorizon(verifyVerbatim(horizon_stated, source_excerpt), horizon_days)` holds, so the horizon words must sit inside the verified quote. Everything else is `pending_review`.
- **LLM output cap** 1024 → 4096 tokens (#6). 19% of real posts had overflowed 1024.
- **Default models no longer pin a provider** (#6): primary `openai/gpt-oss-120b:fastest`, fallback `meta-llama/Llama-3.3-70B-Instruct:fastest`. `:fastest` lets the Hugging Face router pick a live provider per request; the pinned fallback `meta-llama/Llama-3.3-70B-Instruct:groq` had started returning 404. An empty `LLM_MODEL` now means the default; an empty `LLM_MODEL_FALLBACK` disables the fallback.
- **A post's claims are written all-or-nothing** (#8): every claim is resolved first, then written in one multi-row `INSERT`. An in-batch key check still stores a call listed twice in one post once.
- **Backfill** (`apps/worker/functions/backfill.ts`, #7):
  - matures only `active` claims; claims held for review are matured by the daily markout once approved;
  - inserts the event and extracts its claims in separate steps, so a retry re-runs only the extraction;
  - skips and lists in `failedEventIds` a post whose extraction fails on every attempt, instead of failing the run;
  - skips the extract step for posts naming no Mag-7 company, keeping large archives under Inngest's 1,000-steps-per-run limit;
  - gives the ingest step a new ID, and reads active and pending counts from the table so they stay exact across retries.
- **Only outcomes of `active` claims count anywhere** (#7): `score.ts`, the daily digest's resolved outcomes and `entity.stats.outcomesCount` join outcomes to `status = 'active'` claims. The leaderboard reads `scores`, so it inherits this. Production had outcomes on active claims only (checked 2026-10-05), so no published score changed.
- **CI** (#9): `pnpm/action-setup@v4` gets no `version` input and reads `packageManager: pnpm@10.32.1` from `package.json`. The job uses Node 22, type-checks `scoring` and `shared`, tests `scoring`, `shared` and `ingestion`, and builds `apps/web`.

### Fixed
- A truncated (`finish_reason: "length"`), empty, unparseable or `claims`-less LLM reply was read as "no claims" (#6). `callExtractionLLM` now throws, the fallback model is tried, and if every model fails the error reaches Inngest's retries. A model failure never produces an empty result.
- One post that always failed stopped the rest of an `extract-claims` batch (#6). Each event's failure is caught once its step retries are spent, logged, and returned in `failedEventIds`.
- A fractional confidence (`0.85`, `72.5`) failed that claim's integer insert and aborted the rest of the post (#8).
- A failure partway through a post's one-by-one inserts left the earlier claims written; the retry then skipped the event and lost the rest (#8).
- Backfill gave `pending_review` claims outcomes, and scoring counted them (#7). On local data, one firm got 6 score rows and a 1.000 hit rate from claims nobody had approved.
- A retried backfill extraction found the event it had just inserted and returned early, leaving the post with 0 claims (#7). With #8, a retry now recovers the whole post.
- CI had failed at pnpm setup on every run since August, because the workflow's `version: 10` conflicted with `packageManager` (#9). It passed on #9.

### Migration
- `0007_cool_mercury.sql`: two `ALTER TABLE claims ADD COLUMN` statements, `horizon_stated text` and `source_excerpt text`; nullable, no default, no row updates.
- Applied to production Supabase and verified on 2026-10-05: paste the SQL into the Supabase SQL editor, then add the journal row `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('15441b1053e13f3e0c9ebeb90b35c3111cbe435b340026298a8fc7219ce654d0', 1791195622034);` (SHA-256 of the `.sql` file, and its journal `when`). Drizzle compares only the latest row's `created_at` with each migration's `when`, so journal rows must be added in migration order.

### Operations
- `LLM_MODEL` and `LLM_MODEL_FALLBACK` were deleted from Vercel and the local `.env.local` on 2026-10-05, so the code defaults apply. Re-add them only as an emergency override: a pinned `model:provider` disables the router's failover.

### Known limits
- Seven calls with quotes use about 70% of the 4096-token cap. A post with roughly 10+ calls can still overflow; it now fails loudly for that one event.
- A model that drops words from a phrase it was told to copy ("12 months" out of "6 to 12 months") can still pass if the shortened words sit inside its quote.
- Failed extractions are never re-driven automatically: `failedEventIds` exists only in run output. Re-sending a backfill archive skips a failed post, because its event already exists.
- Cross-source dedupe ignores claim status, so a `pending_review` or `rejected` copy can block a later, evidenced one.

---

## [0.9.0] — First production use: attribution, scoring fairness, first-use fixes (2026-08-14)

Pull requests [#1](https://github.com/nmasamba/deepmint/pull/1) to [#5](https://github.com/nmasamba/deepmint/pull/5), merged 2026-08-03 to 2026-08-14. Every production table was empty when #1 merged, although the operator had already signed in; the first real entity and claim came on 2026-08-11.

### Added
- **Rating attribution** (#1). A rating is credited to the firm that issued it, not the publication that carried it: `events.entity_id` keeps the carrier, and `claims.entity_id` is the firm, resolved or created as a Guide by `resolveOrCreateGuide`. This applies in every lane.
  - `claims.source_kind` (`self_logged`, `analyst_feed`, `wall_street_rating`), `claims.rating_grade`, `claims.rating_action`, `claims.analyst_name` and `events.publisher` (migration 0006).
  - `isValidAnalystFirm` rejects publications (Yahoo, Reuters, Bloomberg, CNBC and others) as the issuing firm. The news lane still creates a Guide entity for each publisher, as the carrier on `events`; a `wall_street_rating` claim with no resolved firm stays on that carrier and goes to `pending_review`.
  - `parseRatingDate` rejects malformed and overflow (`2026-02-31`) dates, dates more than a day ahead and dates over 5 years old. A claim with a rating date is backdated to 00:00 UTC that day and priced at the close of that day, or of the last weekday before it.
  - Cross-publication dedupe: a claim is skipped if a stored claim has the same entity, instrument, direction, horizon and UTC date.
- **Wall Street ratings lane** (#1): `PolygonNewsSourceAdapter` reads Polygon news on the existing key, using each article's own publish time as `capturedAt`. It runs only when `INGEST_POLYGON_NEWS === "1"`, and is off: a live run over 210 articles produced 0 attributed ratings.
- **`target_coverage`** Guide metric (#1): the share of a Guide's scored outcomes whose claim published a target.
- **`ensureEntityForClerkUser`** (`packages/db/queries/`, #2), called by the Clerk webhook and by a new self-heal step in the tRPC context. If a signed-in user has no entity on their first tRPC request, the context fetches the Clerk user and creates the Player; the Clerk lookup runs only on that miss. An existing row is returned unchanged. Concurrent first requests resolve to one row, and slug collisions get a random 5-character suffix.

### Changed
- **`confidenceMultiplier`** (#1) is `0.75 + clamp(confidence, 0, 100)/200`, range 0.75–1.25; a null confidence counts as 1.0, the same as 50. Before, `0.5 + c/200` applied only to non-null values, so stating any confidence below 100 lowered a claim's consensus weight, and a confidence of 10000 multiplied it by 50.5.
- **`targetPrecision`** (#1) is a signed ratio and returns `null` (not 0) when no target was published; the `target_precision` row is then omitted. The function accepts a `minMoveFrac` floor, but `score.ts` never passes one, so only targets equal to the entry price are skipped.
- **`getCurrentPrice`** (#4) tries the previous-day aggregate before the snapshot (which returns 403 on the current plan). Both return the previous session's close. Measured claim submission time fell from 13.0 s to 0.6 s.
- **`entity.stats`** (#5) counts only `active` claims and excludes soft-deleted entities. The landing page's stats section (`SocialProof`) is hidden until launch.
- `polygonRateLimit` is exported, so news and price calls share one 12.5 s throttle per process (#1). It is check-then-sleep, not a queue: concurrent callers fire together.

### Removed
- The demo adapter fallback in `ingest-sources` (#1). An unconfigured environment now does nothing instead of writing fabricated claims into the append-only ledger.

### Fixed
- `targetPrecision` scored a long from 100 with a 120 target that closed at 80 as a perfect 1.000, because it took `Math.abs` of both moves (#1).
- `addScore` drops non-finite values (#1). A `NaN` was stored as the string `'NaN'`, which Postgres sorts above every number, so it would have ranked first.
- `leaderboard.bestInCurrentConditions` had never returned a row: it matched the regime against `eiv_overall`, which has no regime tag (#1). It now reads the regime-tagged `eiv` rows.
- `leaderboard.top` defaults to horizon `all` (#1). Before, an entity appeared once per scored horizon, up to 7 times for `hit_rate`.
- `ticker.overview`'s Top Guides and Top Players use only the latest `as_of_date` (#1). Before, one Guide could fill all five slots.
- Soft-deleted entities are excluded from `leaderboard.top`, `byTicker`, `bestInCurrentConditions` and the ticker top lists (#1), and from `entity.stats` (#5). No code sets `entities.deleted_at` yet, and the REST v1 leaderboard, consensus, profiles and search do not filter on it.
- The Clerk webhook's plain insert hit the `clerk_user_id` unique constraint on every Clerk retry or replay and returned 500 (#2). A redelivery is now a 200 no-op.
- Infinite queries returned 400 on their first page (#3). tRPC v11 with React Query v5 sends `cursor: null`, and all 8 cursor schemas were `z.string().optional()`; they are now `.nullish()`. `claims.list` and `social.feed` had never worked before this.
- Signed-out calls to `/api/trpc`, including the landing page's `entity.stats`, got a Clerk 404 that the edge cached (#3).
- With `POLYGON_API_KEY` set, `getCurrentPrice` returned the hard-coded dev price when both Polygon calls failed (#4). The first production claim (NVDA long, 2026-08-11) stored $950.00 against a real $217.50. It now logs each failure and throws with both errors; the dev prices remain only when no key is set.
- The landing page counted a rejected claim in "Predictions Tracked" (#5).

### Security
- `/api/trpc(.*)` is public in middleware (#3); each procedure enforces its own auth. Every `publicProcedure` (25 today) answers anonymous callers. Among them, `entity.bySlug` and `entity.search` return the full `entities` row, including `clerk_user_id` and `snaptrade_user_id`, and `claims.detail` returns claims in any status.

### Migration
- `0006_cultured_junta.sql`: enums `source_kind`, `rating_grade`, `rating_action`; columns `claims.source_kind`, `claims.rating_grade`, `claims.rating_action`, `claims.analyst_name` (varchar 200) and `events.publisher` (varchar 200). All nullable, no defaults, so existing rows are untouched. Applied to production Supabase before #1 merged.

### Operations
- Production auth runs on a Clerk development instance (`pk_test_` keys). PR #3's production logs show the first entity created by the tRPC self-heal; maintainer notes from 2026-08-11 say no production Clerk webhook endpoint was registered.
- The 7 Mag-7 instruments were seeded in production on 2026-08-11. Never run the full `db:seed` against production: it also writes fictional Guides and 100 fake claims into the append-only ledger.

### Not fixed
- EIV is not horizon-neutral: it multiplies a hit-rate edge by a mean return measured over the claim's own window. Identical hit rate and sample size give EIV 9.9 at 1 year and 0.8 at 30 days.
- EIV is not regime-aware in practice: `score.ts` passes an empty regime history, so the 0.4 shrinkage always applies and `eiv` equals `eiv_overall`.
- `checkAntiGaming` is called by no job, so no minimum-sample or eligibility gate exists.
- With a key, index lookups for regime detection still fall back to fixed values (VIX 18, SPX 5300) when both index calls fail.
- An entry-price lookup that fails during extraction or backfill is swallowed: the claim is stored with a null entry price and never gets an outcome.

---

## [0.8.0] — Logic-error audit, extraction hardening, backfill, MCP, production wiring (2026-07-03)

Commits on `main` from 2026-05-04 to 2026-07-03 (`dee6b3a` … `a050e58`), before pull requests were used. Production went live on Vercel in this period.

### Added
- **Historical backfill** (`8c6a588`). `historical-backfill`, triggered by `backfill/requested`, resolves or creates a Guide per analyst handle, inserts each archived post as an event with its original date, extracts it with `created_at` = the post's `publishedAt` and that day's closing price as entry, matures the claims against historical prices (one outcome per claim, at its horizon; no notifications) and sends `markouts/completed` if it wrote any outcomes. Operator trigger: `pnpm --filter @deepmint/worker backfill <archive.json>`. Since 0.10.0 it matures only `active` claims.
  - `resolveOrCreateGuide` (`packages/ingestion/src/sources/resolver.ts`) maps a source handle to a Guide, keyed on `source_url`, then slug. Ingested Guides have `clerk_user_id` null and `is_allowlisted` false.
  - `RssSourceAdapter`, the first real source adapter (`rss-parser` over plain HTTP, no headless browser; 15 s timeout per feed; Mag-7 pre-filter). `ingest-sources` builds it from Guides with `is_allowlisted = true` and a `source_url`. No API or UI sets either field, so this lane is switched on by editing the database.
  - `computeMarkoutForClaim` (`apps/worker/functions/markoutClaim.ts`), the per-claim outcome math shared by markout and backfill.
- **MCP server** at `/api/mcp` (`92ec088`), built on `mcp-handler`. Read tools: `get_current_regime`, `get_consensus`, `get_leaderboard`, `get_entity_track_record` (returns only the raw entity row), `search_instruments`. Write tools: `submit_claim`, `add_note`, which need the `claims:write` scope and act as the admin who created the key (`api_keys.created_by`). Tools call the tRPC routers through a new server-side `createCaller`. Auth is a `dm_live_` key with at least `consensus:read`.
  - **Tool calls have never worked.** `createMcpHandler` gets no `basePath`, so mcp-handler 1.1.0 answers only at `/mcp`, and every authenticated request to `/api/mcp` returns 404. Only the 401 auth gate was ever smoke-tested.
- **Model fallback** (`2070eb5`): `extractClaims` tries `LLM_MODEL`, then `LLM_MODEL_FALLBACK`. Benchmark harness: `packages/ingestion/scripts/bench-providers.ts`.
- `mentionsMag7()` pre-filter (`dc2d8e3`): text naming no Mag-7 company skips the LLM call.
- `docs/EXTERNAL_KEYS.md` and `docs/NEXT_SESSION_PROMPT.md` (`3ae4166`).

### Changed
- **Extraction requests** (`dc2d8e3`): JSON mode (`response_format: json_object`), retried once without it on a 400 or JSON-related error; a 120 s timeout and 2 SDK retries per call, replacing the SDK's 10-minute default; `max_tokens` 1024 (4096 since 0.10.0).
- **Extraction is idempotent** (`dc2d8e3`): an event that already has claims is skipped with no LLM call, so worker retries cannot duplicate append-only claims.
- **Default model** (`dc2d8e3`, `2070eb5`). `dc2d8e3` replaced the `google/gemma-4-31B-it:fastest` default, which returned 404, with `Qwen/Qwen3-235B-A22B`. `2070eb5` then found Qwen deprecated on the Hugging Face router (410 from Together and Fireworks, connection errors on default routing). The default became `openai/gpt-oss-120b:cerebras` (722 ms in the benchmark) with fallback `meta-llama/Llama-3.3-70B-Instruct:groq`, and production `LLM_MODEL`/`LLM_MODEL_FALLBACK` were set to these on 2026-06-26 (`51ec6ad`). Superseded by the `:fastest` defaults in 0.10.0.
- **Vercel** (`dee6b3a`, `6bafd9a`). Project `deepmint-web-7ald` builds `apps/web` from `main`. The root `vercel.json` uses `cd ../.. && …`, which only makes sense with Root Directory `apps/web`. `.vercel` and `.env*.local` are gitignored. `packages/db/run-migration.mjs` was added; do not use it, since it hard-codes the main checkout's path and exits 0 on failure.
- `.env.example` names `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`; the `INNGEST_API_KEY` it listed does not exist (`09ef99e`).

### Fixed
- **Logic-error audit** (`875bb08`): 25 confirmed defects across scoring, workers, API and ingestion; 3 calibration items deferred (see [DEVLOG.md](DEVLOG.md)). The main fixes:
  - `return_bps` is position P&L, negated for shorts. It had stored the raw price move, which gave every short the wrong sign in `avg_return_bps`, Sharpe, Calmar, CVaR, notifications and claim-card colours.
  - `stripJsonFences` accepts bare fences and trailing newlines; common LLM output had been silently dropped.
  - Entity-type filters run in SQL before `LIMIT` in `leaderboard.top`, `bestInCurrentConditions`, `byTicker` and `GET /api/v1/leaderboard`.
  - `merkle-audit` hashes the previous complete UTC day; claims created 22:00–24:00 UTC had been left out of every root.
  - Broker re-syncs check a natural key before inserting, so they no longer duplicate `player_trades`.
  - EIV's fallback branch uses the overall claim count as its sample size (it had always produced 0), and a net-negative average return now pulls EIV to 0 instead of being made positive by `Math.abs`.
  - Regime 30-day legs snap to completed trading days.
  - Rank-change notifications compare with the most recent earlier scoring date, not a literal 24 h ago.
  - Signal-simulate counts open shorts as committed capital.
  - `influence-track` measures lag from the claim's stored `created_at`, not `now()`.
  - Also: the instruments keyset cursor, regime history by frequency, SnapTrade's signed `units`, `myInfluencers` (latest score) and `topInfluencers` (tickers, not UUIDs), follower-count cache invalidation, consistent paper P&L, `target_price` must be finite and > 0, an exact bull/bear consensus tie is neutral, and the undeclared-leverage bypass in `checkAntiGaming`, which no job calls.
- **`markout-computation` failed on every production run** (`a050e58`). It bound a JS `Date` against a raw SQL interval expression, which the postgres.js serializer rejects before any row is read. The filter is now `created_at + horizon_days <= now()` in SQL.
- **Inngest production wiring** (`de5d32a`, `e576c64`, `3b23fc2`):
  - The Vercel–Inngest integration provides `INNGEST_WORKFLOW_INNGEST_EVENT_KEY` and `_SIGNING_KEY`. `apps/web/app/api/inngest/inngest-env.ts`, imported first by the serve route, copies them onto the standard names before `inngest/next` loads; a copy inside the route ran too late ("no signing key found"). `apps/worker/inngest.ts` holds the same mapping.
  - `/api/inngest(.*)` is public in middleware; Clerk had answered Inngest Cloud with 404. The route is verified by the signing key.
  - Result: `GET /api/inngest` reported a signing key, 15 functions and `mode: "cloud"`.
  - Gaps: production builds resolve `../inngest` to a stale committed `apps/worker/inngest.js` that lacks the mapping, so only `inngest-env.ts` does the work. The `packages/api` routers build their own Inngest clients without the mapping; if production holds only the prefixed keys (unverified), `claims/created` and `social/followed` sends fail silently and admin instrument creates throw after inserting rows.

### Deferred
- Consensus conviction reports a 50/50 split as about 0.31; the regime `rotation` threshold (0.15) rarely fires on live sector dispersion; `influence-aggregate`'s 30-day window is non-deterministic at the sub-second boundary.

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
- **PWA manifest + service worker** — `manifest.json` with standalone display, dark theme color, 192px/512px icons. `@serwist/next` integration for service worker (disabled in development). Offline fallback page at `/offline`. Apple Web App meta tags added to root layout. *Correction (2026-10-05): `/manifest.json` returns 404 to every visitor, because the middleware matcher runs on `.json` paths and the manifest is not a public route (browsers fetch it without cookies). `/offline` is never precached, so the fallback is never served.*

### Changed
- Scoring worker and regime router now fetch live VIX, S&P 500, and sector ETF data instead of using hardcoded placeholders.
- `Topbar` now accepts `isAdmin` prop from the server layout for mobile nav admin section visibility.

---

## [0.6.0] — Sprint 6: B2B API, Proof-of-Skin, Instrument Expansion (2026-04-09)

### Changed
- **LLM extraction model** switched from `Qwen/Qwen3-235B-A22B` to `google/gemma-4-31B-it:fastest` (HuggingFace router). The `:fastest` suffix routes to the lowest-latency provider currently serving the model. Observed extraction time dropped to 7–26s per call (previously 18–60s+ with intermittent cold-start timeouts). `LLM_MODEL` env var still overrides the default. *Correction (2026-10-05): commit `dc2d8e3` (0.8.0) found that this default returned 404 when `LLM_MODEL` was unset and restored `Qwen/Qwen3-235B-A22B`. Later defaults are in 0.8.0 and 0.10.0.*
- **Extractor test timeouts** raised from 60s/120s to 180s per test to give cold-start calls sufficient headroom on any upstream provider.

### Security
- **Admin role moved from `publicMetadata` to `privateMetadata`** — the admin role flag was previously readable from any client-side `useUser()` call, exposing admin identity in JS bundles. Now stored in Clerk `privateMetadata.role` (server-only). Admin checks in `apps/web/app/(app)/layout.tsx` and `apps/web/app/api/trpc/[trpc]/route.ts` use a two-tier lookup: first try the `sessionClaims.metadata` fast path (requires Clerk session token customization exposing `{{user.private_metadata}}` as `metadata`); fall back to `clerkClient().users.getUser(userId).privateMetadata.role` via the backend API if the claim is absent. `Sidebar` no longer calls `useUser()` — it accepts `isAdmin: boolean` as a server-resolved prop, so the `"admin"` string never lands in the client bundle. *Correction (2026-10-05): the backend lookup runs whenever the claim does not say `admin`, so it runs on every signed-in non-admin request to `/api/trpc` and every full page load, not only when the claim is absent.*

### Fixed
- **B2B API was unreachable** — Clerk middleware was protecting `/api/v1/*` with session auth, blocking all Bearer-token requests. Added `/api/v1(.*)` to the `isPublicRoute` matcher in `apps/web/middleware.ts` so these routes are authenticated via the Bearer API key pipeline instead of Clerk.
- **Consensus endpoint leaked internal UUID** — `GET /api/v1/instruments/{ticker}/consensus` was returning `instrument.id` because the handler spread the full DB row into the response. Now constructs an explicit `publicInstrument` projection (ticker/name/exchange/assetClass/sector only) matching the OpenAPI schema.
- **Clerk sign-in/sign-up icon inversion broke Google logo** — the `socialButtonsProviderIcon` filter (`brightness(0) invert(1)`) was intended to whiten Apple's black logo but was applied to every provider, turning Google's multicolor G into a white-on-white blank box. Scoped the filter to `socialButtonsProviderIcon__apple` only in both auth pages.
- **Clerk "Last used" pill was dark-on-dark** — Clerk's default badge text color is unreadable on the dark theme. Added a scoped global CSS override in `apps/web/app/globals.css` matching `.cl-rootBox [class*="cl-badge"]` / `[class*="cl-internal"][class*="badge" i]` to force `color: var(--color-text-primary)` with `!important`. (The `badge` element key in Clerk's appearance API didn't match this element, so targeting by class attribute was the reliable path.)


### Added
- **Expand Beyond Mag 7** — admin-driven instrument universe expansion
  - *Status (2026-10-05): dormant by design.* Deepmint stays Mag-7 only until the core product has matured; this tooling is groundwork for that later step. Extraction and ticker pages never left Mag-7.
  - New `ticker_requests` table (pending/approved/rejected) for user-submitted tickers
  - Seed file `packages/db/seed/sp500-top50.ts` with 50 S&P 500 tickers beyond Mag 7 (JPM, V, MA, LLY, UNH, AVGO, ORCL, XOM, and others with sector/industry metadata); with the Mag 7 that makes 57 instruments. They are added only by the "Seed S&P 500 Top 50" button, never by `db:seed`.
  - `instruments` router extended with admin procedures: `adminList`, `adminCreate`, `adminBatchCreate` (idempotent, emits `instruments/batch-added` event), `adminToggleActive`, `requestTicker` (user-facing; one pending request per user and ticker), `listRequests`, `reviewRequest`. *Correction (2026-10-05): `requestTicker` is not rate limited, and no page calls it. `reviewRequest` only changes the request's status; approving creates no instrument.*
  - Real admin check in `adminProcedure` via Clerk `privateMetadata.role === "admin"` (replaces prior placeholder; see Security section below for the move from `publicMetadata`)
  - `backfill-prices` Inngest worker: on `instruments/batch-added`, validates Polygon.io historical coverage by fetching 365 days of daily bars; deactivates instruments with no data
  - Admin page `/admin/instruments` with Instruments and User Requests tabs, active toggle, "Seed S&P 500 Top 50" button, approve/reject workflow
  - Sidebar admin section (Shield/Database/KeyRound) conditionally rendered for admins
- **Proof-of-Skin (SnapTrade broker verification)** — read-only broker linking
  - `entities.snaptradeUserId` column; SnapTrade credentials stored in `brokerLinks.metadata` jsonb
  - `snaptrade-typescript-sdk` added to `@deepmint/api`
  - `packages/api/lib/snaptrade.ts` — SDK wrapper exposing only read-only methods: `getSnapTradeClient`, `registerUser`, `getLoginLink`, `listAccounts`, `getAccountActivities` (BUY/SELL filter), `deleteUser`. Returns null when credentials are unconfigured for graceful degradation.
  - `broker` tRPC router with 5 procedures: `initLink`, `completeLink`, `status`, `disconnect` (preserves trade history, revokes SnapTrade user), `syncTrades` (rate limited 1/hour, inserts verified `playerTrades`). *Correction (2026-10-05): `completeLink` marks the entity `verified` as soon as SnapTrade lists any account; synced trades are stored, but nothing compares them with claims or reads them for scoring.*
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
  - Inngest worker: auto-logs paper trades on `claims/created` events (1% allocation per signal). *Correction (2026-10-05): only self-logged claims (`claims.submit`) emit `claims/created`, so mirroring an ingested Guide never logs a trade.*
  - Signal Simulate page with ComparisonChart (Recharts) showing signal vs own portfolio
  - "Mirror Signals" button on entity profile headers
  - Sidebar navigation item
- **Regime-Aware Leaderboards** — Filter leaderboard by market regime
  - `regime` tRPC router: `current` (detects regime via VIX/S&P thresholds), `history` (regime tags over time)
  - `bestInCurrentConditions` leaderboard procedure: top entities by EIV within current regime. *Correction (2026-10-05): it returned no rows until 0.9.0, because it matched the regime against `eiv_overall`, which has no regime tag.*
  - RegimeBadge component (bull=green, bear=red, high_vol=amber, low_vol=blue, rotation=purple)
  - BestInRegime featured section on leaderboard page
  - Regime filter buttons alongside existing metric filters. *Correction (2026-10-05): every regime filter returns an empty board, because only `eiv` score rows carry a regime tag and no leaderboard metric chip is `eiv`.*
- **Shadow Order Book (Influence Graph)** — Tracks who moves retail liquidity
  - `detectInfluenceEvents` pure scoring function (packages/scoring) with 8 unit tests
  - `influence-track` Inngest worker: real-time detection on `claims/created`
  - `influence-aggregate` Inngest worker: nightly 30-day aggregation on `scoring/completed`. *Correction (2026-10-05): it is not nightly. `scoring/completed` follows only a markout (or backfill) that wrote at least one outcome, so on days when no claim matures neither influence nor consensus is recomputed.*
  - `influence` tRPC router: `topInfluencers`, `byGuide`, `myInfluencers` (aggregated only — raw events never exposed)
  - Influence tab on Guide profiles (follower count, events, avg response time, top instruments)
  - TrendingInfluencers dashboard widget
  - "Most Influential" metric added to leaderboard. *Correction (2026-10-05): the board is always empty; it queries `scores`, but `influence_events_30d` exists only in `influence_scores`.*
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
- **Landing Page Rewrite** — Complete messaging overhaul emphasising AI-powered analyst ranking and dual user paths (Guide / Player). *Correction (2026-10-05): the "AI" wording below is marketing copy. Scoring is deterministic statistics; the only model in the system is the LLM used for claim extraction.*
  - Hero: "Follow the market's smart movers. Or better yet, become one." — left-aligned layout with compact logo
  - How It Works: "Choose Your Path → AI Scores the Outcome → The Best Rise the Ranks"
  - New **ChoosePath** section — side-by-side Guide ("I'm an Analyst") and Player ("I'm a Trader") cards with dedicated sign-up CTAs. *Correction (2026-10-05): both buttons link to plain `/sign-up`, and every sign-up becomes a Player; no flow creates or claims a Guide.*
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
- **Ticker Page Redesign** — Full layout: header with live price, large consensus signal badge with conviction meter, consensus breakdown (Recharts donut chart + stats), top entities panels, recent claims, watch button. *Correction (2026-10-05): the header price is the previous session's close, not a live price.*
- **ConsensusBreakdown** — Recharts PieChart (donut) with weighted bullish/bearish/neutral percentages, raw counts, avg target vs current, dispersion. *Correction (2026-10-05): the avg-target and dispersion panels never render, because the consensus worker never writes `avg_target_price_cents` or `target_dispersion_bps`.*
- **TopEntitiesPanel** — Ranked entity list with avatar, name, verified badge, metric value
- **Non-Mag-7 Guard** — Ticker pages for non-Mag-7 symbols show "Coming soon" state

- **Paper Router** (`packages/api/routers/paper.ts`) — 6 tRPC endpoints:
  - `createPortfolio` (max 5), `myPortfolios` with summary stats
  - `addTrade` with cash balance validation, `closeTrade` at current market price. *Correction (2026-10-05): "current market price" is `getCurrentPrice`, which returns the previous session's close; cash is checked only for buys.*
  - `portfolioDetail` with all trades + available cash, `portfolioPerformance` with equity/P&L/return bps
- **Paper Portfolio Page** — Split layout: portfolio list (create/select) + detail view
  - Positions table (open/closed), P&L tracking, equity curve (Recharts LineChart). *Correction (2026-10-05): the equity curve has two points, starting balance and current equity.*
  - NewTradeForm dialog with instrument search, side toggle, quantity input

- **Email Digest Worker** (`apps/worker/functions/digest.ts`) — Inngest cron (noon UTC weekdays): gathers new claims + outcomes from followed entities, sends via Resend. *Correction (2026-10-05): it sends to the placeholder `user+<clerkUserId>@deepmint.app`, never the user's real address, so no digest reaches a user; it skips entirely without `RESEND_API_KEY`.*
- **Email Preferences Schema** (`packages/db/schema/emailPreferences.ts`) — `digestEnabled`, `digestFrequency` per entity
- **Settings Page** — Email notification toggle (daily/weekly digest) with frequency selector. *Correction (2026-10-05): the digest worker never reads `digestFrequency`.*

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
- **Sentry Integration** — Client, server, and edge config files for error tracking. *Correction (2026-10-05): the configs are never loaded (no `instrumentation.ts`, no `withSentryConfig`), so Sentry has never reported an error and setting `NEXT_PUBLIC_SENTRY_DSN` alone does nothing.*

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
- **Polygon Cache** (`packages/shared/src/polygonCache.ts`) — Redis cache layer (Upstash) with 1hr historical / 5min current TTLs, graceful bypass when unconfigured. *Correction (2026-10-05): no price function has ever called it, so prices are never cached. Its only user is the regime-indicator lookup, from 0.7.0.*
- **Markout Worker** (`apps/worker/functions/markout.ts`) — Inngest cron (21:00 UTC weekdays; 17:00 EDT, 16:00 EST): resolves expired claims with entry/exit prices, return bps, direction correctness, target hit detection. *Correction (2026-10-05): it failed on every production run until 0.8.0 (`a050e58`).*
- **Scoring Package** (`packages/scoring/src/`) — 7 pure-function modules:
  - `player.ts` — Sharpe ratio, Calmar ratio, CVaR5, max drawdown, consistency score, MAE/MFE
  - `guide.ts` — Hit rate, avg return bps, z-test significance, Brier score, target precision, continuous Brier, time-decayed Brier
  - `anti-gaming.ts` — Minimum thresholds (30 trades, 90 days), kurtosis/turnover/leverage penalties
  - `consensus.ts` — Weighted consensus signal (Guide ×1.2, broker-verified ×1.5, recency decay, confidence boost)
  - `regime.ts` — Market regime detection (bull/bear/high_vol/low_vol/rotation) from VIX, S&P return, sector dispersion
  - `eiv.ts` — Regime-Aware Expected Information Value with Bayesian shrinkage
  - `utils.ts` — avg, stddev, normalCDF
  - *Correction (2026-10-05): no job calls `checkAntiGaming`, `maeAndMfe`, `calmarRatio` (Calmar is computed inline), `continuousBrierScore`, `timeDecayedBrierScore`, `computeSliceOutcome` or `formatEIVWithContext`. Anti-gaming is not applied, and `outcomes.brier_slices` is never written.*
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

## [0.2.1] — Sprint 2 Fixes + Env Remediation (2026-04-03)

### Known Issues
- ~~`CLERK_WEBHOOK_SECRET` not configured~~ — **Resolved 2026-04-03** via ngrok tunnel + Clerk Dashboard
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` not configured — rate limiting on claim submission is bypassed (graceful degradation)
- `POLYGON_API_KEY` not configured — using hardcoded dev fallback prices; needed for Sprint 3 live scoring

### Added
- Installed **ngrok** for local Clerk webhook tunnelling
- Configured Clerk webhook endpoint (`/api/webhooks/clerk`) with signing secret — entity auto-creation on sign-up now functional
- Created `docs/CHANGELOG.md` and `docs/DEVLOG.md` for ongoing project documentation and issue tracking
- `@deepmint/db` now re-exports drizzle-orm operators (`eq`, `desc`, `and`, `or`, etc.) for consistent single-instance usage
- Rate limiter is skipped when `UPSTASH_REDIS_REST_URL` is not configured. *Correction (2026-10-05): no warning is logged.*

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
- **LLM Extraction** (`packages/ingestion/src/extractor.ts`) — HuggingFace Inference API (OpenAI-compatible) with Qwen/Qwen3-235B-A22B, structured JSON extraction, Mag 7 ticker validation, confidence-based routing. (Default model later changed in 0.6.0, 0.8.0 and 0.10.0.)
- **Content Hashing** (`packages/ingestion/src/hasher.ts`) — `sha256(JSON.stringify({url, text, ts}))`, where `ts` is the capture time in ISO format
- **Merkle Audit** (`packages/shared/src/merkle.ts`) — `computeClaimLeafHash()` + `buildMerkleTree()` for immutability proof
- **Snapshot Storage** (`packages/ingestion/src/r2.ts`) — Cloudflare R2 client (S3-compatible)
- **Web Capture** (`packages/ingestion/src/capture.ts`) — Playwright headless + fetch fallback. *Correction (2026-10-05): no worker has ever called capture or R2 upload, so `events.snapshot_path` is always null.*
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
- Drizzle ORM with PostgreSQL 16 — 17 tables (migration `0000_medical_hammerhead.sql`) including: entities, instruments, claims, events, outcomes, notes, audit_roots, consensus_signals
- Clerk authentication. *Correction (2026-10-05): sign-in methods are set in the Clerk dashboard, not in code; Facebook and X sign-in were never configured.*
- Entity CRUD: Guide and Player profile pages with tabs
- Instrument browser with search
- Sidebar navigation + Topbar with user controls
- Database seeding with Mag 7 instruments + demo entities
- Dark-mode-only design system with teal accent

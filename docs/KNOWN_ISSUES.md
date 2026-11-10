# Known issues

The register of verified defects in Deepmint's code, from the coherence audit of **2026-10-05**. Every entry was checked against `main` at `cd63901` (after PRs #6–#9). It lists **21 open issues: no high, 2 medium and 19 low**. Docs drift that this docs update fixed is listed at the end, under [Fixed by this docs update](#fixed-by-this-docs-update).

## How this register was produced

1. **Code map.** Six readers each mapped one area (product, server interfaces, workers, ingestion, scoring and data model, infrastructure) and cited `path:line` for every fact. A critic pass spot-checked their citations and corrected their errors.
2. **Adversarial verification.** Each candidate issue from the map went to a verifier told to refute it from the code (and, where needed, the installed packages and the live site), to rewrite what it overstated and to re-judge its severity. None was refuted outright; 109 issues were confirmed or corrected, and 7 of them were docs drift that this update fixed. A final cross-document review of the docs found one more, `markout-holiday-exit-never-priced` (since fixed), and verified it against the code. The audit itself is summarised in [DEVLOG.md](DEVLOG.md).

Facts the code cannot show come from the maintainer. Production keys were last recorded on 2026-07-02 and could not be re-checked on 2026-10-05; see [EXTERNAL_KEYS.md](EXTERNAL_KEYS.md). Read the impacts with that context: the product is pre-launch, auth runs on a Clerk development instance, only the Mag-7 instruments are known to exist in production, and Upstash, Sentry, R2, SnapTrade and Resend were last recorded as unset.

**Instrument scope.** Mag-7 only is the deliberate scope until the core product has matured; expanding to more stocks is planned for after that (maintainer decision, 2026-10-05). Entries described as "latent while only the Mag 7 exist" are therefore not urgent. Fix them as part of that expansion, before any admin presses "Seed S&P 500 Top 50".

## Maintaining this file

- **When a PR fixes an issue,** delete its entry and update the counts table in that PR, and cite the issue id, such as `leaderboard-no-minimum-sample`, in the PR description. Record the fix in [CHANGELOG.md](CHANGELOG.md).
- **When a fix is partial,** rewrite the entry to describe what remains.
- **To add an issue,** verify it against the code first, give `path:line` evidence, and place it in its area in severity order.
- **Line numbers** in the evidence links are those of `cd63901`. After later edits, search for the named symbol.

## Most important

No high-severity issues remain open; the last three were fixed on 2026-10-06 (PRs #11–#13). Start with the medium issues in each area below.

## Counts by area

| Area | High | Medium | Low | Total |
|---|---|---|---|---|
| [Scoring and ranking](#area-scoring) | 0 | 0 | 1 | 1 |
| [Product (web app)](#area-product) | 0 | 0 | 2 | 2 |
| [API: tRPC, REST v1, MCP, auth](#area-api) | 0 | 0 | 2 | 2 |
| [Workers and schedules](#area-workers) | 0 | 1 | 3 | 4 |
| [Ingestion and extraction](#area-ingestion) | 0 | 0 | 3 | 3 |
| [Data model and shared code](#area-data) | 0 | 0 | 1 | 1 |
| [Infrastructure, config and tooling](#area-infra) | 0 | 1 | 6 | 7 |
| [Code comments](#area-docs) | 0 | 0 | 1 | 1 |
| **All** | **0** | **2** | **19** | **21** |

<a id="area-scoring"></a>

## Scoring and ranking

<a id="dead-scoring-code"></a>

### Unused scoring functions and outcome columns

**Low** · dead-code · `dead-scoring-code`

- **What's wrong:** Four exported functions are called only by tests: `maeAndMfe`, `computeSliceOutcome`, `continuousBrierScore` and `timeDecayedBrierScore`. `outcomes.brier_slices` is never written. `outcomes.target_hit` is computed, but no metric or UI uses it.
- **User impact:** Maintainers may assume continuous Brier and MAE/MFE feed live scores.
- **Evidence:** [`packages/scoring/src/player.ts:23`](../packages/scoring/src/player.ts#L23) · [`packages/scoring/src/guide.ts:141-189`](../packages/scoring/src/guide.ts#L141-L189) · [`apps/worker/functions/markoutClaim.ts:110-129`](../apps/worker/functions/markoutClaim.ts#L110-L129)

<a id="area-product"></a>

## Product (web app)

<a id="api-docs-nav-for-all"></a>

### API Docs names no one to ask for a key

**Low** · feature-gap · `api-docs-nav-for-all`

- **What's wrong:** Every signed-in user sees API Docs (`/docs/api`). Keys can only be minted by admins, and there is no request flow. (Since wave 5 the page says keys come from an admin and how to use the MCP server, but it publishes no address: the maintainer chose to leave one out on 2026-11-05.)
- **User impact:** Non-admins can read how keys work, but have no way to reach an admin to ask for one.
- **Evidence:** [`apps/web/app/(app)/docs/api/page.tsx`](../apps/web/app/%28app%29/docs/api/page.tsx) · [`packages/api/routers/apiKeys.ts`](../packages/api/routers/apiKeys.ts)

<a id="ticker-requests-no-ui"></a>

### Users cannot request a ticker, and approving a request creates nothing

**Low** · feature-gap · `ticker-requests-no-ui`

- **What's wrong:** `instruments.requestTicker` has no caller, so the admin "User Requests" tab is always empty. `reviewRequest` only updates the request's status: it creates no instrument and starts no price check. The admin UI has no control to add one ticker.
- **User impact:** The request-to-coverage workflow does nothing end to end. It is dormant groundwork for the planned post-maturity expansion, so it matters only when that work starts.
- **Evidence:** [`packages/api/routers/instruments.ts:400-454`](../packages/api/routers/instruments.ts#L400-L454) · [`packages/api/routers/instruments.ts:480-507`](../packages/api/routers/instruments.ts#L480-L507) · [`apps/web/app/(app)/admin/instruments/page.tsx:104-115`](../apps/web/app/%28app%29/admin/instruments/page.tsx#L104-L115)

<a id="area-api"></a>

## API: tRPC, REST v1, MCP, auth

<a id="snaptrade-secret-plaintext"></a>

### SnapTrade user secrets are stored in plaintext

**Low** · security · `snaptrade-secret-plaintext`

- **What's wrong:** `initLink` stores the SnapTrade `userSecret` unencrypted in `broker_links.metadata`, and `broker-sync` returns whole rows from a step, so Inngest run state keeps a copy.
- **User impact:** None today: no secrets are stored. Once enabled, database or Inngest read access exposes them; using them also needs the partner consumer key, which lives in Vercel env.
- **Evidence:** [`packages/api/routers/broker.ts:110-127`](../packages/api/routers/broker.ts#L110-L127) · [`apps/worker/functions/broker-sync.ts:36-46`](../apps/worker/functions/broker-sync.ts#L36-L46)

<a id="unused-trpc-procedures"></a>

### 15 of 82 tRPC procedures have no UI caller

**Low** · dead-code · `unused-trpc-procedures`

- **What's wrong:** 12 are called nowhere: `entity.search`, `instruments.detail`, `.list`, `.adminCreate`, `.requestTicker`, `leaderboard.byTicker`, `consensus.history`, `scores.history`, `social.followers`, `social.following`, `regime.history` and `influence.myInfluencers`. Two more are called only by MCP (`consensus.byInstrument`, `entity.bySlug`), and `entity.stats` only by the hidden landing `SocialProof`.
- **User impact:** Maintenance cost; 4 of the 12 answer signed-out callers.
- **Evidence:** [`packages/api/routers/instruments.ts:401`](../packages/api/routers/instruments.ts#L401) · [`packages/api/routers/leaderboard.ts:104`](../packages/api/routers/leaderboard.ts#L104) · [`packages/api/routers/influence.ts:124`](../packages/api/routers/influence.ts#L124)

<a id="area-workers"></a>

## Workers and schedules

<a id="digest-placeholder-recipient"></a>

### Daily digest goes to a placeholder address

**Medium** · inert-integration · `digest-placeholder-recipient`

- **What's wrong:** `daily-digest` never looks up a user's email. It sends from `digest@deepmint.app` to `user+<clerkUserId>@deepmint.app`, with links to `https://deepmint.app`. The Daily/Weekly choice in Settings (`digestFrequency`) is never read. A 24-hour lookback on a Mon–Fri 08:00 ET cron misses Friday 08:00 to Sunday 08:00 ET, including Friday's ingest and markout. Resend returns errors instead of throwing, so rejected sends count as sent.
- **User impact:** No user receives a digest. Today it skips entirely (`RESEND_API_KEY` last recorded empty). Setting the key would still reach nobody, and the run summary would count rejected sends as sent.
- **Evidence:** [`apps/worker/functions/digest.ts:22`](../apps/worker/functions/digest.ts#L22) · [`apps/worker/functions/digest.ts:32-33`](../apps/worker/functions/digest.ts#L32-L33) · [`apps/worker/functions/digest.ts:56`](../apps/worker/functions/digest.ts#L56) · [`apps/worker/functions/digest.ts:156-173`](../apps/worker/functions/digest.ts#L156-L173)

<a id="broker-sync-error-sticky"></a>

### One lasting broker-sync failure stops syncing

**Low** · bug · `broker-sync-error-sticky`

- **What's wrong:** Both sync paths pick only links with `sync_status='active'`, so a link stays in `error` once a run's retries are spent, and the error state's Retry button only refetches. (Since wave 5 a retry that succeeds restores the link, the first sync reads back past the moment of linking, and the error state offers Reconnect.)
- **User impact:** Dormant while SnapTrade is unconfigured. Once enabled, one lasting error ends syncing for that Player, and the Verified badge and ×1.5 weight stay off until they reconnect by hand, even if SnapTrade recovers.
- **Evidence:** [`apps/worker/functions/broker-sync.ts`](../apps/worker/functions/broker-sync.ts) · [`packages/api/routers/broker.ts`](../packages/api/routers/broker.ts) · [`apps/web/components/settings/BrokerVerification.tsx`](../apps/web/components/settings/BrokerVerification.tsx)

<a id="leaderboard-refresh-noop"></a>

### `leaderboard-refresh` is a no-op that claims to cache results

**Low** · dead-code · `leaderboard-refresh-noop`

- **What's wrong:** The function only logs and returns `{ refreshed: true }`. Its comments describe pre-computation and Redis caching that do not exist; leaderboards query Postgres live.
- **User impact:** Misleads operators reading Inngest runs, and uses one run per scoring event.
- **Evidence:** [`apps/worker/functions/leaderboard-refresh.ts:2-23`](../apps/worker/functions/leaderboard-refresh.ts#L2-L23)

<a id="worker-stale-docstrings"></a>

### Worker docstrings describe behaviour the code no longer has

**Low** · docs-drift · `worker-stale-docstrings`

- **What's wrong:** `getSourceAdapters`' docstring says it falls back to the demo adapter; the body has no fallback, as its own note says, and `DemoSourceAdapter` is used only by a test. `ingest-sources` returns `totalProcessed` as the number of adapters, not captures.
- **User impact:** Maintainers only.
- **Evidence:** [`apps/worker/functions/ingest.ts:11-15`](../apps/worker/functions/ingest.ts#L11-L15) · [`apps/worker/functions/ingest.ts:46-49`](../apps/worker/functions/ingest.ts#L46-L49) · [`apps/worker/functions/ingest.ts:133`](../apps/worker/functions/ingest.ts#L133)

<a id="area-ingestion"></a>

## Ingestion and extraction

<a id="feed-first-read-dates-old-posts"></a>

### An undated feed's first read dates its posts the day they are stored

**Low** · data-integrity · `feed-first-read-dates-old-posts`

- **What's wrong:** Since 2026-11-10 a feed read skips posts published more than 7 days earlier (`FEED_MAX_AGE_DAYS`), but an item with no date cannot be judged: a feed without dates still turns every Mag-7 post it lists into a claim dated the day it is stored, on its first read. A post from the last 7 days that a backfill also stored becomes two claims with different dates, since the archive's text differs from the feed's title and summary and the extractor's dedupe compares dates.
- **User impact:** Latent until an admin switches on a feed without dates, or backfills a Guide whose feed is on; `/admin/guides` says both. The claims cannot be removed afterwards.
- **Evidence:** [`packages/ingestion/src/sources/rss.ts`](../packages/ingestion/src/sources/rss.ts) · [`apps/worker/functions/backfill.ts`](../apps/worker/functions/backfill.ts) · [`apps/worker/functions/extract.ts`](../apps/worker/functions/extract.ts)

<a id="r2-snapshot-capture-dead"></a>

### Snapshot capture and R2 upload are never called

**Low** · inert-integration · `r2-snapshot-capture-dead`

- **What's wrong:** Nothing imports `capture.ts`, so `captureSnapshot` and the R2 upload never run, and both `events` inserts write `snapshot_path: null`. The dead code also has no `response.ok` check and leaves the browser open on errors.
- **User impact:** No source snapshots exist, and setting the `CLOUDFLARE_R2_*` keys changes nothing.
- **Evidence:** [`packages/ingestion/src/capture.ts:17-68`](../packages/ingestion/src/capture.ts#L17-L68) · [`packages/ingestion/src/index.ts:3-4`](../packages/ingestion/src/index.ts#L3-L4) · [`apps/worker/functions/ingest.ts:104`](../apps/worker/functions/ingest.ts#L104) · [`apps/worker/functions/backfill.ts:121`](../apps/worker/functions/backfill.ts#L121)

<a id="bench-providers-stale"></a>

### `bench-providers.ts` is stale and reports fallback answers as successes

**Low** · dead-code · `bench-providers-stale`

- **What's wrong:** The script reads a hard-coded `/Users/nm/Projects/Deepmint/.env.local`, defaults to the deprecated `Qwen/Qwen3-235B-A22B` when `LLM_MODEL` is unset, and its header describes a different argument. It never disables the fallback model, so a failing model is reported `ok: true` with the fallback's results.
- **User impact:** A developer benchmarking a model can conclude that a dead model works.
- **Evidence:** [`packages/ingestion/scripts/bench-providers.ts:4-9`](../packages/ingestion/scripts/bench-providers.ts#L4-L9) · [`packages/ingestion/scripts/bench-providers.ts:15`](../packages/ingestion/scripts/bench-providers.ts#L15) · [`packages/ingestion/scripts/bench-providers.ts:24-40`](../packages/ingestion/scripts/bench-providers.ts#L24-L40) · [`packages/ingestion/src/extractor.ts:418-436`](../packages/ingestion/src/extractor.ts#L418-L436)

<a id="area-data"></a>

## Data model and shared code

<a id="dead-and-duplicated-shared-code"></a>

### Dead and duplicated shared code

**Low** · dead-code · `dead-and-duplicated-shared-code`

- **What's wrong:** Unused: `errors.ts` (6 error classes), `centsToDollars`, `bpsToPercent`, `percentToBps`, `BPS_PER_PERCENT`, `CENTS_PER_DOLLAR`, `historicalCacheKey` with `TTL_HISTORICAL`, and four `components/ui` files. Duplicated: two local copies of the shared `formatBps`. (Since wave 2 there is one `slugify`, in `@deepmint/shared`, and since wave 7 the claims rate limit reads `CLAIM_RATE_LIMIT` and the only Mag-7 list is `MAG7_TICKERS`.)
- **User impact:** None for users; noise for maintainers.
- **Evidence:** [`packages/shared/src/errors.ts:1-45`](../packages/shared/src/errors.ts#L1-L45) · [`packages/shared/src/polygonCache.ts:80-85`](../packages/shared/src/polygonCache.ts#L80-L85)

<a id="area-infra"></a>

## Infrastructure, config and tooling

<a id="polygon-throttle-not-serialized"></a>

### The Polygon throttle queues calls only within one process

**Low** · bug · `polygon-throttle-not-serialized`

- **What's wrong:** Since wave 1, `polygonRateLimit` reserves each caller's slot before it sleeps, so calls within one process run 12.5 s apart, `Promise.all` pairs included. The queue is still per serverless instance, not per account: two instances calling Polygon at the same time (for example scoring computing the day's regime while a page view or a markout prices) together exceed the 5 req/min plan.
- **User impact:** Overlapping jobs can still draw 429s. Regime detection hides them behind fallbacks (dropped sector ETFs, default dispersion 0.08) that can mislabel the regime, and an interactive price lookup that gets one fails.
- **Evidence:** [`packages/shared/src/polygon.ts:76-96`](../packages/shared/src/polygon.ts#L76-L96) · [`packages/shared/src/polygon.ts:442-445`](../packages/shared/src/polygon.ts#L442-L445) · [`packages/shared/src/polygon.ts:527-537`](../packages/shared/src/polygon.ts#L527-L537)

<a id="sentry-inert"></a>

### Sentry cannot be switched on by setting the DSN

**Medium** · inert-integration · `sentry-inert`

- **What's wrong:** `sentry.{client,server,edge}.config.ts` exist, but there is no `instrumentation.ts` or `instrumentation-client.ts`, `next.config.ts` has no `withSentryConfig`, and nothing else imports `@sentry/nextjs`. The error boundaries report nothing. `SENTRY_AUTH_TOKEN` is read by nothing.
- **User impact:** No error reporting from the app or the unattended Inngest functions. Enabling it needs code changes, not just a key.
- **Evidence:** [`apps/web/next.config.ts:1-15`](../apps/web/next.config.ts#L1-L15) · [`apps/web/sentry.server.config.ts:1-7`](../apps/web/sentry.server.config.ts#L1-L7) · [`apps/web/app/global-error.tsx:1-31`](../apps/web/app/global-error.tsx#L1-L31)

<a id="domain-mismatch"></a>

### Code hard-codes `deepmint.app` and `deepmint.com`

**Low** · config · `domain-mismatch`

- **What's wrong:** `deepmint.app` is the digest sender, recipient and links. `deepmint.com` is the R2 public URL default and the demo adapter's URLs. Production is www.deepmint.ai, and the digest values have no env override.
- **User impact:** None visible today: the digest skips without a Resend key, the R2 code is never called, and the demo adapter runs only in a test. `deepmint.app` does not resolve.
- **Evidence:** [`apps/worker/functions/digest.ts:156-165`](../apps/worker/functions/digest.ts#L156-L165) · [`packages/ingestion/src/r2.ts:53`](../packages/ingestion/src/r2.ts#L53)

<a id="root-vercel-json"></a>

### Root `vercel.json` only makes sense from `apps/web`

**Low** · config · `root-vercel-json`

- **What's wrong:** Its `cd ../.. && …` commands assume the project's Root Directory (`apps/web`), but Vercel reads `vercel.json` from that directory, where none exists. The identical commands production runs most likely come from dashboard settings.
- **User impact:** No effect on builds; editing the root file probably changes nothing.
- **Evidence:** [`vercel.json:1-7`](../vercel.json#L1-L7)

<a id="redis-compose-unused"></a>

### docker-compose Redis is unused, so local rate limits and caches are off

**Low** · config · `redis-compose-unused`

- **What's wrong:** Compose starts Redis 7 on 6379, but all Redis access is Upstash REST, and no repo code reads `REDIS_URL`. With the Upstash variables blank, every rate limit and both caches are no-ops. `@deepmint/shared` imports `@upstash/redis` without declaring it, so outside the Next build (vitest, tsx) the regime cache silently disables itself.
- **User impact:** Contributors run a container nothing uses, and local rate limiting never runs, though v1 still sends `X-RateLimit-*` headers.
- **Evidence:** [`docker-compose.yml:13-16`](../docker-compose.yml#L13-L16) · [`packages/shared/src/polygonCache.ts:21-42`](../packages/shared/src/polygonCache.ts#L21-L42) · [`packages/shared/package.json`](../packages/shared/package.json)

<a id="run-migration-script-unsafe"></a>

### `run-migration.mjs` hard-codes the main checkout and reports success on failure

**Low** · config · `run-migration-script-unsafe`

- **What's wrong:** The unreferenced script migrates from `/Users/nm/Projects/Deepmint/packages/db/drizzle`, forces `ssl: 'require'` (so only a remote database works) and exits 0 after printing "Migration failed".
- **User impact:** Only if someone runs it: from a worktree it applies the main checkout's migrations and reports success, and real failures still exit 0.
- **Evidence:** [`packages/db/run-migration.mjs:8`](../packages/db/run-migration.mjs#L8) · [`packages/db/run-migration.mjs:13`](../packages/db/run-migration.mjs#L13) · [`packages/db/run-migration.mjs:15-16`](../packages/db/run-migration.mjs#L15-L16)

<a id="tracked-personal-files"></a>

### Personal config and unreferenced images are tracked

**Low** · config · `tracked-personal-files`

- **What's wrong:** `.claude/launch.json` is tracked despite `/.claude` in `.gitignore` (it predates the rule) and hard-codes `/Users/nm/.nvm/versions/node/v22.17.1/bin`. `deepmint_logo_full.png` (7 MB, the same blob as `apps/web/public/logo.png`) and `docs/upcoming_features.png` are referenced by nothing; `public/logo.png` is unreferenced too and ships with every deploy.
- **User impact:** Hygiene only.
- **Evidence:** [`.claude/launch.json:7`](../.claude/launch.json#L7) · [`.gitignore:37-38`](../.gitignore#L37-L38)

<a id="area-docs"></a>

## Code comments

<a id="gitignored-doc-references"></a>

### Code comments cite spec files that are not in the repo

**Low** · docs-drift · `gitignored-doc-references`

- **What's wrong:** Comments cite gitignored local specs that a clone does not have: `hasher.ts` (an architecture spec, §4.1), seven `packages/scoring/src` files (a build spec, §2.1–§2.8), `snaptrade.ts` (its no-trading invariant) and `globals.css` (design-system rules).
- **User impact:** A reader cannot follow these citations to the formulas or rules; only the code, its tests and [CHANGELOG.md](CHANGELOG.md) describe them.
- **Evidence:** [`packages/ingestion/src/hasher.ts:6`](../packages/ingestion/src/hasher.ts#L6) · [`packages/scoring/src/eiv.ts:2`](../packages/scoring/src/eiv.ts#L2) · [`packages/api/lib/snaptrade.ts:6`](../packages/api/lib/snaptrade.ts#L6) · [`apps/web/app/globals.css:4`](../apps/web/app/globals.css#L4)

## Fixed by this docs update

These verified issues were docs drift. The 2026-10-05 docs update fixed them in the docs and [`.env.example`](../.env.example); no application code changed. Where a trace remains in code, it is noted.

| Issue | Severity | What was wrong | Now |
|---|---|---|---|
| `readme-setup-broken` | Medium | The README's setup told you to `cp .env.example .env`, but no tool reads a root `.env`, and it ran `db:generate` as a setup step. | [README.md](../README.md) now says which env file each tool reads and applies the committed migrations. |
| `inngest-local-dev-undocumented` | Medium | No doc explained that local runs need `INNGEST_DEV=1` and the Inngest dev server; without them `inngest.send()` throws, and most failures are silent. | [README.md](../README.md) and [`.env.example`](../.env.example) cover both. Older [DEVLOG.md](DEVLOG.md) entries still name a non-existent `INNGEST_API_KEY`; they are kept as history. Still in code: the comment at [`apps/worker/scripts/backfill.ts:22-24`](../apps/worker/scripts/backfill.ts#L22-L24) does not say the shell must export `INNGEST_DEV`. |
| `env-example-db-port` | Low | `.env.example` pointed `DATABASE_URL` at port 5432; docker-compose publishes Postgres on 5433. | [`.env.example`](../.env.example) uses 5433. |
| `env-example-out-of-sync` | Low | `.env.example` omitted variables the code reads (`INGEST_POLYGON_NEWS`, `NEXT_PUBLIC_APP_URL`, `CLOUDFLARE_R2_PUBLIC_URL`, `INNGEST_DEV`, the `INNGEST_WORKFLOW_*` names, `TEST_*`) and listed some that nothing reads as if they worked. | [`.env.example`](../.env.example) lists every variable the code reads and comments out the unread ones with the reason. Still in code: the web test's default `TEST_ENTITY_SLUG` is `demo-guide`, which no seed creates ([`apps/web/__tests__/api-v1/entities-scores.test.ts:7`](../apps/web/__tests__/api-v1/entities-scores.test.ts#L7)). |
| `external-keys-upstash-drift` | Low | [EXTERNAL_KEYS.md](EXTERNAL_KEYS.md) said Upstash would cache price lookups (only regime indicators are cached), that `X-RateLimit-*` headers appear only with Upstash (they are always sent), and listed `social.ts` as rate-limited (it uses Redis as a follower-count cache). | [EXTERNAL_KEYS.md](EXTERNAL_KEYS.md) rewritten. |
| `llm-model-docs-drift` | Low | [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md) named the old pinned `openai/gpt-oss-120b:cerebras` and listed the model overrides as configured; [SPRINT_LOG.md](../SPRINT_LOG.md) and [CHANGELOG.md](CHANGELOG.md) stopped at older defaults. | All three now give the code defaults, `openai/gpt-oss-120b:fastest` with fallback `meta-llama/Llama-3.3-70B-Instruct:fastest`. The stale demo-adapter docstring in code is [worker-stale-docstrings](#worker-stale-docstrings). |
| `readme-clerk-providers` | Low | The README's tech-stack line listed sign-in providers that production does not offer. | [README.md](../README.md) gives what the production Clerk development instance offered on 2026-10-05: Google, Apple, and username plus password. Still in code: a styling comment at [`apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx:31-33`](../apps/web/app/%28auth%29/sign-in/%5B%5B...sign-in%5D%5D/page.tsx#L31-L33) (and the sign-up page) names Facebook and X. |

The docs part of [gitignored-doc-references](#gitignored-doc-references) is fixed too: [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md) no longer tells sessions to read a gitignored spec, though older [DEVLOG.md](DEVLOG.md) entries still cite them as history. The doc statements behind several open entries were also corrected, including [sentry-inert](#sentry-inert), `mcp-unreachable-basepath` (since fixed), [polygon-throttle-not-serialized](#polygon-throttle-not-serialized), and [redis-compose-unused](#redis-compose-unused); their code issues stay open above.

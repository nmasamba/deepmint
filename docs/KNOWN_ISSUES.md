# Known issues

The register of verified defects in Deepmint's code, from the coherence audit of **2026-10-05**. Every entry was checked against `main` at `cd63901` (after PRs #6–#9). It lists **11 open issues: no high, 2 medium and 9 low**. Docs drift that this docs update fixed is listed at the end, under [Fixed by this docs update](#fixed-by-this-docs-update).

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
| [Workers and schedules](#area-workers) | 0 | 1 | 1 | 2 |
| [Ingestion and extraction](#area-ingestion) | 0 | 0 | 1 | 1 |
| [Data model and shared code](#area-data) | 0 | 0 | 0 | 0 |
| [Infrastructure, config and tooling](#area-infra) | 0 | 1 | 2 | 3 |
| [Code comments](#area-docs) | 0 | 0 | 0 | 0 |
| **All** | **0** | **2** | **9** | **11** |

<a id="area-scoring"></a>

## Scoring and ranking

<a id="target-met-before-entry"></a>

### Target metrics count some targets met before the entry

**Low** · bug · `target-met-before-entry`

- **What's wrong:** Both target metrics can count a target that was already met when the claim was priced.
  - `targetPrecision` credits a target already behind the entry for a move against the claim: a short with its target above the entry scores up to 1 as the price rises to the target, and 0 when the price falls and the call is right. The local ledger has three, all wrong calls that score 1. `target_hit_rate` leaves such targets out.
  - For a claim with a stored entry, markout's target window starts on its creation day. A dated rating or a backfilled post is priced at that day's close, so a target touched earlier in the day counts as reached, and `target_hit_rate` counts it.
- **User impact:** A Guide's target hit rate can read better than the calls were, and target precision better or worse. Both show on the profile's Stats tab and in REST v1, and neither is a board on the leaderboard page.
- **Evidence:** [`packages/scoring/src/guide.ts`](../packages/scoring/src/guide.ts) (`targetPrecision`, `targetHitRate`) · [`packages/scoring/src/markout.ts`](../packages/scoring/src/markout.ts) (`windowStartsAfter`) · [`apps/worker/functions/backfill.ts`](../apps/worker/functions/backfill.ts) and [`packages/ingestion/src/extractor.ts`](../packages/ingestion/src/extractor.ts) (`getEODPrice`)

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

- **What's wrong:** `instruments.requestTicker` has no caller, so the admin "User Requests" tab is always empty. `reviewRequest` only updates the request's status: it creates no instrument and starts no price check. The admin UI has no control to add one ticker: `instruments.adminCreate` has no caller either.
- **User impact:** The request-to-coverage workflow does nothing end to end. It is dormant groundwork for the planned post-maturity expansion, so it matters only when that work starts; wave 10 kept both procedures for it.
- **Evidence:** [`packages/api/routers/instruments.ts`](../packages/api/routers/instruments.ts) (`requestTicker`, `reviewRequest`, `adminCreate`) · [`apps/web/app/(app)/admin/instruments/page.tsx:104-115`](../apps/web/app/%28app%29/admin/instruments/page.tsx#L104-L115)

<a id="area-api"></a>

## API: tRPC, REST v1, MCP, auth

<a id="snaptrade-secret-plaintext"></a>

### SnapTrade user secrets are stored in plaintext

**Low** · security · `snaptrade-secret-plaintext`

- **What's wrong:** `initLink` stores the SnapTrade `userSecret` unencrypted in `broker_links.metadata`, and `broker-sync` returns whole rows from a step, so Inngest run state keeps a copy.
- **User impact:** None today: no secrets are stored. Once enabled, database or Inngest read access exposes them; using them also needs the partner consumer key, which lives in Vercel env.
- **Evidence:** [`packages/api/routers/broker.ts:110-127`](../packages/api/routers/broker.ts#L110-L127) · [`apps/worker/functions/broker-sync.ts:36-46`](../apps/worker/functions/broker-sync.ts#L36-L46)

<a id="linked-guide-keeps-broker-link"></a>

### A linked Guide keeps the user's broker link

**Low** · data-integrity · `linked-guide-keeps-broker-link`

- **What's wrong:** Approving a Guide application with a link moves the user's broker links, link status and SnapTrade user to the ingested Guide (`linkAccountToGuide`, 2026-11-10). Broker verification is otherwise for Players only: `broker.initLink` refuses any other type, so the Guide can never link a broker again once its link is disconnected, and consensus weights a verified Guide's claims ×1.2 as a Guide and ×1.5 as broker-verified, ×1.8 in all, which no other Guide can reach.
- **User impact:** None today: no broker links exist while SnapTrade is not configured. Once it is, a linked analyst with a broker link counts for more in consensus than any other Guide.
- **Evidence:** [`packages/api/lib/guideLink.ts`](../packages/api/lib/guideLink.ts) (`linkAccountToGuide`) · [`packages/api/routers/broker.ts`](../packages/api/routers/broker.ts) (`initLink`) · [`packages/scoring/src/consensus.ts`](../packages/scoring/src/consensus.ts) (`computeConsensusSignal`)

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

<a id="area-ingestion"></a>

## Ingestion and extraction

<a id="feed-first-read-dates-old-posts"></a>

### An undated feed's first read dates its posts the day they are stored

**Low** · data-integrity · `feed-first-read-dates-old-posts`

- **What's wrong:** Since 2026-11-10 a feed read skips posts published more than 7 days earlier (`FEED_MAX_AGE_DAYS`), but an item with no date cannot be judged: a feed without dates still turns every Mag-7 post it lists into a claim dated the day it is stored, on its first read. A post from the last 7 days that a backfill also stored becomes two claims with different dates, since the archive's text differs from the feed's title and summary and the extractor's dedupe compares dates.
- **User impact:** Latent until an admin switches on a feed without dates, or backfills a Guide whose feed is on; `/admin/guides` says both. The claims cannot be removed afterwards.
- **Evidence:** [`packages/ingestion/src/sources/rss.ts`](../packages/ingestion/src/sources/rss.ts) · [`apps/worker/functions/backfill.ts`](../apps/worker/functions/backfill.ts) · [`apps/worker/functions/extract.ts`](../apps/worker/functions/extract.ts)

<a id="area-data"></a>

## Data model and shared code

No open issues.

<a id="area-infra"></a>

## Infrastructure, config and tooling

<a id="polygon-throttle-not-serialized"></a>

### Polygon calls outside the shared job slot can still exceed the plan's rate

**Low** · bug · `polygon-throttle-not-serialized`

- **What's wrong:** `polygonRateLimit` spaces calls 12.5 s apart within one process only. Since wave 10 eight of the nine worker functions that call Polygon share one account-wide Inngest slot (`POLYGON_CONCURRENCY`), so two of their steps never run at once. Three gaps remain:
  - the ticker page and the `paper` and `signalSimulate` routers call Polygon outside Inngest, where no concurrency key reaches (each close is memoised for 5 minutes per instance);
  - `extract-claims` takes no slot, because its steps hold a model call of up to four minutes, and looks up one close for a claim with a stated rating date;
  - the slot stops overlap, not bursts: two short steps in a row on different instances are not 12.5 s apart.
- **User impact:** A page view during a job, or a burst of short steps, can still draw a 429. Regime detection hides one behind fallbacks (dropped sector ETFs, default dispersion 0.08) that can mislabel the regime, a markout waits for the next day's run, a mirror trade is retried, and a page says the price is unavailable. Closing it takes a slot every caller shares, in Upstash (D23 option 2), last recorded as unset in production.
- **Evidence:** [`apps/worker/inngest.ts`](../apps/worker/inngest.ts) (`POLYGON_CONCURRENCY`) · [`packages/shared/src/polygon.ts`](../packages/shared/src/polygon.ts) (`polygonRateLimit`, `getLatestClose`) · [`packages/ingestion/src/extractor.ts`](../packages/ingestion/src/extractor.ts) (`processExtraction`)

<a id="sentry-inert"></a>

### Sentry cannot be switched on by setting the DSN

**Medium** · inert-integration · `sentry-inert`

- **What's wrong:** `sentry.{client,server,edge}.config.ts` exist, but there is no `instrumentation.ts` or `instrumentation-client.ts`, `next.config.ts` has no `withSentryConfig`, and nothing else imports `@sentry/nextjs`. The error boundaries report nothing. `SENTRY_AUTH_TOKEN` is read by nothing.
- **User impact:** No error reporting from the app or the unattended Inngest functions. Enabling it needs code changes, not just a key.
- **Evidence:** [`apps/web/next.config.ts:1-15`](../apps/web/next.config.ts#L1-L15) · [`apps/web/sentry.server.config.ts:1-7`](../apps/web/sentry.server.config.ts#L1-L7) · [`apps/web/app/global-error.tsx:1-31`](../apps/web/app/global-error.tsx#L1-L31)

<a id="domain-mismatch"></a>

### The daily digest hard-codes `deepmint.app`

**Low** · config · `domain-mismatch`

- **What's wrong:** `deepmint.app` is the digest's sender, recipient and link, with no env override. Production is www.deepmint.ai. (The `deepmint.com` defaults are gone: the demo adapter's since wave 9, and the R2 public URL's since wave 10.) Package 21, which waits for the Resend keys, replaces all three.
- **User impact:** None visible today: the digest skips without a Resend key. `deepmint.app` does not resolve.
- **Evidence:** [`apps/worker/functions/digest.ts:162-171`](../apps/worker/functions/digest.ts#L162-L171)

<a id="area-docs"></a>

## Code comments

No open issues.

## Fixed by this docs update

These verified issues were docs drift. The 2026-10-05 docs update fixed them in the docs and [`.env.example`](../.env.example); no application code changed. Where a trace remains in code, it is noted.

| Issue | Severity | What was wrong | Now |
|---|---|---|---|
| `readme-setup-broken` | Medium | The README's setup told you to `cp .env.example .env`, but no tool reads a root `.env`, and it ran `db:generate` as a setup step. | [README.md](../README.md) now says which env file each tool reads and applies the committed migrations. |
| `inngest-local-dev-undocumented` | Medium | No doc explained that local runs need `INNGEST_DEV=1` and the Inngest dev server; without them `inngest.send()` throws, and most failures are silent. | [README.md](../README.md) and [`.env.example`](../.env.example) cover both. Older [DEVLOG.md](DEVLOG.md) entries still name a non-existent `INNGEST_API_KEY`; they are kept as history. Still in code: the comment at [`apps/worker/scripts/backfill.ts:22-24`](../apps/worker/scripts/backfill.ts#L22-L24) does not say the shell must export `INNGEST_DEV`. |
| `env-example-db-port` | Low | `.env.example` pointed `DATABASE_URL` at port 5432; docker-compose publishes Postgres on 5433. | [`.env.example`](../.env.example) uses 5433. |
| `env-example-out-of-sync` | Low | `.env.example` omitted variables the code reads (`INGEST_POLYGON_NEWS`, `NEXT_PUBLIC_APP_URL`, `CLOUDFLARE_R2_PUBLIC_URL`, `INNGEST_DEV`, the `INNGEST_WORKFLOW_*` names, `TEST_*`) and listed some that nothing reads as if they worked. | [`.env.example`](../.env.example) lists every variable the code reads and comments out the unread ones with the reason. Still in code: the web test's default `TEST_ENTITY_SLUG` is `demo-guide`, which no seed creates ([`apps/web/__tests__/api-v1/entities-scores.test.ts:7`](../apps/web/__tests__/api-v1/entities-scores.test.ts#L7)). |
| `external-keys-upstash-drift` | Low | [EXTERNAL_KEYS.md](EXTERNAL_KEYS.md) said Upstash would cache price lookups (only regime indicators are cached), that `X-RateLimit-*` headers appear only with Upstash (they are always sent), and listed `social.ts` as rate-limited (it uses Redis as a follower-count cache). | [EXTERNAL_KEYS.md](EXTERNAL_KEYS.md) rewritten. |
| `llm-model-docs-drift` | Low | [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md) named the old pinned `openai/gpt-oss-120b:cerebras` and listed the model overrides as configured; [SPRINT_LOG.md](../SPRINT_LOG.md) and [CHANGELOG.md](CHANGELOG.md) stopped at older defaults. | All three now give the code defaults, `openai/gpt-oss-120b:fastest` with fallback `meta-llama/Llama-3.3-70B-Instruct:fastest`. The stale demo-adapter docstring in code was corrected in wave 9, when the adapter was deleted. |
| `readme-clerk-providers` | Low | The README's tech-stack line listed sign-in providers that production does not offer. | [README.md](../README.md) gives what the production Clerk development instance offered on 2026-10-05: Google, Apple, and username plus password. Still in code: a styling comment at [`apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx:31-33`](../apps/web/app/%28auth%29/sign-in/%5B%5B...sign-in%5D%5D/page.tsx#L31-L33) (and the sign-up page) names Facebook and X. |

The docs part of `gitignored-doc-references` (its code comments were fixed in wave 10) is fixed too: [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md) no longer tells sessions to read a gitignored spec, though older [DEVLOG.md](DEVLOG.md) entries still cite them as history. The doc statements behind several open entries were also corrected, including [sentry-inert](#sentry-inert), `mcp-unreachable-basepath` (since fixed), [polygon-throttle-not-serialized](#polygon-throttle-not-serialized) and `redis-compose-unused` (since fixed); the code issues of the other two stay open above.

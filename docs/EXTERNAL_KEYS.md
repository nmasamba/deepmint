# External services and keys

For every external service and environment variable the code reads, this page lists what it powers, which files read it, what happens without it, how to get and check it, and what production has. Facts were checked against `main` at `cd63901` on 2026-10-05.

**About production status.** The production key list was last recorded on 2026-07-02 and could not be re-checked on 2026-10-05: the Vercel CLI token has expired and the Vercel connector cannot list env vars. "Last recorded" below means that 2026-07-02 status, unverified since. Two statuses were confirmed on 2026-10-05 by probing public endpoints (the Clerk webhook secret, and both Inngest keys), and are marked "probe 2026-10-05". `LLM_MODEL` and `LLM_MODEL_FALLBACK` were deleted from Vercel and the root `.env.local` on 2026-10-05.

Never write a real key value into this file, [`.env.example`](../.env.example) or any tracked file.

## At a glance

| Service | Variables | Required? | Production |
|---|---|---|---|
| Postgres (Supabase in production) | `DATABASE_URL` | Yes | Set (last recorded) |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Yes | Set; a Clerk **development** instance (`pk_test_` keys), per the maintainer on 2026-10-05 |
| Clerk webhook | `CLERK_WEBHOOK_SECRET` | No | Set (probe 2026-10-05) |
| Massive (formerly Polygon.io) | `POLYGON_API_KEY` | Yes | Set (last recorded) |
| Hugging Face router | `HF_API_KEY` | Yes, for extraction | Set (last recorded) |
| | `LLM_MODEL`, `LLM_MODEL_FALLBACK` | No | Deleted 2026-10-05; code defaults apply |
| Inngest | `INNGEST_WORKFLOW_INNGEST_EVENT_KEY`, `INNGEST_WORKFLOW_INNGEST_SIGNING_KEY` | Yes | Set by the Vercel integration; `/api/inngest` reports both keys (probe 2026-10-05) |
| | unprefixed `INNGEST_EVENT_KEY` | See [Inngest](#inngest) | Not recorded |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | No, but first in the priority list | Empty (last recorded) |
| SnapTrade | `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` | No | Empty (last recorded) |
| Resend | `RESEND_API_KEY` | No; **inert** until code changes | Empty (last recorded) |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN` | No; **inert** until code changes | Empty (last recorded) |
| Cloudflare R2 | `CLOUDFLARE_R2_*` | No; **inert**, nothing calls it | Empty (last recorded) |
| Flags | `INGEST_POLYGON_NEWS`, `NEXT_PUBLIC_APP_URL` | No | Not recorded |

## Priority order

Ordered by what each step changes in the running code today.

1. **Upstash Redis.** Config only, no code change. Without it:
   - `claims.submit` has no 10-claims-per-hour limit, so a signed-in user can submit claims without bound.
   - `/api/v1` and `/api/mcp` have no per-key limit. This matters once the first `dm_live_` key is issued; production had 0 keys on 2026-08-03 and the count since is not recorded.
2. **Check for an unprefixed `INNGEST_EVENT_KEY` in Vercel.** Config check. The tRPC routers send events through their own Inngest clients, which never see the `INNGEST_WORKFLOW_` mapping. If production has only the prefixed keys, self-logged claims and follows silently emit no events, and the admin "Seed S&P 500 Top 50" button errors after inserting rows. Details under [Inngest](#inngest).
3. **Clerk production instance, before launch.** Production runs on a development instance. That instance allows 100 Backend API requests per 10 seconds, and every signed-in non-admin tRPC request and full page load makes one (`users.getUser`, for the admin check). Moving needs the custom domain, Google OAuth credentials and DNS, then new values for both keys and the webhook secret.
4. **Sentry: code first, then the DSN.** A DSN alone does nothing (see [Sentry](#sentry)). It ranks first among the code-blocked items because 16 Inngest functions run unattended, and their failures are visible only in Inngest run history and Vercel logs.
5. **SnapTrade: when Player broker verification launches,** and only after the gaps listed under [SnapTrade](#snaptrade) are fixed.
6. **Resend: code first.** The digest sends to placeholder addresses.
7. **Cloudflare R2: code first, lowest priority.** No code path uploads anything.

Optional at any time: set `NEXT_PUBLIC_APP_URL=https://www.deepmint.ai` (no visible effect today). Keep `INGEST_POLYGON_NEWS` unset.

---

## Database

- **Variable:** `DATABASE_URL`.
- **Powers:** every read and write. Production is Supabase; local development is the docker-compose Postgres.
- **Read by:** `packages/db/index.ts:9` (lazy client used by the app, the API and the workers), `packages/db/drizzle.config.ts:8` (drizzle-kit), `packages/db/seed.ts:5`, `packages/db/run-migration.mjs:5`.
- **Required:** yes, for anything that touches data.
- **If missing:** the first query throws `DATABASE_URL environment variable is not set`. `next build` still succeeds, because the client is a lazy proxy. `db:seed` throws at start.
- **Get it:** production: Supabase dashboard → project → Connect → connection string. Local: `postgresql://deepmint:deepmint@localhost:5433/deepmint`. docker-compose publishes Postgres on host port **5433**, not 5432.
- **Verify:** locally, `pnpm --filter @deepmint/db db:migrate` applies migrations 0000–0007 (drizzle-kit reads `packages/db/.env`, see [Local env files](#local-env-files)).
- **Production:** set (last recorded). Migrations 0000–0007 are applied; 0007 was applied and verified on 2026-10-05.
- **Schema changes reach Supabase by hand:**
  1. Paste the migration's SQL into the Supabase SQL editor.
  2. Insert its journal row: `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256 hex of the .sql file>', <the migration's "when" from meta/_journal.json>);`. Add rows in order: drizzle compares only the newest row's `created_at` with each migration's `when`.
  3. Do not use `packages/db/run-migration.mjs`: it hard-codes the main checkout's migrations folder and exits 0 on failure.
- **Never:** put the production URL in a local env file (the root `.env.local` points at local Docker), or run `db:seed` against production. The seed writes 5 fictional Guides, 3 fictional Players and 100 fake active claims into the append-only ledger, with no environment guard.

## Clerk (auth)

**`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`**
- **Powers:** sign-in and sessions, and the route protection in `apps/web/middleware.ts`. The secret key also backs `clerkClient()`, which the tRPC context (`apps/web/app/api/trpc/[trpc]/route.ts`) uses to create a missing Player entity (self-heal) and to look up the admin role. `apps/web/app/(app)/layout.tsx` uses it for the admin nav.
- **Read by:** `@clerk/nextjs` 7.0.7 implicitly; no repo code names them.
- **Required:** yes. CI also needs both as GitHub repository secrets for the web build (`.github/workflows/ci.yml`).
- **If missing:** in a production build, Clerk middleware cannot run, so auth and every page fail. Under `next dev`, Clerk 7 instead falls back to keyless mode with temporary development keys.
- **Get it:** Clerk dashboard → API keys.
- **Production:** set, on a Clerk **development** instance (`pk_test_` keys). Sign-in methods are set in the Clerk dashboard, not in code; Facebook and X were never configured. See priority 3 for the move to a production instance.

**`CLERK_WEBHOOK_SECRET`**
- **Powers:** `POST /api/webhooks/clerk` (`apps/web/app/api/webhooks/clerk/route.ts:25`), which creates the Player entity on `user.created`. That is the only event it handles.
- **Required:** no. If the webhook never fires, the tRPC self-heal creates the entity on the user's first tRPC request.
- **If missing:** every delivery gets a 500, because the route throws before checking headers.
- **Get it:** Clerk dashboard → Webhooks → add endpoint `https://www.deepmint.ai/api/webhooks/clerk`, subscribe to `user.created`, copy the signing secret. Use the `www` host: the bare `deepmint.ai` answers with a 307 redirect, which Svix does not follow.
- **Verify:** `curl -X POST https://www.deepmint.ai/api/webhooks/clerk` returns `400 Missing svix headers` when the secret is set, and 500 when it is not. A real delivery logs `[clerk webhook] entity ensured` in the Vercel function logs.
- **Production:** secret set (probe 2026-10-05 returned the 400). Whether an endpoint is registered in Clerk is unverified; notes from 2026-08-11 say none was, and production entities came from the self-heal. Known weakness: the route verifies a re-serialised body rather than the raw bytes, so some payloads can fail the signature check.

**Optional Clerk variables**
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`: read implicitly by Clerk. Without them Clerk uses its hosted sign-in and sign-up pages instead of the in-app ones.
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`: **not read** by Clerk 7, which reads the `*_FALLBACK_REDIRECT_URL` and `*_FORCE_REDIRECT_URL` names instead. Users still land on `/dashboard`, because middleware redirects signed-in visitors from `/` (`apps/web/middleware.ts:27-29`).

**Admin role:** set `privateMetadata.role = "admin"` on the user in the Clerk dashboard. There is no in-app way to grant it.

## Market data (Massive, formerly Polygon.io)

- **Variable:** `POLYGON_API_KEY`.
- **Read by:** `packages/shared/src/polygon.ts:53` (the `@massive.com/client-js` client used for all prices and index values) and `packages/ingestion/src/sources/polygonNews.ts:39` (direct calls to `https://api.polygon.io/v2/reference/news`).
- **Powers:**
  - entry prices: self-logged claims (`packages/api/routers/claims.ts:94`), extracted claims (`packages/ingestion/src/extractor.ts:655,660`) and backfill (`apps/worker/functions/backfill.ts:147`);
  - markout exit prices and target-hit bars (`apps/worker/functions/markoutClaim.ts:85,114`);
  - paper trading, Signal Simulate fills and the ticker page price;
  - regime indicators for scoring, the leaderboard and MCP;
  - the data check that `backfill-prices` runs on newly added instruments;
  - the opt-in news lane (see [`INGEST_POLYGON_NEWS`](#flags-and-app-variables)).
- **Required:** yes, in any environment that writes to a shared database.
- **If missing:**
  - Prices are hard-coded dev values for the 7 Mag-7 tickers (AAPL is 22500 cents), and any other ticker throws.
  - Historical bars come back empty, so `backfill-prices` deactivates every newly added instrument.
  - No market-regime snapshot is stored: every indicator would be a dev constant, so each is marked defaulted and the snapshot job refuses to write one. The leaderboard shows no regime. The news lane returns nothing.
  - **Danger:** a claim priced and marked out without a key gets the same constant as entry and exit, so its outcome is 0 bps, written permanently into the append-only `outcomes` table. Never run a keyless deployment or worker against a shared database.
- **Behaviour with a key that callers should know about:**
  - The "current price" is the **previous session's close** (previous-day aggregate first, then the snapshot's `prevDay`; the code notes the snapshot endpoint returns 403 on the current plan). If both calls fail, the lookup throws; it never invents a price.
  - The plan has **no index data**: `I:VIX` and `I:SPX` return 403 NOT_AUTHORIZED (checked 2026-10-06). The regime's S&P 500 30-day return is therefore measured on SPY, and VIX is recorded as defaulted in every snapshot (`market_regimes.defaulted_fields`); it is never replaced by a made-up value. A plan with index data fills VIX in with no code change.
  - Every call waits for a 12.5 s gap after the previous one, sized for a 5-requests-per-minute plan. The gap is per process and not a queue: calls started together (each `Promise.all` pair) fire together, and separate serverless instances do not share it.
  - Prices are never cached. Only the regime indicators are, and only with Upstash.
- **Get it:** Massive (polygon.io) dashboard → API keys.
- **Verify:** with the key exported in your shell, run `pnpm --filter @deepmint/worker exec tsx -e 'import("@deepmint/shared").then(async (m) => console.log(await m.getCurrentPrice("AAPL")))'`. It prints AAPL's previous close in cents; `22500` means the key was not read.
- **Production:** set (last recorded).

## Extraction LLM: Hugging Face router

**`HF_API_KEY`**
- **Powers:** claim extraction in `extract-claims` and in historical backfill. The OpenAI SDK points at the Hugging Face router, `https://router.huggingface.co/v1` (`packages/ingestion/src/extractor.ts:19-32`). It is not Anthropic's API and not OpenAI's. This is the only model in the system; scoring is deterministic statistics.
- **Required:** yes, for extraction.
- **If missing:** every extraction throws `HF_API_KEY environment variable is required for LLM extraction`, even for text with no Mag-7 mention, because the client is built before the pre-filter. `extract-claims` logs the event id as failed and moves on, and nothing re-drives it, so the event keeps no claims. Ingestion still stores events.
- **Get it:** huggingface.co → Settings → Access Tokens → a fine-grained token with permission to make calls to Inference Providers. Usage is billed to that Hugging Face account.
- **Verify:**
  - With the key exported, run `pnpm --filter @deepmint/worker exec tsx -e 'import("@deepmint/ingestion").then(async (m) => console.log((await m.extractClaims("Buying AAPL, target $250 within 3 months")).model))'`. It prints the model and provider, for example `openai/gpt-oss-120b:fastest (cerebras)`.
  - With `HF_API_KEY` in the root `.env.local`, `pnpm --filter @deepmint/ingestion test` also runs the 6 live tests (real calls, up to 420 s each).
  - In production, the Inngest run logs and the Vercel function logs for `/api/inngest` show `[extractor] Answered by <model> (<provider>)` on success and `[extractor] Model <model> failed, trying next: <message>` on failure.
- **Production:** set (last recorded).

**`LLM_MODEL`, `LLM_MODEL_FALLBACK`** (`extractor.ts:418-424`)
- **Powers:** emergency overrides only. The code defaults are `openai/gpt-oss-120b:fastest` and the fallback `meta-llama/Llama-3.3-70B-Instruct:fastest`. `:fastest` lets the router pick the quickest live provider for each request.
- **If set:** an empty `LLM_MODEL` means the default, while an empty `LLM_MODEL_FALLBACK` **disables** the fallback. Pinning a provider (`model:provider`) disables the router's failover; a pinned `:groq` Llama started returning 404 on 2026-10-05.
- **Production:** deleted from Vercel and the root `.env.local` on 2026-10-05, so the defaults apply. Leave them unset.

## Inngest

**Variables:** `INNGEST_EVENT_KEY` (lets the app send events) and `INNGEST_SIGNING_KEY` (lets Inngest Cloud invoke `/api/inngest`). Both are read implicitly by inngest 4.1.0. The Vercel integration provides them as `INNGEST_WORKFLOW_INNGEST_EVENT_KEY` and `INNGEST_WORKFLOW_INNGEST_SIGNING_KEY`. Two shims copy those onto the standard names when the standard names are unset: `apps/web/app/api/inngest/inngest-env.ts:6-9`, imported first by `apps/web/app/api/inngest/route.ts`, and `apps/worker/inngest.ts:7-10`.

- **Powers:** all 15 worker functions, served by the Next.js app at `/api/inngest`; there is no separate worker service. That covers 5 crons (ingest, markout, broker sync, Merkle audit, daily digest) and the event chain behind extraction, scoring, consensus and influence.
- **Required:** yes, in production.
- **If missing:** the SDK runs in cloud mode unless `INNGEST_DEV` is set. In cloud mode `send()` throws without an event key, and `/api/inngest` cannot verify Inngest's requests without the signing key, so no function runs.
- **The unprefixed-key gap:**
  - The three tRPC routers that send events build their own clients when the module loads: `packages/api/routers/claims.ts:23`, `social.ts:16` and `instruments.ts:17`. Neither shim is imported on their path, so they see an event key only if the unprefixed name exists (or, by chance, if `/api/inngest` loaded first in the same instance).
  - If production has only the prefixed keys, `claims/created` (self-logged and MCP claims) and `social/followed` sends fail silently, because their errors are swallowed. As a result Signal Simulate mirrors log no trades, influence tracking records nothing, and follows send no notification.
  - `instruments.adminBatchCreate` throws after the rows are already inserted, so `backfill-prices` never checks them.
  - To check: `vercel env ls production` and look for `INNGEST_EVENT_KEY`. If it is absent, add it with the event key's value (a copy will not follow a key rotation), or fix the code so these clients get the mapping.
- **Stale file:** `apps/worker/inngest.js`, a committed compile output without the shim, is likely what the production webpack bundle loads, because webpack resolves `.js` before `.ts`. The route-level `inngest-env.ts` is what actually maps the keys for `/api/inngest`.
- **Get it:** Vercel → Integrations → Inngest (keys arrive prefixed), or Inngest dashboard → Production → event key and signing key.
- **Verify:**
  - `curl https://www.deepmint.ai/api/inngest` returned `"has_event_key":true,"has_signing_key":true,"function_count":15,"mode":"cloud"` on 2026-10-05. This covers only the client inside that route, after the shim, so it cannot tell prefixed keys from unprefixed ones.
  - For the routers, follow and then unfollow any profile, and look for a `social/followed` event in the Inngest dashboard's event list. Do not test with a claim: claims are append-only.
- **Production:** app `deepmint` is synced through the Vercel integration. The route sets no `maxDuration`.

**`INNGEST_DEV` (local only).** This setup is derived from the SDK's behaviour; nothing in the repo exercises it.
1. Put `INNGEST_DEV=1` in `apps/web/.env.local`.
2. Run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` next to the web dev server. Its UI at `http://localhost:8288` can invoke crons by hand.
3. The backfill CLI reads no env file: `INNGEST_DEV=1 pnpm --filter @deepmint/worker backfill ./archive.json` (the path is relative to `apps/worker`).

`INNGEST_API_KEY`, which older DEVLOG entries mention, does not exist.

## Upstash Redis

- **Variables:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- **Read by** five places. Each one turns into a no-op when either variable is unset:

  | File | What it does with Upstash |
  |---|---|
  | `apps/web/app/api/v1/lib/rateLimit.ts:16-17` | Per-API-key sliding window of the key's `rate_limit` per minute (default 60). Covers `/api/v1` and `/api/mcp`, which share `authenticateRequest`. |
  | `packages/api/routers/claims.ts:28-29` | `claims.submit`: 10 claims per hour per entity, MCP `submit_claim` included. |
  | `packages/api/routers/broker.ts:25-26` | `broker.syncTrades`: 1 per hour per entity. |
  | `packages/api/routers/social.ts:20-21` | Follower-count cache. A cache, not a limit. |
  | `packages/shared/src/polygonCache.ts:24-25` | 1-hour cache of the **regime indicators only** (`polygon.ts:406-409`). Price lookups are never cached; `historicalCacheKey` and `currentPriceCacheKey` are unused. |

- **Required:** no. Priority 1 explains why to set it anyway.
- **If missing:** no rate limits anywhere, and follower counts come from the database each time. The regime no longer depends on it: it is a stored daily snapshot.
- **Headers prove nothing.** `/api/v1` sends `X-RateLimit-*` headers on every authenticated response, with or without Upstash (`remaining` equals the limit when it is off).
- **Silent failure:** `@upstash/redis` is not a declared dependency of `@deepmint/shared`. `polygonCache.ts` imports it dynamically, and if that import fails the regime cache switches itself off without an error.
- **Get it:** console.upstash.com → create a Redis database → REST API → URL and token. The code reads only these two names; if a marketplace integration injects other names, add these two as well.
- **Verify:**
  - Credentials: `curl -s "$UPSTASH_REDIS_REST_URL/ping" -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"` returns `{"result":"PONG"}`.
  - After a redeploy: call an `/api/v1` endpoint twice with a `dm_live_` key. With Upstash live, `X-RateLimit-Remaining` falls with each call (59, then 58 for a 60/min key); without it, it stays at the limit.
  - In the Upstash data browser, `regime:indicators` appears after a leaderboard view or a scoring run.
- **Production:** empty (last recorded).

## SnapTrade

- **Variables:** `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`.
- **Powers:** read-only broker linking for Players (Settings → Broker verification, through `broker.initLink`, `completeLink`, `syncTrades` and `disconnect`) and the `broker-sync` cron (22:00 UTC, Mon–Fri). The cron imports trades into `player_trades`.
- **Read by:** `packages/api/lib/snaptrade.ts:17-18`.
- **If missing:** the client is null. `broker.initLink` throws `PRECONDITION_FAILED`, Settings shows "Broker verification is not configured on this deployment", and `broker-sync` returns `snaptrade-not-configured`.
- **What a key actually turns on. Fix these before enabling it:**
  - "Verified" only means SnapTrade listed at least one account (`packages/api/routers/broker.ts:171-198`). Trades are never compared with claims.
  - "Verified" earns a badge and ×1.5 consensus weight on all of the Player's claims from the last 90 days.
  - Synced trades are stored but nothing reads them: they affect no score, rank or page.
  - The per-user SnapTrade `userSecret` is stored in plaintext in `broker_links.metadata`.
  - The first sync error leaves the link stuck in `error` with no recovery in the UI, while the badge and weight stay.
  - `initLink` passes no redirect URL, so the return to `/settings?snaptrade_success=true` depends on the SnapTrade dashboard's settings.
- **Get it:** SnapTrade dashboard → API keys (client ID and consumer key).
- **Verify:** Settings shows the connect flow instead of "not configured", and the next `broker-sync` run returns sync counts instead of `snaptrade-not-configured`.
- **Production:** empty (last recorded).

## Resend

- **Variable:** `RESEND_API_KEY`.
- **Powers:** the `daily-digest` cron (12:00 UTC, Mon–Fri; 08:00 EDT, 07:00 EST from 2026-11-01). It emails each follower a plain-text summary of new claims and outcomes from the last 24 hours.
- **Read by:** `apps/worker/functions/digest.ts:26`.
- **If missing:** the run returns `{ skipped: true, reason: "RESEND_API_KEY not set" }`.
- **Inert even with a key** (`digest.ts:156-166`):
  - It never looks up a user's email. It sends from `digest@deepmint.app` to the placeholder `user+<clerkUserId>@deepmint.app`, with links to `https://deepmint.app`.
  - Resend rejects unverified sender domains, and the recipients are not real mailboxes.
  - resend 6 returns errors instead of throwing, so the run's `sent` count includes rejected sends.
  - The Settings "Weekly" option is saved but never read.
  - Code needed first: the real address from Clerk, a sender on a verified domain, and links to `www.deepmint.ai`.
- **Get it:** resend.com → API Keys, and Domains → verify a sending domain through DNS.
- **Verify (after the code fix):** check delivery in the Resend dashboard's Emails list; do not trust `sent`.
- **Production:** empty (last recorded).

## Sentry

- **`NEXT_PUBLIC_SENTRY_DSN`** is read by `apps/web/sentry.client.config.ts`, `sentry.server.config.ts` and `sentry.edge.config.ts`. Each calls `Sentry.init` with `enabled: !!DSN` and `tracesSampleRate: 0.1`.
- **Inert:**
  - Nothing loads those files. There is no `apps/web/instrumentation.ts` or `instrumentation-client.ts`, and `next.config.ts` is not wrapped in `withSentryConfig`.
  - `app/error.tsx` and `app/global-error.tsx` report nothing.
  - **Setting the DSN does nothing.**
- **`SENTRY_AUTH_TOKEN`** is read by nothing. Only `withSentryConfig`'s source-map upload would use it.
- **To enable (code):**
  1. Add `instrumentation.ts`, whose `register()` imports the server or edge config depending on the runtime.
  2. Add `instrumentation-client.ts`, or wrap the config with `withSentryConfig`.
  3. Report request errors, for example with an `onRequestError` export.
  4. Then set the DSN.
- **Get it:** sentry.io → new Next.js project → Client Keys (DSN).
- **Verify (only after the code exists):** throw a test error and confirm it appears under Issues.
- **Production:** empty (last recorded).

## Cloudflare R2

- **Variables** (`packages/ingestion/src/r2.ts`):
  - `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`: `uploadSnapshot` throws without them.
  - `CLOUDFLARE_R2_BUCKET`: default `deepmint-snapshots`.
  - `CLOUDFLARE_R2_PUBLIC_URL`: default `https://snapshots.deepmint.com`.
- **Inert:** the only caller of `uploadSnapshot` is `captureSnapshot` in `packages/ingestion/src/capture.ts`, and nothing imports that file. `getSnapshotUrl` has no callers. Both places that insert events write `snapshot_path = null` (`apps/worker/functions/ingest.ts:104`, `backfill.ts:121`). Keys change nothing until capture is wired in.
- **Get it:** Cloudflare dashboard → R2 → create a bucket and an API token.
- **Production:** empty (last recorded).

## Flags and app variables

| Variable | Read at | Effect | Production |
|---|---|---|---|
| `INGEST_POLYGON_NEWS` | `apps/worker/functions/ingest.ts:42` | Only `"1"` adds the Wall Street ratings lane (Polygon news, 7 tickers, up to 50 articles each, every weekday 20:30 UTC). Parked on purpose: a live run of 210 articles gave 0 attributed ratings ([DEVLOG](DEVLOG.md), 2026-08-03). | Not recorded; keep unset |
| `NEXT_PUBLIC_APP_URL` | `apps/web/app/layout.tsx:22` | `metadataBase`, default `https://deepmint.app`. No metadata field uses a relative URL today, so it has no visible effect. Set it to `https://www.deepmint.ai` before adding OG images or canonical URLs. An empty value throws (`new URL("")`). Inlined at build time. | Not recorded |
| `VERCEL_URL` | `apps/web/components/providers/TRPCProvider.tsx:11` | Set by Vercel. The server-side tRPC base URL; `http://localhost:3000` without it. | Automatic |
| `NODE_ENV` | `apps/web/next.config.ts:7` | Set by Next. `development` disables the service worker. | Automatic |

The RSS lane has no variable. It reads Guides with `is_allowlisted = true` and a non-null `source_url`, and no UI or API sets those columns, so it is switched on by editing the database.

## Test-only variables

These are read from the **root** `.env.local` by `apps/web/vitest.config.ts`.

- **`TEST_API_KEY`**: a `dm_live_` key. Without it the web suite's 18 tests in 4 files skip.
  - Mint it at `/admin/api-keys` as an admin, in the database used by the server under test. The default read scopes are enough.
  - Admins are the only people who can mint keys; the UI offers only the 3 read scopes.
- **`TEST_BASE_URL`**: default `http://localhost:3000`. The server must be running.
- **`TEST_ENTITY_SLUG`**: default `demo-guide`, which no seed creates. Use a seeded slug such as `sarah-chen`.
- **Expected failure:** the authenticated MCP test fails until the MCP route's base-path bug is fixed. `/api/mcp` answers 404 after auth, because `mcp-handler` 1.1.0 defaults to serving `/mcp`.

## Names that nothing reads

These appear in older templates or docs; setting them has no effect.

- `REDIS_URL`. The docker-compose Redis container is unused: all Redis access is Upstash REST. (`mcp-handler` reads it only for its SSE transport, which this app never reaches.)
- `SENTRY_AUTH_TOKEN`.
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`.
- `INNGEST_API_KEY`.

## Local env files

No tool reads a root `.env`.

| Tool | Reads |
|---|---|
| `pnpm --filter @deepmint/web dev` (Next.js and the Inngest functions it serves) | `apps/web/.env.local` and the other `apps/web/.env*` files, not the repo root |
| drizzle-kit (`db:migrate`, `db:generate`, `db:push`, `db:studio`) | `packages/db/.env` (not `.env.local`), or the shell |
| vitest in web, api, ingestion, scoring and shared | the root `.env.local`; write values unquoted, empty values are skipped |
| `db:seed`, the backfill CLI, the `tsx -e` checks above | the shell only |

Under root `pnpm dev` and `pnpm test` (turbo), shell-exported variables do not reach the tasks (except `NEXT_PUBLIC_*` for the web app): `turbo.json` declares no `env`, and Turbo 2 runs in strict mode. Variables in the files above are read from disk, so they are not affected.

## How to add a key to production (Vercel)

Project `deepmint-web-7ald`, team `nmasambas-projects`. Production builds `apps/web` from `main`.

```bash
vercel whoami   # the token had expired on 2026-10-05; if this fails: vercel login
vercel link     # once per checkout; writes the gitignored .vercel/project.json
# NOTE: use echo (trailing newline). printf without \n sets an EMPTY value.
echo 'VALUE' | vercel env add VAR_NAME production --force
```

Repeat for each variable, then redeploy, because env changes reach only new deployments. `NEXT_PUBLIC_*` values are inlined at build time, and several clients read their keys once when the module loads. Redeploy either from the Vercel dashboard (Deployments → latest production → Redeploy) or with an empty commit:

```bash
git commit --allow-empty -m "chore: redeploy for <keys>" && git push
```

Production values are stored as sensitive, so `vercel env pull` cannot read them back (it returns `[SENSITIVE]`, per the 2026-08-03 DEVLOG entry). Confirm instead from the CLI output: the "Overrode Environment Variable" success message, plus the `> Removed trailing newline from stdin input` line, which shows a non-empty value arrived. Then run the service's own **Verify** step above.

For local work, put the value in `apps/web/.env.local` (dev server), and in the root `.env.local` only if a test needs it. Use the `www.deepmint.ai` host in any webhook URL.

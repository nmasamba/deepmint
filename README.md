# Deepmint

**Market calls, recorded before the fact and scored against real prices after it.**

## What is Deepmint?

Deepmint keeps score of stock-market predictions.

When someone makes a call such as "Nvidia will be higher in 3 months", Deepmint stores it as a **claim**: which stock, which direction, for how long, and the stock's most recent closing price. Deepmint never edits the claim afterwards. When the 3 months are up, it looks up the real closing price, works out whether the call was right and how much it would have gained or lost, and adds that result to the author's track record.

Over many claims this builds a scorecard: how often someone is right, how much their calls return, and where they rank against everyone else. Deepmint also combines everyone's recent calls on a stock into a weighted **consensus**.

Today Deepmint covers seven large US technology stocks, the "Magnificent 7": Apple, Microsoft, Alphabet, Amazon, Nvidia, Meta and Tesla. That is a deliberate choice: more stocks will follow, but only once the core product has matured. [What's live today](#whats-live-today) has the details.

**Where to find it:** the app is live, ahead of its public launch, at [www.deepmint.ai](https://www.deepmint.ai). Sign up there, then log a call with **New Claim** (or **Make a Prediction** on the dashboard). Every page except the landing page needs an account.

## Who is it for?

| Who | What they can do today |
|---|---|
| **Guides**: analysts and research firms | Their calls are collected for them. Deepmint reads their published posts, or an archive of past posts, and an AI model extracts the calls. A Guide needs no account. Nobody can sign up as a Guide or claim a Guide profile yet: the landing page's "Sign Up as a Guide" button creates an ordinary Player account. |
| **Players**: everyone who signs up | Log your own claims in the web app. They are checked against real prices by the same rules as Guides' claims. You appear on the leaderboard next to the Guides. You can also run practice ("paper") portfolios with virtual money. |
| **Followers** | This is not a separate account type. Any Player can follow Guides and other Players, read their claims in a "Following" feed, keep a watchlist of stocks, and use "Mirror Signals" to copy someone's calls into a paper portfolio. Mirroring only logs trades when the person you mirror is a Player who logs a new claim. Mirroring a Guide logs nothing yet. |
| **Admins** | Admin rights are granted by the maintainer in Clerk. Admins approve or reject claims held for review, manage the list of stocks and issue API keys. |
| **Developers and AI agents** | Read scores, consensus and leaderboards through a REST API, using a key issued by an admin. An AI-agent (MCP) server exists in the code but cannot be used yet. |

## Why does it exist?

Market predictions are everywhere: TV, newsletters, social media, bank research notes. Almost nobody keeps score. Calls are vague about timing, wrong ones are quietly forgotten, and right ones get repeated. You cannot tell skill from luck or from selective memory.

Deepmint's answer:

- **Record it before the outcome.** A claim is stored with its date and an entry price before anyone knows how it turns out. The exceptions are backfilled history (past posts loaded from an archive, dated to when they were published) and analyst ratings, which are dated to the day the rating was issued. Self-logged claims are also not fully "before the fact" yet: their entry price is the previous close, so part of the move can already be visible (see [Main limitations](#whats-live-today)).
- **Never rewrite it.** Claims are append-only. The only change allowed is an admin approving or rejecting a claim that was held for review. The application code enforces this; the database itself does not.
- **Put a deadline on every call.** Every claim has a horizon between 1 day and 1 year, so "eventually" does not count.
- **Use real prices and plain statistics.** Results come from end-of-day closing prices (Polygon), and scores are ordinary statistics such as hit rate, average return and the Sharpe ratio. No AI is involved in scoring. The only AI in Deepmint is the model that reads text to pull out claims.

## How does it work?

```mermaid
flowchart TD
  P["Player logs a claim in the web app"] --> A
  G["Guide posts collected from feeds or an archive"] --> L["AI model extracts claims and checks the evidence"]
  L -->|"confident, horizon quoted"| A["Active claim, stored with an entry price"]
  L -->|"not sure"| R["Admin review queue"]
  R -->|"approve"| A
  R -->|"reject"| X["Rejected, kept on record"]
  A -->|"horizon ends"| M["Markout: compare with the closing price"]
  M --> S["Scoring: hit rate, returns, EIV"]
  S --> B["Leaderboard"]
  S --> C["Consensus for each stock"]
```

1. **A claim is captured.**
   - **Players** use the claim form. They pick a stock, a direction (long = up, short = down, neutral = roughly flat), a horizon and a confidence from 0 to 100 (the slider starts at 50 and is always sent), and can add a target price, a written rationale and tags. The claim goes live at once. Its entry price is the **previous trading day's close**, not a live price.
   - **Guides**: every weekday a job reads new posts from the Guide feeds an operator has switched on. If enabled, it also reads a news feed of Wall Street analyst ratings; that feed is off by default. An operator can also load an archive of a Guide's past posts (a "backfill"). Each post is stored with a fingerprint (a hash of its link, text and publication date), so a post seen again is skipped. A feed item with no date is fingerprinted with the time it was fetched instead, so it can be stored again on a later run.
2. **An AI model reads Guide posts.** A large language model (open models served through Hugging Face) pulls out each call: which of the 7 stocks, which direction, which horizon and any target price. It keeps a supporting quote and the stated horizon only if they appear word for word in the post. Posts that name none of the 7 companies are skipped without calling the model.
3. **Uncertain claims wait for a person.** An extracted claim goes live only if all of these hold:
   - the model is at least 80% confident;
   - the verified quote states exactly that horizon, for example "3 months";
   - for a Wall Street rating, the firm that issued it is named.

   Otherwise the claim waits in an admin review queue, where an admin approves or rejects it. A repeat of an existing call (same author, stock, direction, horizon and day) is skipped.
4. **The horizon runs out.** A claim "matures" once its horizon has passed.
5. **Markout.** Every weekday evening a job takes each matured active claim and looks up the closing price on its end date. It records the **outcome**:
   - the return, in basis points;
   - whether the direction was right (a neutral call is right if the price moved 2% or less either way);
   - whether the target price was reached.
6. **Scoring.** Straight after the markout, each author's statistics are recalculated from their outcomes. Everyone gets a hit rate, an average return and an EIV score. Guides also get calibration and significance measures. Players also get risk measures such as the Sharpe ratio and maximum drawdown.
7. **Leaderboard and consensus.** The leaderboard ranks authors by the new scores. For each stock, Deepmint recalculates the consensus: a weighted vote (bullish, bearish or neutral) of the active claims from the last 90 days. Claims count for more when their author has a higher EIV, is a Guide or is a broker-verified Player, when they are newer and when their confidence is higher.
8. **Nightly fingerprint.** Every night a job hashes the previous day's claims into a single Merkle root and stores it in the database. The roots are not yet published, anchored outside the database or checkable by users.

## When do things happen?

All schedules run in UTC. US Eastern time is UTC−4 until 2026-11-01 (EDT) and UTC−5 from then until 2027-03-14 (EST).

| Job | What it does | UTC | Eastern (EDT / EST) | Days |
|---|---|---|---|---|
| Daily digest | Emails a summary of followed activity (not delivered today; see below) | 12:00 | 08:00 / 07:00 | Mon–Fri |
| Ingest | Collects new Guide posts, then hands them to extraction | 20:30 | 16:30 / 15:30 | Mon–Fri |
| Markout | Checks matured claims against closing prices | 21:00 | 17:00 / 16:00 | Mon–Fri |
| Broker sync | Imports trades from linked brokerage accounts | 22:00 | 18:00 / 17:00 | Mon–Fri |
| Merkle audit | Fingerprints the previous day's claims | 22:00 | 18:00 / 17:00 | Every day |

Other jobs run in a chain rather than on a clock:

- Extraction runs right after ingest, but only when ingest found new posts.
- Scoring runs after the markout (or a backfill), but only if it wrote at least one outcome. Consensus and influence are recalculated after scoring. So **consensus is not refreshed on days when no claim matures**.
- During EST the ingest run (15:30 ET) starts before the 16:00 US market close, and the markout runs at the close itself. A day's closing price is probably not available yet, so most outcomes will likely land one trading day later in winter.

**Horizons.** Every claim uses one of six horizons:

| Horizon | Days | Label in the app |
|---|---|---|
| 1 day | 1 | 1D |
| 1 week | 7 | 1W |
| 1 month | 30 | 1M |
| 3 months | 90 | 3M |
| 6 months | 180 | 6M |
| 1 year | 365 | 1Y |

A claim's end date is its creation date plus the horizon in calendar days. If that falls on a weekend it moves to the Monday. Market holidays are not handled. If no closing price exists for the end date, the markout skips the claim and retries on its next run with the same end date, so a claim whose end date is a market holiday never gets an outcome ([known issue](docs/KNOWN_ISSUES.md#markout-holiday-exit-never-priced)).

## Where does it run?

| Piece | Where | Who can use it |
|---|---|---|
| Web app | [www.deepmint.ai](https://www.deepmint.ai), hosted on Vercel. `deepmint.ai` redirects to `www`. | Only the landing, sign-in and sign-up pages are public. Every other page needs an account. |
| REST API | `https://www.deepmint.ai/api/v1`: `GET /entities/{slug}/scores`, `GET /instruments/{ticker}/consensus`, `GET /leaderboard?metric=…`, plus the spec at `/openapi.json` | The three data endpoints need an API key (`Authorization: Bearer dm_live_…`), and only admins can create keys. The spec needs no key; signed-in users can also browse it at `/docs/api`. |
| AI-agent server (MCP) | `/api/mcp` | **Not usable.** The tools are written, but the handler is mounted at the wrong path, so every authenticated request returns 404. Only the "missing or invalid key" check (401) works. |
| App API (tRPC) | `/api/trpc` | Used by the web app itself. Its read-only public calls answer without sign-in. |
| Background jobs | 15 Inngest functions, served by the web app at `/api/inngest`. Inngest Cloud calls them on schedule. There is no separate worker server. | Run automatically |
| Database | PostgreSQL on Supabase | Operators only |
| Outside services | Clerk (sign-in), Polygon (end-of-day stock prices), Hugging Face router (the extraction model) | — |

## What's live today?

Deepmint is a **pre-launch MVP**. As of 2026-10-05:

- **Site.** The app runs at [www.deepmint.ai](https://www.deepmint.ai). Its "live stats" section is hidden until launch.
- **Sign-in.** Production uses a Clerk *development* instance. When checked on 2026-10-05 it offered Google, Apple, and username plus password. Facebook and X sign-in are not configured.
- **Stocks: Mag-7 only, by design.**
  - Deepmint stays with the Mag 7 until its core features have matured. Covering more stocks is planned for after that, not before.
  - The seven Mag-7 stocks were added to production on 2026-08-11.
  - Extraction accepts only those 7 tickers (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA). Stock pages render only for them; any other symbol shows "Coming soon".
  - Groundwork for more stocks already exists but is dormant. An admin button can add 50 S&P 500 stocks, and self-logged claims, search and paper trades accept any active stock in the database. There is no record of whether the button has been used in production. Pressing it before expansion is ready would expose the gaps listed under [instrument-universe-inconsistent](docs/KNOWN_ISSUES.md#instrument-universe-inconsistent).
- **Keys.** Production key status was last recorded on 2026-07-02 in [docs/EXTERNAL_KEYS.md](docs/EXTERNAL_KEYS.md); it could not be re-checked on 2026-10-05. At that time the database, Clerk, Polygon, Hugging Face and Inngest keys were set, and Upstash, Sentry, R2, SnapTrade and Resend were empty.

**What works:**

- signing up, and logging your own claims;
- extracting claims from Guide posts, with the evidence check and admin review;
- the daily markout, scoring and consensus;
- the leaderboard by Hit Rate, Sharpe, EIV and Avg Return;
- Guide and Player profiles;
- following, watchlists and in-app notifications;
- paper portfolios;
- the Learn modules;
- the REST API, with admin-issued keys.

**Main limitations:**

- **Results.** Claim cards never show a claim's own result. A single claim's result appears only in the in-app "claim resolved" notification sent to its author; everyone else sees only the author's overall scores.
- **Entry prices.** Self-logged claims are priced at the previous close, so a Player can log a call after seeing part of the day's move. This matters most for 1-day claims.
- **Leaderboard.**
  - Each visit can take about 3 minutes to fill in. The page recomputes current market conditions from about 25 rate-limited price requests, and the cache that would avoid this (Upstash) was last recorded as not configured.
  - There is no minimum number of outcomes, so one lucky call can top the board.
  - The "Most Influential" tab and the regime filters (Bull, Bear and so on) always come back empty.
- **Daily ingestion.** The daily Guide collection does nothing until an operator switches on a Guide's feed by editing the database (there is no admin control for it) or enables the Wall Street ratings feed (off by default). Whether any feed is switched on in production is not recorded.
- **Not working yet:**
  - The MCP agent server (404, see above).
  - Daily digest emails. They are addressed to a placeholder, and Resend was last recorded as not configured.
  - Mirroring a Guide, which never creates trades.
- **Rate limits.** Rate limits need Upstash, which was last recorded as not configured.
- **Error tracking and snapshots.** Error tracking (Sentry) and source snapshots (Cloudflare R2) are not wired into the app. Setting their keys alone does not turn them on.
- **Audit.** The nightly audit roots are not published, and they do not cover claims stored with an earlier date, such as backfilled history.
- **Missing features.** There is no way to become a Guide, edit your profile, add notes to a claim or request a new stock.
- **Wording.** The site's copy says "AI scores" calls. In fact scoring is plain statistics; AI is used only to extract claims.

The full list is in [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Glossary

| Term | Meaning |
|---|---|
| **Claim** | A dated call on one stock: a direction (long, short or neutral), a horizon, and an optional target price and confidence. The app also calls it a "prediction". |
| **Horizon** | How long a claim runs before it is checked: 1 day, 1 week, 1 month, 3 months, 6 months or 1 year. |
| **Entry price** | The closing price stored with a claim. For claims logged now it is the previous trading day's close. For dated or backfilled claims it is the close on that date. |
| **Markout** | Checking a claim against the market when its horizon ends, using that day's closing price. Each claim gets one **outcome**: its return, whether the direction was right, and whether the target was reached. |
| **Hit rate** | The share of an author's checked claims whose direction was right. |
| **Basis points (bps)** | Hundredths of a percent: 100 bps = 1%. Returns are stored in basis points. |
| **EIV** | Deepmint's 0–100 "edge" score. It combines how far the hit rate is above 50%, the average return, calibration (Guides only), and a discount for small samples. It is 0 when the hit rate is 50% or lower, or when the average return is zero or negative. The code calls it "Expected Information Value"; profile pages say "Earned Information Value". |
| **Consensus** | For each stock, stored as one row per day: the weighted share of bullish, bearish and neutral active claims from the last 90 days, plus an overall direction and a 0–1 conviction. |
| **Guide** | An analyst or firm whose published calls Deepmint collects. Guides are created only by the ingestion pipeline (and, with fictional data, by the local seed script). |
| **Player** | Anyone who signs up. Every account is a Player. |

## For developers

### Stack

| Area | Technology |
|---|---|
| Monorepo | pnpm 10.32.1 workspaces, Turborepo 2 |
| Web | Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui components, Serwist (PWA) |
| API | tRPC v11 (15 routers, 72 procedures), REST `/api/v1`, MCP via `mcp-handler` |
| Database | PostgreSQL (16 in Docker locally, Supabase in production) with Drizzle ORM 0.41 |
| Background jobs | Inngest 4 (15 functions) |
| Auth | Clerk (`@clerk/nextjs` 7) |
| Market data | Polygon.io through `@massive.com/client-js` (US stock endpoints only) |
| Extraction LLM | OpenAI SDK pointed at the Hugging Face router: `openai/gpt-oss-120b:fastest`, with fallback `meta-llama/Llama-3.3-70B-Instruct:fastest` |
| Optional services | Upstash Redis (rate limits, two small caches), Resend (email), SnapTrade (broker linking) |
| Tests | Vitest |

### Repo map

```
apps/
  web/         Next.js app: pages, /api/trpc, /api/v1, /api/mcp, Clerk webhook, /api/inngest
  worker/      The 15 Inngest functions (served by apps/web) and the backfill CLI
packages/
  api/         tRPC routers
  db/          Drizzle schema, migrations (drizzle/0000–0007), seed script
  ingestion/   Feed adapters, LLM extractor, content hashing
  scoring/     Pure scoring functions: hit rate, Brier, Sharpe, EIV, consensus, regime
  shared/      Polygon price client, Merkle tree, constants (Mag-7 list, horizons)
tooling/
  tsconfig/    Shared TypeScript configs
  eslint/      ESLint config (not used by any package yet)
docs/          Project docs (see Documentation below)
```

### Local setup

You need Node 22 (`package.json` asks for 20 or later; CI uses 22), pnpm 10.32.1, Docker, and a Clerk application of your own. A Clerk development instance gives you a `pk_test_` / `sk_test_` key pair.

**1. Install and start the database**

```bash
corepack enable          # uses the pnpm version pinned in package.json
pnpm install
docker compose up -d
```

This starts Postgres 16 on **localhost:5433**; the user, password and database are all `deepmint`. It also starts Redis 7 on port 6379, which no code uses: all Redis access goes to Upstash over REST.

**2. Create the env files**

No tool reads a root `.env`, so do **not** run `cp .env.example .env`. [`.env.example`](.env.example) is a template of the variables the code reads, grouped by service, with what each one does. Copy the lines you need into these files:

| File | Read by | What to put in it |
|---|---|---|
| `apps/web/.env.local` | The Next.js dev server, and the Inngest functions it serves | `DATABASE_URL`, the Clerk keys, `INNGEST_DEV=1`, and optionally `POLYGON_API_KEY` and `HF_API_KEY` |
| `packages/db/.env` | drizzle-kit (`db:migrate`, `db:generate`, `db:push`, `db:studio`). It reads `.env`, not `.env.local`. | `DATABASE_URL` |
| Root `.env.local` | Vitest, in every package | Only what tests need (see [Tests](#tests)) |
| None (shell only) | `db:seed` and the backfill CLI | Pass the variables on the command line, as shown below |

**Prefer one file?** Keep everything in the root `.env.local` and link it into the other two places. Both loaders read the files normally, so symlinks work:

```bash
ln -s ../../.env.local apps/web/.env.local
ln -s ../../.env.local packages/db/.env
```

A minimal `apps/web/.env.local`:

```dotenv
DATABASE_URL=postgresql://deepmint:deepmint@localhost:5433/deepmint
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
INNGEST_DEV=1
```

What happens when an optional key is missing:

| Variable | Effect when unset |
|---|---|
| `POLYGON_API_KEY` | The Mag-7 get fixed dev prices and any other ticker fails. Regime detection uses default values. New instruments added by an admin are deactivated, because no price history comes back. |
| `HF_API_KEY` | Every extraction throws, so posts never get claims. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | No rate limits, and no follower-count or regime cache. Prices are never cached either way. |
| `CLERK_WEBHOOK_SECRET` | Not needed locally. Your Player record is created on your first signed-in request. |
| `RESEND_API_KEY`, `SNAPTRADE_*` | The digest is skipped, and broker linking shows "not configured". |
| `CLOUDFLARE_R2_*`, `NEXT_PUBLIC_SENTRY_DSN` | Nothing changes: no running code uses them, set or not. |

Locally, leave `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` empty and rely on `INNGEST_DEV=1`. Without `INNGEST_DEV`, production keys in those variables would send your local events to production Inngest. `INGEST_POLYGON_NEWS=1` turns on the Wall Street ratings feed, which is off by default.

`turbo.json` declares no env variables, and Turbo 2 runs in strict env mode, so variables exported in your shell may not reach tasks started with root `pnpm dev` or `pnpm test`. Turbo also does not count `.env.local` edits when it caches results, so root `pnpm test` can replay stale results. Keep variables in the files above, and prefer `pnpm --filter`.

**3. Run the migrations**

```bash
pnpm --filter @deepmint/db db:migrate
```

This applies the committed migrations 0000–0007. Do not run `db:generate` as a setup step; it is only for after you edit the schema.

**4. Seed the local database (local only, once)**

```bash
DATABASE_URL=postgresql://deepmint:deepmint@localhost:5433/deepmint pnpm --filter @deepmint/db db:seed
```

The seed inserts:

- the 7 Mag-7 instruments;
- fictional data: 5 Guides (such as `sarah-chen`), 3 Players, 100 active claims backdated 90–365 days, player trades, synthetic consensus rows, influence events and follows.

It writes **no outcomes or scores**. It is not idempotent, so run it once, on an empty database. **Never run it against production**: it writes fake claims into the append-only ledger.

**5. Run the app**

```bash
pnpm --filter @deepmint/web dev    # http://localhost:3000
```

Sign up, and your Player record is created on your first signed-in request. Root `pnpm dev` also starts the worker's `dev` script, which only logs "Deepmint worker loaded: 15 functions registered" and serves nothing. The worker's `start` script points at a file that does not exist.

**6. Run background jobs locally (optional)**

This step is not scripted in the repo; it follows from how the Inngest SDK behaves. With `INNGEST_DEV=1` set in `apps/web/.env.local`, start the Inngest dev server against the app:

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Its UI at http://localhost:8288 lets you invoke the cron functions by hand. Without `INNGEST_DEV`, inngest 4.1.0 runs in cloud mode, and sending any event fails without an event key.

To load a historical archive of a Guide's posts:

```bash
INNGEST_DEV=1 pnpm --filter @deepmint/worker backfill ./archive.json   # path relative to apps/worker
```

The archive format is documented at the top of [`apps/worker/scripts/backfill.ts`](apps/worker/scripts/backfill.ts).

**7. Make yourself an admin**

In the Clerk dashboard, set your user's private metadata to `{"role": "admin"}`. The Admin section (Claim Review, Instruments, API Keys) then appears in the sidebar. There is no in-app way to grant admin.

### Common commands

| Command | What it does |
|---|---|
| `pnpm --filter @deepmint/web dev` | Runs the web app on port 3000 |
| `pnpm check` | Type-checks all 7 packages with `tsc --noEmit` (all pass) |
| `pnpm --filter <package> test` | Runs one package's tests |
| `pnpm --filter @deepmint/db db:migrate` | Applies pending migrations (reads `packages/db/.env`) |
| `pnpm --filter @deepmint/db db:generate` | Writes a new migration after a schema edit |
| `pnpm --filter @deepmint/db db:studio` | Opens Drizzle Studio |
| `pnpm --filter @deepmint/worker backfill <file>` | Sends a `backfill/requested` event |
| `pnpm --filter @deepmint/web build` | Production build of the web app |
| `pnpm lint` | **Does not work.** `apps/web` has no ESLint config or ESLint dependency. |

### Tests

These results were measured on 2026-10-05 with no `.env.local`.

| Command | Result without keys | What enables more |
|---|---|---|
| `pnpm --filter @deepmint/scoring test` | 87 passed (6 files) | Nothing needed |
| `pnpm --filter @deepmint/shared test` | 16 passed (2 files) | Nothing needed |
| `pnpm --filter @deepmint/api test` | 5 passed (1 file) | Nothing needed |
| `pnpm --filter @deepmint/ingestion test` | 56 passed, 6 skipped | `HF_API_KEY` in the root `.env.local` runs the 6 live LLM tests. They make real Hugging Face calls, with a 420 s timeout each. |
| `pnpm --filter @deepmint/web test` | 18 skipped (4 files) | `TEST_API_KEY` (a `dm_live_` key), a running server at `TEST_BASE_URL` (default `http://localhost:3000`) and a database. `TEST_ENTITY_SLUG` defaults to `demo-guide`, which no seed creates; use, for example, `sarah-chen`. The one authenticated MCP test fails because of the 404 bug. |

The worker has no tests.

### Migrations

**Locally:**

1. Edit the schema in `packages/db/schema/`.
2. Run `pnpm --filter @deepmint/db db:generate`.
3. Review the new SQL in `packages/db/drizzle/`.
4. Run `db:migrate`.
5. Commit the SQL file together with the updated `meta/` files.

**In production (Supabase):** changes are applied by hand.

1. Paste the migration's `.sql` file into the Supabase SQL editor and run it.
2. Then record it in Drizzle's journal table:

   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('<sha256 hex of the .sql file>', <journal "when">);
   ```

   Get the hash with `shasum -a 256 packages/db/drizzle/<file>.sql`. The `when` value is in `packages/db/drizzle/meta/_journal.json`.
3. Apply migrations in order. Drizzle's migrator compares only the latest journal row's `created_at` with each migration's `when`.

Example: `0007_cool_mercury.sql` adds `claims.horizon_stated` and `claims.source_excerpt`. Its hash is `15441b1053e13f3e0c9ebeb90b35c3111cbe435b340026298a8fc7219ce654d0` and its `when` is `1791195622034`. It was applied and verified on 2026-10-05.

Keep in mind:

- The `DATABASE_URL` in the root `.env.local` points at local Docker (port 5433), never at production.
- Never run `db:seed` against production.
- Do not use `packages/db/run-migration.mjs`. It hard-codes the main checkout's path and exits 0 even when a migration fails.

### Deployment

- **Vercel.**
  - Project `deepmint-web-7ald` (team `nmasambas-projects`) uses Root Directory `apps/web`.
  - The Git integration builds `main` to production on Node 24.x. The latest production deploy is `cd63901`.
  - Production runs `cd ../.. && pnpm install` and `cd ../.. && pnpm --filter @deepmint/web build`. The root [`vercel.json`](vercel.json) holds the same commands, but Vercel reads `vercel.json` from the Root Directory, so the dashboard settings are probably the ones that apply.
- **Domains.**
  - `https://www.deepmint.ai` is canonical, and `deepmint.ai` redirects to it with a 307.
  - `deepmint-web-7ald.vercel.app` also serves the app.
  - Webhook URLs must use the `www` host.
- **Environment variables.** Changing an env var requires a redeploy to take effect.
- **Inngest.** The app `deepmint` is synced to production through the Vercel integration. Its keys arrive with an `INNGEST_WORKFLOW_` prefix, and `apps/web/app/api/inngest/inngest-env.ts` maps them to the names the SDK reads. The functions run inside the Vercel deployment at `/api/inngest`.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
  - Runs on every push and pull request to `main`, on Node 22.
  - Type-checks `scoring` and `shared`.
  - Tests `scoring`, `shared` and `ingestion`; the live LLM tests are skipped.
  - Builds the web app, which also type-checks most of `api`, `db`, `ingestion` and `worker`.
  - Does not run the `api` or `web` tests, lint, or a database.
  - It was broken at the pnpm setup step from August 2026 until PR #9 fixed it on 2026-10-05.

## Documentation

| Doc | What it covers |
|---|---|
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Known bugs, gaps and limitations, ranked by severity |
| [docs/EXTERNAL_KEYS.md](docs/EXTERNAL_KEYS.md) | Each external service key: what it enables, how to get it, how to verify it, and the last recorded production status |
| [docs/DEVLOG.md](docs/DEVLOG.md) | Dated development notes and decisions, newest first |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Versioned change history |
| [docs/NEXT_SESSION_PROMPT.md](docs/NEXT_SESSION_PROMPT.md) | A kickoff prompt for a new agent session: current state, working rules and the next two workstreams |
| [SPRINT_LOG.md](SPRINT_LOG.md) | An index of the project's phases, from Sprint 1 (March 2026) to October 2026, with links to the CHANGELOG and DEVLOG |
| [.env.example](.env.example) | Template of the environment variables, grouped by service, and which local file each belongs in |

Merged pull requests are listed by `git log --first-parent origin/main`.

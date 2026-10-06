# Fresh-session kickoff prompt

Paste the block below into a new Claude Code session opened in this repo (root or a worktree). It reflects `main` at `cd63901` on 2026-10-05. Update it whenever the state it describes changes.

Docs it points to: [README](../README.md) · [KNOWN_ISSUES](KNOWN_ISSUES.md) · [EXTERNAL_KEYS](EXTERNAL_KEYS.md) · [DEVLOG](DEVLOG.md)

---

```text
You are picking up Deepmint: a pnpm/Turborepo monorepo with apps/web (Next.js 15),
apps/worker (15 Inngest functions, served by apps/web at /api/inngest) and
packages/{api,db,ingestion,scoring,shared}. State below is as of 2026-10-05, main = cd63901.

READ FIRST
- README.md
- docs/KNOWN_ISSUES.md: the verified open issues, by severity
- docs/EXTERNAL_KEYS.md: which keys are set or empty, and how to add one
- docs/DEVLOG.md: the newest entries at the top (2026-10-06 and 2026-10-05)

CURRENT STATE
- Production: https://www.deepmint.ai (canonical; deepmint.ai 307-redirects to www, and webhook
  URLs must use www). Vercel project deepmint-web-7ald (team nmasambas-projects) builds apps/web
  from main. Inngest app "deepmint" is synced through the Vercel integration.
- Pre-launch. Auth runs on a Clerk DEVELOPMENT instance (pk_test_ keys).
- DB is Supabase. Migrations 0000-0007 are applied; 0007_cool_mercury (claims.horizon_stated,
  claims.source_excerpt) was applied and verified on 2026-10-05. The Mag-7 instruments were
  seeded on 2026-08-11.
- Extraction LLM: OpenAI SDK -> Hugging Face router (https://router.huggingface.co/v1, HF_API_KEY).
  Code defaults: openai/gpt-oss-120b:fastest, fallback meta-llama/Llama-3.3-70B-Instruct:fastest
  (packages/ingestion/src/extractor.ts:43,48). LLM_MODEL and LLM_MODEL_FALLBACK were deleted from
  Vercel and .env.local on 2026-10-05, so the defaults apply; do not set them again (a pinned
  "model:provider" disables the router's failover). Each success logs
  "[extractor] Answered by <model> (<provider>)".
- Scoring is deterministic statistics, not AI. The extraction LLM is the only model in the system.
- Merged 2026-10-05:
  #6 extractor integrity (throw on truncation, evidence gate, verified quotes, migration 0007,
     :fastest models, model reporting)
  #8 integer confidence, all-or-nothing claim inserts
  #9 CI fix
  #7 backfill matures only active claims and recovers retries; scores, digest and landing
     stats count only active claims' outcomes
- CI (.github/workflows/ci.yml) failed at pnpm setup from August until #9; it was green on #9.
  It type-checks scoring and shared, tests scoring, shared and ingestion (live LLM tests skip),
  and builds web. It does not run the api or web tests, lint or a database.
  `pnpm check` passes for all 7 packages. `pnpm lint` does not work (no ESLint config).
- Production keys could NOT be re-verified on 2026-10-05 (the Vercel CLI token has expired and
  the connector cannot list env vars). Last recorded status (2026-07-02):
  set: DATABASE_URL, Clerk keys, POLYGON_API_KEY, HF_API_KEY, Inngest (INNGEST_WORKFLOW_ prefix);
  empty: Upstash, Sentry, R2, SnapTrade, Resend. Treat it as last recorded, not current.

WORKING RULES
1. Live tests over mocks. Call the real services (HF, Postgres, Polygon) and gate each live test
   with describe.skipIf(!process.env.X). No mock data.
2. Before writing or running anything that needs a key, list the env vars it needs, check the
   root .env.local (every vitest config reads that file), and ask me for any that are missing.
3. Extraction uses open models through the HF router. Never Anthropic, never OpenAI's own API.
4. Supabase only through SQL I paste. The root .env.local DATABASE_URL is LOCAL Docker
   (localhost:5433), never production, and you have no route to production.
   - For a production read, give me ONE statement. The SQL editor shows only the last
     statement's result, so combine checks with UNION ALL.
   - For a migration, give me the .sql contents, then its journal row:
     INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     VALUES ('<sha256 hex of the .sql file>', <"when" from packages/db/drizzle/meta/_journal.json>);
     Add rows in order. Apply locally from the worktree that holds the migration with
     `DATABASE_URL=postgresql://deepmint:deepmint@localhost:5433/deepmint pnpm --filter @deepmint/db db:migrate`
     (drizzle-kit reads packages/db/.env or the shell, never .env.local).
     Do not use packages/db/run-migration.mjs.
   - Never run db:seed against production: it writes fictional Guides and 100 fake claims.
5. The ledger is append-only. claims, events and notes are never updated or deleted. The only
   allowed UPDATE is the admin status change pending_review -> active | rejected. Outcomes are
   written once per claim. No DB constraint enforces this, so the code must. A bad row cannot be
   corrected later, so fail loudly rather than write a guessed value.
6. Smallest diff that fixes the problem. No drive-by refactors.
7. One branch and one PR per change. Never commit to main and never merge; I merge.
   Run `pnpm check` and the touched packages' tests before opening the PR.
8. Add a docs/DEVLOG.md entry per change, at the top: what changed, how it was verified live,
   and what is not fixed.
9. Work one step at a time and check with me before moving on.
10. Mag-7 only for now. Expanding beyond the Mag 7 is planned only once the core product has
    matured. Don't propose it as a fix, and don't press the admin "Seed S&P 500 Top 50" button.

NEXT: workstream A is done; B remains. Ask me before starting.

A. Done: self-logged and undated claims are stored with entry_price_cents = null and entered by
   markout at the first close after they are made; the price is recorded on the outcome. Pick the
   next item from docs/KNOWN_ISSUES.md by severity instead.

B. Upstash Redis (priority 1 in docs/EXTERNAL_KEYS.md) plus the leaderboard's regime lookup
   (high, latency).
   - getRegimeIndicators makes ~25 Polygon calls behind the 12.5 s throttle, about 2.5-3 minutes
     on a fresh instance (packages/shared/src/polygon.ts:406-457). Its 1-hour cache works only
     with Upstash (packages/shared/src/polygonCache.ts:21-42).
   - It runs inside page requests: regime.current (the leaderboard page; also MCP
     get_current_regime) and leaderboard.bestInCurrentConditions. httpBatchLink batches both
     with leaderboard.top, so the whole leaderboard table shows skeletons until the lookup ends.
   - Upstash also switches on rate limits (claims.submit 10/h, broker sync 1/h, v1 and MCP per key
     per minute) and the follower-count cache. It does NOT cache prices.
   - Steps:
     1. I run `vercel login`. You list env var NAMES, never values, to refresh
        docs/EXTERNAL_KEYS.md. Include whether an unprefixed INNGEST_EVENT_KEY exists: the
        Inngest clients in packages/api/routers read only unprefixed keys.
     2. I paste the Upstash REST URL and token. Add each with
        `echo 'VALUE' | vercel env add VAR production --force` (echo, not printf: printf without \n
        sets an empty value). Mirror them into the root .env.local and apps/web/.env.local. Functions only
        see new env after a fresh production deploy; ask me before triggering one.
     3. Verify: X-RateLimit-* headers are sent even without Upstash, so check that
        X-RateLimit-Remaining drops between two /api/v1 calls with the same key.
     4. Code: even with Upstash, the first visitor after each 1-hour expiry still waits minutes.
        Take the regime lookup off the request path, and agree the design with me first.
        @deepmint/shared does not declare @upstash/redis, so outside the Next build (vitest, tsx)
        the cache silently disables itself.

Everything else is in docs/KNOWN_ISSUES.md. That includes the other high-severity issue,
a small fix: /api/mcp returns 404 to every authenticated request, because createMcpHandler is
called with no basePath (apps/web/app/api/mcp/route.ts:50).
```

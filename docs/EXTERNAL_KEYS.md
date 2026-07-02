# External Keys — Priority & Setup

> Re-prioritised 2026-05-05 for **urgency given production is live** (Inngest
> pipeline running, `/api/v1` + `/api/mcp` exposed), not feature-completeness.

## Already configured ✅
`DATABASE_URL` (Supabase) · Clerk (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`) · `POLYGON_API_KEY` · `HF_API_KEY` · `LLM_MODEL` (`openai/gpt-oss-120b:cerebras`) + `LLM_MODEL_FALLBACK` · Inngest (`INNGEST_WORKFLOW_INNGEST_EVENT_KEY` / `_SIGNING_KEY` via the Vercel integration).

## Still empty — prioritised

### 🔴 Tier 1 — Urgent (touches already-live, exposed surfaces)

**Upstash Redis** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Why urgent:** currently a **no-op**, which means (a) **no rate limiting** on the live public `/api/v1` endpoints and the MCP `submit_claim`/`add_note` write tools — an unprotected write path now that MCP is exposed; and (b) **no Polygon caching** in the running markout/score/regime workers, so every price lookup hits Polygon (self-throttled to 12.5s/call → slow pipeline + rate-limit risk).
- **Get it:** [upstash.com](https://upstash.com) → free tier → create a Redis database → copy **REST URL** + **REST Token**.
- **Consumed by:** `packages/shared/src/polygonCache.ts` (cache), `apps/web/app/api/v1/lib/rateLimit.ts`, `packages/api/routers/{claims,social,broker}.ts` (rate limit).
- **Verify:** after redeploy, `curl -sD- "$PROD/api/v1/leaderboard?metric=eiv_overall" -H "Authorization: Bearer <key>"` shows `X-RateLimit-*` headers (present only when Upstash is configured).

### 🟠 Tier 2 — Soon (observability + trust as data flows)

**Sentry** — `NEXT_PUBLIC_SENTRY_DSN` (+ optional `SENTRY_AUTH_TOKEN` for source maps)
- **Why:** the Inngest workers run **unattended in production**; without Sentry you only have Vercel/Inngest logs, no error aggregation/alerting. Disabled (`enabled:false`) until the DSN is set.
- **Get it:** [sentry.io](https://sentry.io) → new **Next.js** project → copy the DSN.
- **Consumed by:** `apps/web/sentry.*.config.ts`.
- **Verify:** trigger a test error; confirm it lands in the Sentry dashboard.

**Cloudflare R2** — `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_PUBLIC_URL`
- **Why:** snapshot storage — the immutability/"audited" evidence behind claims. Not in the current RSS ingest critical path (events store `snapshotPath: null`), so Tier 2, but needed before enabling Playwright capture and to back the trust story.
- **Get it:** [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → create bucket + API token (account id, access key, secret).
- **Consumed by:** `packages/ingestion/src/r2.ts`.
- **Verify:** a capture/snapshot upload succeeds instead of throwing.

### 🟢 Tier 3 — When the feature launches

**SnapTrade** — `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`
- Proof-of-Skin broker verification (broker-verified Player claims weighted ×1.5). Needed **only when onboarding real Players**; the Guide flywheel runs without it. `broker-sync` currently returns `snaptrade-not-configured` and no-ops. Get from [snaptrade.com](https://snaptrade.com). Consumed by `packages/api/lib/snaptrade.ts`, `apps/worker/functions/broker-sync.ts`.

**Resend** — `RESEND_API_KEY`
- Email digests. Needed **only with an active user base**; the `digest` worker skips gracefully. Get from [resend.com](https://resend.com) (also verify a sending domain). Consumed by `apps/worker/functions/digest.ts`.

**TEST_API_KEY** (dev/CI, not production)
- A `dm_live_` key generated from the app (admin → API keys). Unblocks the **18 skipped integration tests** for `/api/v1` + `/api/mcp` (`apps/web/__tests__/api-v1`, `api-mcp`). Add to root `.env.local`, run `pnpm --filter @deepmint/web test` with the dev server up.

## How to add a key to production (Vercel)

The repo is linked (`.vercel/project.json`). The CLI token expires — run `vercel whoami`; if it fails, `vercel login`.

```bash
# NOTE: use echo (trailing newline) — printf without \n sets an EMPTY value.
echo 'VALUE' | vercel env add VAR_NAME production --force
# ...repeat for each var, then redeploy so functions pick up the new env:
git commit --allow-empty -m "chore: redeploy for <keys>" && git push
```

Also mirror into the root `.env.local` for local dev. Vercel encrypts values —
`vercel env pull` returns them **empty**, so verify via the "Overrode Environment
Variable" success message (and the `> Removed trailing newline from stdin input`
line, which confirms a non-empty value was received), not by reading them back.

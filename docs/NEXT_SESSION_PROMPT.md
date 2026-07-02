# Fresh-session kickoff prompt

Paste the block below into a new Claude Code session opened in this repo.

---

```
We're wiring up the remaining external-service keys for Deepmint, in priority order.

Context — read these first:
- CLAUDE.md (project rules/invariants)
- docs/EXTERNAL_KEYS.md (the prioritised key list + setup/verify steps — this is your task list)
- docs/DEVLOG.md (top 3 entries: current state)

Current state: Deepmint is LIVE on Vercel (project deepmint-web-7ald, team nmasambas-projects),
DB on Supabase, Clerk auth, Polygon market data, HF LLM extraction on openai/gpt-oss-120b:cerebras,
and the Inngest worker pipeline is synced (15 functions, has_signing_key:true). Already-configured
keys: DATABASE_URL, Clerk, POLYGON_API_KEY, HF_API_KEY, LLM_MODEL(+FALLBACK), Inngest.

Goal: configure the empty keys from docs/EXTERNAL_KEYS.md, Tier 1 → 3, most-urgent first.
Do NOT do everything at once — go one tier at a time and check with me before moving on.

Start with 🔴 Tier 1: Upstash Redis (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) —
it's currently a no-op on the live public API rate limiting and the worker's Polygon caching.

For each key:
1. Ask me for the value(s) (I'll create the account and paste them, or tell you to proceed).
2. Add to production via the Vercel CLI. Operational notes:
   - Run `vercel whoami`; if the token is expired, tell me to run `vercel login`.
   - Use echo, NOT printf: `echo 'VALUE' | vercel env add VAR production --force`
     (printf without a trailing newline sets an EMPTY value — confirm you see
     "Removed trailing newline from stdin input" + "Overrode Environment Variable").
   - Vercel encrypts values; `vercel env pull` returns them empty, so verify via the
     CLI success message, not by reading them back.
3. Mirror the value into the root .env.local for local dev.
4. Redeploy so functions pick up the new env: `git commit --allow-empty -m "chore: redeploy for <key>" && git push`.
5. Verify per the "Verify" step in docs/EXTERNAL_KEYS.md, then report and pause for my go-ahead.

If I don't have a key yet, give me the exact "Get it" steps from the doc and wait.
```

---

**Tiers at a glance** (full detail in `docs/EXTERNAL_KEYS.md`):
1. 🔴 **Upstash Redis** — rate limiting + Polygon caching on live surfaces
2. 🟠 **Sentry** — error visibility for the unattended pipeline · **Cloudflare R2** — snapshot/immutability evidence
3. 🟢 **SnapTrade** (Player Proof-of-Skin) · **Resend** (digests) · **TEST_API_KEY** (unblocks 18 skipped integration tests)

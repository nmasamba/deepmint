# Remediation plan

The plan for fixing every open issue in [KNOWN_ISSUES.md](KNOWN_ISSUES.md), agreed with the maintainer on 2026-10-06. It groups the issues into 77 work packages in 10 waves. It was built from `origin/main` at `dca9722`, before wave 0 merged. The infra and code-comments packages (3, 16, 25, 31, 32, 70, 71, 76, 77) were planned directly from KNOWN_ISSUES and the code.

## Status

| Wave | Packages | Migration | State |
|---|---|---|---|
| 0 | The three high-severity fixes | 0008 | **Done**: #11, #12, #13 (2026-10-06 and 07) |
| 1 | 1–16: correctness, data integrity, tooling | – | In progress |
| 2 | 17–27 | 0009 | Not started |
| 3 | 28–36 | 0010 | Not started |
| 4 | 37–44 | 0011 | Not started |
| 5 | 45–53 | 0012 | Not started |
| 6 | 54–57 | 0013 | Not started |
| 7 | 58–63 | 0014 | Not started |
| 8 | 64–67 | 0015 | Not started |
| 9 | 68–72: dead code and tooling | – | Not started |
| 10 | 73–77: last cleanup | – | Not started |

After wave 0 (`main` at `c86b730`), KNOWN_ISSUES lists 98 open issues: 0 high, 26 medium and 72 low. The [Coverage](#coverage) section places every one of them.

## How it is delivered

Maintainer decisions, 2026-10-06:

- **One PR per wave**, with one commit per package. A wave's PR carries at most one migration.
- **Each wave starts in a fresh session**, from `main` once the previous wave has merged. Re-verify every package against the current code before changing it: file and line references below date from `dca9722`, and wave 0 changed `sh/polygon.ts`, `W/score.ts`, `W/markoutClaim.ts`, `api/routers/claims.ts` and the extractor's entry pricing.
- **Migrations** are numbered in wave order from 0009. The maintainer pastes each into the Supabase SQL editor **before** its wave's PR merges, so deployed code never runs ahead of the schema. The PR description gives the SQL, the drizzle journal row and a one-statement verification query:
  `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256 of the .sql file>', <its "when" in meta/_journal.json>);`
- **Product decisions D1–D25** ([Decisions](#decisions)) take the recommended option, with one exception. **D2:** signed-out visitors may see only ticker pages, Learn and claim pages; the leaderboard and profiles stay behind sign-in.
- **Mag-7 only.** No instrument-universe expansion until the core product has matured.
- **Live tests over mocks.** Ask the maintainer for the keys a wave needs before writing its live tests ([Keys](#keys-to-request-and-maintainer-steps)).
- **Keep the docs true.** Each fix deletes or rewrites its KNOWN_ISSUES entries and recounts the totals, adds a CHANGELOG [Unreleased] line, and updates any doc it makes wrong. Each wave gets one DEVLOG entry. When a wave merges, mark it done in the status table above.

## Conventions

**Path shorthand.**

| Short | Path |
|---|---|
| `W/` | `apps/worker/functions/` |
| `wk/` | `apps/worker/` |
| `api/` | `packages/api/` |
| `app/` | `apps/web/app/` |
| `cmp/` | `apps/web/components/` |
| `web/` | `apps/web/` |
| `sh/` | `packages/shared/src/` |
| `sc/` | `packages/scoring/src/` |
| `ing/` | `packages/ingestion/src/` |
| `db/` | `packages/db/` |
| `mig NNNN` | `db/drizzle/NNNN_*.sql` plus `meta/_journal.json` and `meta/NNNN_snapshot.json` |

**Wave 0 (done).** #11 (MCP basePath), #12 (market_regimes, migration 0008, `api/lib/marketRegime.ts`) and #13, the next-close-entry change called NCE below, merged on 2026-10-06 and 07. NCE added `sc/markout.ts` and changed `W/markoutClaim.ts`, `claims.submit` and extractor entry pricing. Every package below branches from `main`; none rebases onto an open PR.

**Disjoint files.** Packages in the same wave share no code, schema, config, test or lockfile path, so they can be built in parallel worktrees and merged in any order. One exception: the append-style docs `docs/KNOWN_ISSUES.md`, `docs/CHANGELOG.md`, `README.md`, `docs/EXTERNAL_KEYS.md`, `docs/NEXT_SESSION_PROMPT.md` and `.env.example` may be shared. Rules for them:
- Each PR deletes or rewrites only its own register entries.
- It appends one CHANGELOG line and edits only its own README or EXTERNAL_KEYS sections.
- A clash in the counts table is resolved on rebase by recounting the entries.
- For an issue split across packages, earlier packages rewrite the entry to what remains, and the package marked "closes" deletes it.

**Order.** User-visible correctness and data-integrity fixes come first, then features, then dead code and docs-only cleanup. The category order decides which package gets a file two packages want. An unblocked feature may go in an early wave only on files that no pending fix needs. Package 16 (CI, lint, turbo) goes in W1 because it is how every later PR gets checked.

**Decisions.** Waves 1–3 contain no decision-blocked package. Each decision has a "needed by" wave. Blocked packages are written for the recommended option, which the maintainer accepted for every decision except D2.

**Migrations.** At most one per wave, numbered in wave order from 0009. A decision that removes a migration shifts the later numbers down. At merge time, always use the next free number.

**Live testing.** Live tests run against the local Docker DB, real Polygon and HF keys, and the Clerk dev instance. Before each wave, ask the maintainer for the keys listed for its packages. Live tests skip when a key is absent, so CI runs only the pure tests. After package 28 lands, claims, events, notes and outcomes cannot be deleted locally. Reset with `docker compose down -v`.

## Waves table

### Wave 1: correctness, data integrity, tooling (16 packages, no migration)

| # | Package | Issues | Files (code) | Mig | Size |
|---|---|---|---|---|---|
| 1 | cron-times-eastern | cron-times-assume-edt (residue; closes) | W/ingest.ts, W/markout.ts, W/broker-sync.ts, W/digest.ts, W/audit.ts (+ #12's regime-snapshot function if it is tied to market hours) | – | S |
| 2 | polygon-client-hardening | polygon-throttle-not-serialized (in-process part), fallback-prices-in-ledger (closes), price-lookups-uncached-serial (shared helpers), dead-and-duplicated-shared-code (getBatchEODPrices, private dollarsToCents) | sh/polygon.ts, sh/polygonCache.ts, sh/\_\_tests\_\_/polygon.test.ts | – | M |
| 3 | inngest-env-and-worker-build | trpc-inngest-prefixed-keys, stale-worker-build-artifacts, worker-scripts-broken | api/lib/inngestEnv.ts (new), api/trpc.ts, api/package.json, wk/inngest.ts, delete wk/inngest.js, .js.map, .d.ts, .d.ts.map and W/ingest.js.map, wk/package.json, wk/tsconfig.json, wk/scripts/backfill.ts (type fixes only), app/api/inngest/inngest-env.ts, .gitignore | – | S |
| 4 | score-outcomes-ordered | score-outcomes-unordered, worker-stale-docstrings (score.ts part) | W/score.ts | – | S |
| 5 | consensus-live-claims-and-targets | consensus-includes-expired-claims, ticker-page-dead-fragile-wiring (target stats), stale-schema-and-scoring-comments (confidence comment) | W/consensus-signal.ts, sc/consensus.ts, sc/\_\_tests\_\_/consensus.test.ts | – | M |
| 6 | influence-guide-claims-only | influence-pipeline-flaws, dead-scoring-code (detectInfluenceEvents) | W/influence-track.ts, W/influence-aggregate.ts, sc/influence.ts, sc/\_\_tests\_\_/influence.test.ts, db/schema/influence.ts | – | M |
| 7 | target-precision-floor | target-precision-floor-inactive | sc/guide.ts, sc/\_\_tests\_\_/guide.test.ts | – | S |
| 8 | eiv-label-shared | dead-scoring-code (formatEIVWithContext) | sh/eiv.ts (new), sh/index.ts, sh/\_\_tests\_\_/eiv.test.ts, sc/eiv.ts, sc/\_\_tests\_\_/regime-eiv.test.ts, cmp/EntityProfileTabs.tsx | – | S |
| 9 | leaderboard-v1-parity-and-sort | v1-leaderboard-missing-fixes, openapi-spec-drift, leaderboard-no-minimum-sample (sort part), domain-mismatch (OpenAPI contact, metadataBase fallback) | sh/constants.ts, api/routers/leaderboard.ts, app/api/v1/leaderboard/route.ts, app/api/v1/openapi.json/route.ts, web/\_\_tests\_\_/api-v1/leaderboard.test.ts, app/layout.tsx | – | M |
| 10 | claim-card-outcomes | claim-outcomes-not-shown | api/lib/claimEnrichment.ts (new), api/routers/claims.ts, api/routers/social.ts, cmp/claims/ClaimsTimeline.tsx, cmp/dashboard/SocialFeed.tsx, cmp/claims/ClaimCard.tsx, api/\_\_tests\_\_/claimEnrichment.test.ts | – | M |
| 11 | leaderboard-most-influential | most-influential-tab-empty, ai-scoring-copy-misleading (leaderboard empty state) | app/(app)/leaderboard/page.tsx, api/routers/influence.ts, cmp/influence/TrendingInfluencers.tsx | – | S |
| 12 | profile-own-actions | follow-mirror-own-profile | app/(app)/guide/[slug]/page.tsx, app/(app)/player/[slug]/page.tsx, cmp/EntityProfileHeader.tsx, cmp/FollowButton.tsx, cmp/signal-simulate/MirrorSignalsButton.tsx | – | S |
| 13 | admin-role-and-gate | clerk-getuser-per-request, admin-pages-not-gated | web/lib/adminRole.ts (new), app/api/trpc/[trpc]/route.ts, app/(app)/layout.tsx, app/(app)/admin/layout.tsx (new), app/(app)/admin/{review,instruments,api-keys}/page.tsx | – | M |
| 14 | pwa-public-assets | pwa-assets-behind-auth | web/middleware.ts, web/next.config.ts, app/offline/page.tsx (moved from app/(app)/offline/page.tsx) | – | S |
| 15 | firm-guide-resolution | guide-resolver-matches-user-slug, firm-guide-resolution-edge-cases | ing/sources/resolver.ts, ing/extractor.ts, ing/sources/polygonNews.ts, ing/\_\_tests\_\_/ratingAttribution.test.ts, ing/\_\_tests\_\_/resolver.db.test.ts (new) | – | M |
| 16 | dev-tooling-ci-lint-turbo | lint-broken, ci-coverage-narrow, turbo-env-undeclared | .github/workflows/ci.yml, turbo.json, tooling/eslint/{base.js,package.json}, web/eslint.config.mjs (new), web/package.json, packages/ingestion/tsconfig.json, pnpm-lock.yaml (type fixes only in db/seed.ts, db/drizzle.config.ts, ing/capture.ts, packages/ingestion/scripts/bench-providers.ts) | – | M |

### Wave 2 (11 packages, migration 0009)

| # | Package | Issues | Files (code) | Mig | Size |
|---|---|---|---|---|---|
| 17 | ledger-unique-indexes | uniqueness-invariants-comment-only (part 1), stale-schema-and-scoring-comments (scores comment; closes) | db/schema/{outcomes,events,instruments,scores,consensus,influence}.ts, mig 0009, W/{markout,backfill,ingest,score,consensus-signal,influence-aggregate}.ts, api/routers/instruments.ts | **0009** | M |
| 18 | public-read-hardening | entity-endpoints-leak-private-fields, claims-detail-any-status | db/queries/publicEntity.ts (new), db/package.json, api/routers/entities.ts, api/routers/claims.ts, app/(app)/{guide,player}/[slug]/page.tsx, web/\_\_tests\_\_/api-trpc/public-reads.test.ts (new) | – | S |
| 19 | paper-short-accounting | paper-short-equity-overstated, paper-short-cash-bypass, price-lookups-uncached-serial (paper and mirror valuation) | api/lib/paperAccounting.ts (new), api/\_\_tests\_\_/paperAccounting.test.ts, api/package.json, api/routers/paper.ts, api/routers/signalSimulate.ts, cmp/paper/NewTradeForm.tsx | – | M |
| 20 | ticker-page-per-ticker | ticker-top-lists-global, ticker-page-dead-fragile-wiring (closes), price-lookups-uncached-serial (ticker part), current-price-is-previous-close (header label) | api/lib/topByInstrument.ts (new), api/routers/ticker.ts, api/routers/leaderboard.ts, app/(app)/ticker/[symbol]/{page.tsx,TickerClientSection.tsx}, cmp/ticker/{TopEntitiesPanel,ConsensusBreakdown}.tsx | – | M |
| 21 | digest-real-recipients | digest-placeholder-recipient, domain-mismatch (digest) | W/digest.ts, wk/package.json, pnpm-lock.yaml | – | M |
| 22 | broker-sync-hardening | snaptrade-secret-plaintext, broker-sync-error-sticky | api/lib/credentialBox.ts (new), api/\_\_tests\_\_/credentialBox.test.ts, api/lib/snaptrade.ts, api/routers/broker.ts, W/broker-sync.ts, cmp/settings/BrokerVerification.tsx | – | M |
| 23 | dedupe-status-aware | cross-source-dedupe-ignores-status | ing/extractor.ts, ing/\_\_tests\_\_/dedupe.test.ts (new), W/extract.ts | – | S |
| 24 | clerk-webhook-and-identity | clerk-webhook-fragile, identity-derivation-inconsistent, dead-and-duplicated-shared-code (two slugifys) | app/api/webhooks/clerk/route.ts, app/api/trpc/[trpc]/route.ts, sh/utils.ts, sh/\_\_tests\_\_/{identity,slugify}.test.ts, ing/\_\_tests\_\_/slugify.test.ts (moved out), ing/sources/resolver.ts, ing/index.ts, web/\_\_tests\_\_/webhooks/clerk.test.ts (new) | – | S |
| 25 | sentry-wiring | sentry-inert | web/instrumentation.ts (new), web/instrumentation-client.ts (new), web/sentry.client.config.ts (deleted), web/next.config.ts, app/global-error.tsx, app/error.tsx, app/api/inngest/route.ts, app/api/inngest/sentry-failures.ts (new) | – | M |
| 26 | notify-followers-new-claim | notifications-dead-ends (preference part) | W/notify-followers-new-claim.ts (new), wk/src/index.ts | – | S |
| 27 | learn-accuracy | learn-content-drift (closes), current-price-is-previous-close (Learn part) | web/lib/learnModules.ts | – | S |

### Wave 3 (9 packages, migration 0010)

| # | Package | Issues | Files (code) | Mig | Size |
|---|---|---|---|---|---|
| 28 | ledger-append-only-triggers | uniqueness-invariants-comment-only (closes) | mig 0010, db/schema/{claims,events,notes,outcomes}.ts | **0010** | S |
| 29 | aggregates-daily-refresh | aggregates-refresh-only-after-markout | W/consensus-signal.ts, W/influence-aggregate.ts, cmp/ticker/ConsensusBreakdown.tsx, app/(app)/ticker/[symbol]/TickerClientSection.tsx, cmp/dashboard/Mag7Grid.tsx | – | S |
| 30 | extraction-redrive | extraction-failures-never-retried | W/extract.ts, W/ingest.ts, W/backfill.ts | – | M |
| 31 | inngest-step-budgets | inngest-route-no-maxduration | app/api/inngest/route.ts, W/markout.ts, ing/extractor.ts | – | S |
| 32 | db-seed-safety | db-seed-unsafe | db/seed.ts, db/seed-instruments.ts (new), db/package.json | – | S |
| 33 | claim-detail-page | claim-provenance-not-visible (provenance part) | app/(app)/claims/[id]/page.tsx (new), cmp/claims/ClaimProvenance.tsx (new), api/routers/claims.ts, api/lib/claimEnrichment.ts, cmp/claims/ClaimCard.tsx | – | M |
| 34 | mcp-tool-contracts | mcp-tool-contract-gaps | app/api/mcp/route.ts, app/api/v1/lib/auth.ts, web/\_\_tests\_\_/api-mcp/mcp.test.ts | – | M |
| 35 | search-slash-shortcut | search-slash-hint | cmp/InstrumentSearch.tsx | – | S |
| 36 | backfill-prices-transient-errors (low: latent until more instruments) | backfill-prices-deactivates-on-error | W/backfill-prices.ts | – | S |

**Decision gate.** D1–D3 are needed by W4. D4–D11 and D15 are needed by W5. The rest are listed under Decisions.

### Wave 4 (8 packages, migration 0011)

| # | Package | Issues | Files (code) | Mig | Size | Blocked on |
|---|---|---|---|---|---|---|
| 37 | mirror-portfolio-fixes | mirror-portfolio-behaviour, price-lookups-uncached-serial (mirror closing; closes) | db/schema/paper.ts, mig 0011, W/signal-simulate.ts, W/markout.ts, api/routers/paper.ts, api/routers/signalSimulate.ts, cmp/paper/PortfolioList.tsx | **0011** | M | – |
| 38 | extractor-output-validation | extractor-silent-drops (all but off-grid horizons), rationale-tags-vocabulary, extractor-client-before-prefilter, dead-and-duplicated-shared-code (extractor enum copies) | ing/extractor.ts, ing/\_\_tests\_\_/{extractor,normaliseClaim}.test.ts, W/backfill.ts, W/extract.ts, cmp/claims/ClaimCard.tsx | – | M | – |
| 39 | feed-capture-dates | rss-undated-items-reingested | ing/sources/rss.ts, ing/sources/polygonNews.ts, W/ingest.ts, ing/\_\_tests\_\_/rss.test.ts | – | S | – |
| 40 | claim-notes-ui | claim-notes-no-ui | cmp/claims/ClaimNotes.tsx (new), app/(app)/claims/[id]/page.tsx | – | S | – |
| 41 | notification-links | notifications-dead-ends (closes) | cmp/notifications/{NotificationItem,NotificationBell}.tsx, db/queries/createNotification.ts, W/notify-new-follower.ts | – | S | – |
| 42 | leaderboard-min-sample | leaderboard-no-minimum-sample (closes) | W/score.ts, sh/constants.ts, api/routers/leaderboard.ts, app/api/v1/leaderboard/route.ts, app/api/v1/openapi.json/route.ts, app/(app)/leaderboard/page.tsx, cmp/EntityProfileTabs.tsx, sc/anti-gaming.ts and sc/\_\_tests\_\_/anti-gaming.test.ts (deleted), sc/index.ts, web/\_\_tests\_\_/api-v1/leaderboard.test.ts | – | M | D1 |
| 43 | public-read-pages | signin-wall-vs-anonymous-trpc | web/middleware.ts, app/(app)/layout.tsx, cmp/layout/{Topbar,Sidebar,MobileNav}.tsx, cmp/{FollowButton,WatchButton,EntityProfileHeader}.tsx, cmp/signal-simulate/MirrorSignalsButton.tsx | – | M | D2 |
| 44 | copy-no-false-ai-claims | ai-scoring-copy-misleading (closes) | app/layout.tsx, cmp/landing/{HeroSection,HowItWorks,ChoosePath,Footer,SocialProof}.tsx, app/(app)/{paper-portfolio,settings,learn,dashboard}/page.tsx | – | S | D3 |

### Wave 5 (9 packages, migration 0012)

| # | Package | Issues | Files (code) | Mig | Size | Blocked on |
|---|---|---|---|---|---|---|
| 45 | merkle-audit-coverage | merkle-audit-gaps (coverage part) | mig 0012, db/schema/claims.ts, db/schema/audit.ts, sh/merkle.ts, sh/\_\_tests\_\_/merkle.test.ts, W/audit.ts | **0012** | M | – |
| 46 | attribution-review-guards | firm-reattribution-all-lanes, carrier-entity-claims-approvable (closes under D15 option A) | sh/claimEvidence.ts (new), sh/index.ts, ing/extractor.ts, W/extract.ts, W/backfill.ts, api/routers/claims.ts, app/(app)/admin/review/page.tsx | – | M | – |
| 47 | neutral-claim-returns | neutral-claim-scoring | sc/markout.ts, sc/\_\_tests\_\_/markout.test.ts, W/score.ts | – | S | D4 |
| 48 | player-daily-book | player-metrics-annualise-claim-returns (part 1: pure function) | sc/player.ts, sc/\_\_tests\_\_/player.test.ts | – | S | D5 |
| 49 | broker-verification-semantics | broker-verified-means-any-account, broker-trades-never-scored | api/routers/broker.ts, W/broker-sync.ts, cmp/settings/BrokerVerification.tsx, cmp/landing/ChoosePath.tsx | – | M | D7 |
| 50 | nav-cleanup | watcher-nav-type-dead, explore-stub-in-nav, api-docs-nav-for-all | cmp/layout/{Sidebar,MobileNav}.tsx, app/(app)/explore/page.tsx (deleted), app/(app)/docs/api/page.tsx | – | S | D10, D11 |
| 51 | profile-edit-and-clerk-sync | profile-edit-and-clerk-sync | app/api/webhooks/clerk/route.ts, db/queries/ensureEntityForClerkUser.ts, api/routers/entities.ts, cmp/settings/ProfileForm.tsx (new), app/(app)/settings/page.tsx, cmp/EntityProfileHeader.tsx | – | M | D8 |
| 52 | leaderboard-regime-chips | leaderboard-regime-filter-empty | app/(app)/leaderboard/page.tsx | – | S | D6 |
| 53 | paper-fill-semantics | current-price-is-previous-close (closes) | api/routers/paper.ts, cmp/paper/{NewTradeForm,PortfolioDetail}.tsx | – | S | D9 |

### Wave 6 (4 packages, migration 0013)

| # | Package | Issues | Files (code) | Mig | Size | Blocked on |
|---|---|---|---|---|---|---|
| 54 | mcp-agent-identity | mcp-acts-as-admin | mig 0013, db/schema/{entities,apiKeys}.ts, db/queries/publicEntity.ts, api/routers/apiKeys.ts, app/api/v1/lib/auth.ts, app/api/mcp/{route,agentEntity}.ts, cmp/EntityProfileHeader.tsx, web/\_\_tests\_\_/api-mcp/mcp.test.ts | **0013** | M | D12 |
| 55 | player-risk-metrics | player-metrics-annualise-claim-returns (closes), dead-scoring-code (calmarRatio) | W/score.ts, web/lib/learnModules.ts | – | M | D5 |
| 56 | claims-created-all-lanes | claims-created-only-self-logged | W/extract.ts, W/signal-simulate.ts, W/backfill.ts, api/routers/claims.ts | – | M | D13 |
| 57 | guide-feed-admin | rss-lane-cannot-be-enabled | api/routers/entities.ts, app/(app)/admin/guides/page.tsx (new), cmp/layout/{Sidebar,MobileNav}.tsx | – | M | D14 |

### Wave 7 (6 packages, migration 0014)

| # | Package | Issues | Files (code) | Mig | Size | Blocked on |
|---|---|---|---|---|---|---|
| 58 | guide-applications-backend | guide-signup-path-missing (part 1) | db/schema/guideApplications.ts (new), db/schema/index.ts, mig 0014, api/routers/guides.ts (new), api/root.ts, app/(app)/admin/review/page.tsx, ing/sources/resolver.ts (comment at 34-35) | **0014** | M | D16 |
| 59 | eiv-regime-history | eiv-not-regime-aware | W/score.ts, sc/eiv.ts, sc/\_\_tests\_\_/regime-eiv.test.ts, api/routers/leaderboard.ts, cmp/leaderboard/BestInRegime.tsx | – | M | D6 |
| 60 | api-key-ui-agent-scopes | api-key-ui-scopes | app/(app)/admin/api-keys/page.tsx | – | S | D12 |
| 61 | terminology-unify | terminology-inconsistent | cmp/EntityProfileTabs.tsx, web/lib/learnModules.ts, app/(app)/{dashboard,my-claims}/page.tsx, cmp/claims/{SubmitClaimForm,ClaimsTimeline}.tsx, cmp/dashboard/SocialFeed.tsx, cmp/notifications/NotificationPreferences.tsx, cmp/landing/HeroSection.tsx | – | S | D17 |
| 62 | mag7-universe-guards (low: latent until more instruments) | instrument-universe-inconsistent, consensus-mag7-returns-all-instruments, asset-class-unpriceable (create guard), dead-and-duplicated-shared-code (duplicate Mag-7 list, rate-limit literal) | sh/constants.ts, api/routers/{claims,paper,instruments,consensus}.ts, W/consensus-signal.ts, db/schema/instruments.ts | – | S | – |
| 63 | single-verified-flag | two-verified-flags | cmp/EntityProfileHeader.tsx, cmp/ticker/TopEntitiesPanel.tsx, app/(app)/ticker/[symbol]/TickerClientSection.tsx, api/routers/ticker.ts, db/seed.ts, db/schema/{entities,brokerLinks}.ts | – | S | D7 |

### Wave 8 (4 packages, migration 0015)

| # | Package | Issues | Files (code) | Mig | Size | Blocked on |
|---|---|---|---|---|---|---|
| 64 | entity-account-deletion | soft-delete-half-implemented | db/queries/anonymiseEntity.ts (new), db/package.json, app/api/webhooks/clerk/route.ts, api/routers/{entities,leaderboard,ticker}.ts, W/digest.ts, app/api/mcp/agentEntity.ts, cmp/EntityProfileHeader.tsx, db/schema/entities.ts | – | M | D18 |
| 65 | guide-applications-ui | guide-signup-path-missing (closes) | cmp/landing/ChoosePath.tsx, cmp/settings/GuideApplication.tsx (new), app/(app)/settings/page.tsx | – | S | D16 |
| 66 | paper-equity-history | equity-curve-placeholder | db/schema/paper.ts, mig 0015, W/paper-equity-snapshot.ts (new), wk/src/index.ts, api/routers/paper.ts, cmp/paper/{EquityCurve,PortfolioDetail}.tsx | **0015** | M | D19 |
| 67 | claim-audit-proof | claim-provenance-not-visible (closes), merkle-audit-gaps (closes) | api/lib/auditWindow.ts (new), api/package.json, W/audit.ts, sh/merkle.ts, sh/\_\_tests\_\_/merkle.test.ts, api/routers/claims.ts, cmp/claims/ClaimAuditProof.tsx (new), app/(app)/claims/[id]/page.tsx, app/(app)/audit/page.tsx (new), web/middleware.ts | – | M | D20 |

### Wave 9: dead code and tooling cleanup (5 packages)

| # | Package | Issues | Files (code) | Mig | Size | Blocked on |
|---|---|---|---|---|---|---|
| 68 | worker-dead-code-cleanup | leaderboard-refresh-noop, worker-stale-docstrings (closes), domain-mismatch (demo adapter) | W/leaderboard-refresh.ts (deleted), wk/src/index.ts, W/ingest.ts, ing/sources/demo.ts and ing/\_\_tests\_\_/demo-source.test.ts (deleted), ing/index.ts | – | S | – |
| 69 | bench-providers-refresh | bench-providers-stale | packages/ingestion/scripts/bench-providers.ts | – | S | – |
| 70 | repo-hygiene | root-vercel-json, run-migration-script-unsafe, tracked-personal-files | vercel.json moved to web/vercel.json (or deleted), db/run-migration.mjs (deleted), .claude/launch.json (untracked), deepmint_logo_full.png, docs/upcoming_features.png, web/public/logo.png (deleted) | – | S | – |
| 71 | redis-local-dev | redis-compose-unused | docker-compose.yml, packages/shared/package.json, pnpm-lock.yaml | – | S | – |
| 72 | scoring-dead-code-cleanup | dead-scoring-code (closes) | sc/player.ts, sc/guide.ts, sc/\_\_tests\_\_/{player,guide}.test.ts, db/schema/outcomes.ts, W/score.ts | – | S | D21 |

### Wave 10: last cleanup (5 packages)

| # | Package | Issues | Files (code) | Mig | Size | Blocked on |
|---|---|---|---|---|---|---|
| 73 | remove-dead-snapshot-capture | r2-snapshot-capture-dead, domain-mismatch (R2 default; closes) | ing/capture.ts, ing/r2.ts, ing/index.ts, packages/ingestion/package.json, pnpm-lock.yaml, db/schema/events.ts, web/next.config.ts | – | S | D25 |
| 74 | prune-unused-trpc-procedures | unused-trpc-procedures | api/routers/{entities,instruments,consensus,scores,social,influence}.ts | – | S | D24 |
| 75 | shared-code-dedupe | dead-and-duplicated-shared-code (closes) | sh/errors.ts (deleted), sh/index.ts, sh/utils.ts, sh/constants.ts, sh/polygonCache.ts, packages/shared/package.json, cmp/ui/{dropdown-menu,scroll-area,separator,tooltip}.tsx (deleted), cmp/signal-simulate/ComparisonChart.tsx, cmp/ticker/ConsensusBreakdown.tsx | – | S | – |
| 76 | spec-citation-comments | gitignored-doc-references | ing/hasher.ts, sc/{player,consensus,influence,guide,eiv,regime}.ts, api/lib/snaptrade.ts, app/globals.css | – | S | – |
| 77 | polygon-account-limit | polygon-throttle-not-serialized (closes) | option 1: W/{markout,backfill,backfill-prices,ingest}.ts + #12's regime-snapshot function; option 2: sh/polygon.ts only | – | S | D23 |

**Hot files.** These were checked across all waves:
- `W/score.ts`: W1, 2, 4, 5, 6, 7, 9
- `api/routers/claims.ts`: W1, 2, 3, 5, 6, 7, 8
- `W/extract.ts`, `W/backfill.ts` and `ing/extractor.ts`: W1–W6
- `cmp/EntityProfileHeader.tsx`: W1, 4, 5, 6, 7, 8
- `api/routers/leaderboard.ts`: W1, 2, 4, 7, 8

Each file is touched by at most one package per wave.

## Migration order

| # | Wave | Package | What it does |
|---|---|---|---|
| 0009 | W2 | ledger-unique-indexes | Unique indexes on outcomes, events, instruments(ticker), scores (NULLS NOT DISTINCT), consensus_signals and influence_scores. A guard aborts if duplicate ledger keys exist; duplicate derived rows are deleted. |
| 0010 | W3 | ledger-append-only-triggers | Triggers on events, notes, outcomes and claims. Claims allow only pending_review → active/rejected. |
| 0011 | W4 | mirror-portfolio-fixes | `paper_trades.claim_id` with an index. |
| 0012 | W5 | merkle-audit-coverage | `claims.recorded_at`, added with no default, then given DEFAULT now(), so no rows are updated; plus `audit_roots.leaf_version`. |
| 0013 | W6 | mcp-agent-identity | `entities.is_agent`, `api_keys.entity_id`. |
| 0014 | W7 | guide-applications-backend | `guide_applications` table. |
| 0015 | W8 | paper-equity-history | `paper_equity_snapshots` table. |

Maintainer steps before pasting:
- **Before 0009:** run `SHOW server_version` (must be 15 or later) and the duplicate-key preflight SELECTs on Supabase.
- **After 0010:** a deliberate correction needs `ALTER TABLE … DISABLE TRIGGER` inside a transaction. The README documents this.

**Conditional migrations.** Non-recommended options that need a migration take the next free number (0016 and up), in the first wave where their files are free, one per wave:
- D7 option 2: link table
- D9 option 2: nullable entry price
- D15 option B: wider claims trigger
- D20 option B: storage for the anchoring proof

## Package details

### Wave 1

**1 cron-times-eastern.** Add `TZ=America/New_York` to these crons:

| Function | Cron |
|---|---|
| ingest | 30 16 * * 1-5 |
| markout | 0 17 * * 1-5 |
| broker-sync | 0 18 * * 1-5 |
| digest | 0 8 * * 1-5 |

merkle-audit stays on UTC; only its docstring says so. Rewrite the EDT docstrings and the README schedule.
- Depends on: wave 0 (NCE edits markout's header).
- **Deadline:** deployed before Mon 2026-11-02. If W1 slips, merge this package alone.
- Verify: the Inngest dev UI shows the next runs in ET. After deploy, Inngest Cloud shows 16:30/17:00/18:00/08:00 ET. After 2026-11-02, a pasted query on `outcomes.computed_at` confirms that claims exiting 11-02 were written that day.

**2 polygon-client-hardening.**
- `polygonRateLimit` reserves its slot synchronously (`last = max(now, last + 12.5 s)`) before it sleeps, so callers that start together queue 12.5 s apart. The limit still holds only within one serverless instance; that residue goes to D23 and package 77.
- `getEODPrice` throws when no key is set.
- Delete `getBatchEODPrices`.
- Import `dollarsToCents` from `./utils`.
- Add `getLatestClose(ticker)` returning `{closeCents, sessionDate}`, with a 300 s per-process memo, shared in-flight promises, and Upstash via `polygonCache` when configured. Add `getLatestCloses(tickers)`, which de-duplicates and fetches misses one after another.
- `getCurrentPrice` stays uncached for ledger writers.
- Rebase on #12, which touches the regime code in this file.
- Verify (live, POLYGON_API_KEY):
  - two concurrent lookups fire at least 12.5 s apart
  - keyless `getEODPrice` rejects
  - `getLatestCloses(['AAPL','AAPL','MSFT'])` makes 2 requests, and a repeat returns in under 50 ms
  - a keyless `processExtraction` run on a dated rating writes no DEV_FALLBACK prices.

**3 inngest-env-and-worker-build.**
- New `api/lib/inngestEnv.ts` holds the INNGEST_WORKFLOW_* → INNGEST_* mapping. `api/trpc.ts` imports it on its first line. Every router imports `../trpc`, so the mapping runs before the three module-level `new Inngest()` calls, with no edits to the routers.
- `wk/inngest.ts` and `app/api/inngest/inngest-env.ts` import the same module, through a new export entry in `api/package.json`.
- Delete the tracked compiled worker files and gitignore them.
- In `wk/tsconfig.json`, set `noEmit` and include `scripts`; fix any type errors in `wk/scripts/backfill.ts`.
- In `wk/package.json`, drop `build` and `start`; `dev` runs `inngest-cli dev -u http://localhost:3000/api/inngest`.
- Verify:
  - a pure test: with only the prefixed key set, importing the routers sets `INNGEST_EVENT_KEY`
  - `next build`, then grep the server chunks for `INNGEST_WORKFLOW_` to prove the source is bundled, not the stale `.js`
  - after deploy, a self-logged claim on www produces a `claims/created` run in Inngest Cloud.
- Maintainer: report whether production has an unprefixed INNGEST_EVENT_KEY (the name only).

**4 score-outcomes-ordered.**
- Add `ORDER BY created_at + horizon_days * interval '1 day', claim_id` to the per-entity outcomes query.
- Fix the comment at score.ts:50-57 and drop the unused `brokerLinkStatus` select. This is the score.ts part of worker-stale-docstrings.
- Verify: two `markouts/completed` runs give identical max_drawdown, calmar and consistency.

**5 consensus-live-claims-and-targets.** Merges consensus-live-claims-only and consensus-target-stats.
- Window: `created_at + horizon_days days > now()`. computeConsensusSignal skips expired claims as a backstop. activeClaims = long + short + neutral.
- Add the pure `computeTargetStats`, which writes avg_target_price_cents and target_dispersion_bps.
- Correct the confidence-clamp comment at consensus.ts:45-48.
- Verify: send `scoring/completed` locally. `active_claims` should match SQL. `/api/v1/instruments/NVDA/consensus` and `/ticker/NVDA` show target stats from real ingested targets.

**6 influence-guide-claims-only.** As the scoring plan:
- Players follow only Guides.
- The 48 h window is measured from the claim's created_at.
- The dormant Guide branch is fixed.
- Both branches use `detectInfluenceEvents` and skip pairs already recorded.
- The aggregate joins to active claims and live Guides.
- Schema comments only.
- Verify: as the scoring plan (no Player rows, no events on pending or rejected claims).

**7 target-precision-floor.** Add `TARGET_MIN_MOVE_FRAC = 0.01` and `isUsableTarget`. Coverage counts only usable targets. Verify with the unit tests, then a real markout and scoring run giving coverage 0.5.

**8 eiv-label-shared.** Add `sh/eiv.ts` with the bands and `eivLabel`. The profile shows "No Edge" when EIV is 0. Delete `formatEIVWithContext`; its label tests move to shared. Verify: an entity scored at EIV 0 shows "No Edge".

**9 leaderboard-v1-parity-and-sort.** Merges leaderboard-sort-direction and v1-leaderboard-parity-and-openapi.
- `LOWER_IS_BETTER_METRICS` (calibration_brier, max_drawdown) sort ascending in `leaderboard.top`. MCP inherits this through createCaller.
- The v1 route validates horizon and regimeTag (400 otherwise) and maps `createCaller(...).leaderboard.top` rows to the existing v1 shape.
- OpenAPI:
  - horizon enum with default `all`
  - a 403 component
  - required scopes, with an `x-required-scope` extension
  - `assetClass` on instruments
  - OpenAPI 3.1 nullable syntax
  - contact URL `https://www.deepmint.ai`
- `app/layout.tsx`: metadataBase falls back to `https://www.deepmint.ai`.
- Verify (live v1 suite, TEST_API_KEY):
  - max_drawdown sorts ascending
  - with horizon `all`, no duplicate slugs
  - `12m` returns 400
  - results match tRPC
  - `npx @redocly/cli lint` passes on the served spec.

**10 claim-card-outcomes.** As the product plan: `enrichClaimRows` adds outcomes and notesCount to `claims.list` and `social.feed` in two queries. The card shows correct or incorrect and the return; an unscored matured claim shows "Awaiting result", using NCE's exit-date rule. Verify: a 1D claim is marked out on real Polygon, and a caller test runs against the local DB.

**11 leaderboard-most-influential.**
- The Most Influential chip queries `influence.topInfluencers`, which gains entityType and a deleted filter.
- TrendingInfluencers links by entity type.
- The empty state no longer blames AI.
- Verify: the chip and the dashboard list match after a local influence-track run.

**12 profile-own-actions.**
- Pass `hideFollow` on your own profile.
- Error toasts for Follow and Mirror.
- The Mirror button shows "Mirroring" when a mirror is active.
- Verify on the Clerk dev instance.

**13 admin-role-and-gate.** Merges clerk-getuser-per-request and admin-pages-not-gated.
- `web/lib/adminRole.ts` `resolveIsAdmin`:
  - trusts `sessionClaims.metadata` whenever it is present
  - otherwise calls getUser once, with a 60 s per-user cache
  - logs failures
  - reuses the user the self-heal already fetched.
- It is used by the tRPC route and the (app) layout.
- New `app/(app)/admin/layout.tsx` returns `notFound()` for non-admins.
- The admin pages render query errors instead of a false empty state.
- Document the optional Clerk session-token claim in EXTERNAL_KEYS.
- Verify: count getUser calls with a temporary log over 10 non-admin page loads (at most 1 per TTL). Non-admins get 404 on /admin/*; the admin keeps access.

**14 pwa-public-assets.** As the product plan:
- `/manifest.json` and `/offline` become public routes.
- The offline page moves out of `(app)`.
- Serwist precaches `/offline` with a build-id revision.
- Verify on a local production build, then curl the www host.

**15 firm-guide-resolution.** As the ingestion plan:
- A slug matches only an ingested Guide; the walk tries `-2` to `-6` with onConflictDoNothing.
- Names are capped at 100 characters.
- Targets above the INT4 maximum become null.
- The polygonNews publisher step uses try/catch.
- The NCE entry-pricing block is left alone.
- Verify: the DB suite against local Docker, plus the read-only production query pasted by the maintainer.

**16 dev-tooling-ci-lint-turbo.**
- `turbo.json`:
  - root `envMode: "loose"`
  - `test.cache: false`, because live tests must hit live services on every run
  - `globalDependencies` on the `.env.local` files
- CI:
  - `pnpm -r check`
  - `pnpm --filter @deepmint/api test`
  - the existing tests and build
  - `pnpm lint`.
- Include `scripts` in `packages/ingestion/tsconfig.json`.
- Lint:
  - rewrite `tooling/eslint/base.js` as a flat config (typescript-eslint)
  - add `web/eslint.config.mjs` with `@next/eslint-plugin-next`
  - the web `lint` script becomes `eslint .`
  - rules that existing code breaks are set to warn, so no other source file changes.
- Type errors that `pnpm -r check` exposes are fixed only in the four script files listed in the table; no other W1 package touches them.
- Verify:
  - CI runs green on the PR
  - after editing `.env.local`, `pnpm test` re-runs instead of replaying
  - `TEST_API_KEY=… pnpm test` passes the variable through
  - `pnpm lint` exits 0.

### Wave 2

**17 ledger-unique-indexes.** As the data plan, generated on top of #12's 0008.
- Indexes and constraints: the six in the migration-order table above.
- Hand-prepended SQL: the guard, and DELETEs of duplicate derived rows.
- Writers use onConflictDoNothing on these inserts:
  - outcomes in markout and backfill
  - events in ingest and backfill
  - instruments in adminBatchCreate; adminCreate dedupes by ticker.
- score, consensus-signal and influence-aggregate wrap their delete-then-insert in a transaction and get `concurrency: {limit: 1}`.
- Rewrite the scores schema comment to list what score.ts actually writes. This closes stale-schema-and-scoring-comments; package 5 did the consensus half.
- Verify: on local Docker, run a backfill while markout runs and send `markouts/completed` twice. The duplicate SELECTs return 0 and a duplicate content_hash insert fails.

**18 public-read-hardening.** As the API plan:
- `publicEntityColumns` in `db/queries`, exported.
- bySlug and search use the projection; search escapes LIKE wildcards.
- The profile pages pass only public columns to client components.
- `claims.detail` returns a non-active claim only to its owner or an admin.
- Verify: a live signed-out test checks for no private keys, `q='%'` matching only a literal %, a 404 on a pending claim, and no clerk_user_id in the RSC payload.

**19 paper-short-accounting.** Merges paper-short-accounting with the paper half of price-cache-dedupe.
- Pure `paperAccounting.ts` with the collateral model, exported for the worker (package 66).
- buying-power checks on both sides.
- `createPortfolio` fixes the balance at 10,000,000 cents.
- Valuation calls `getLatestCloses` once over the distinct open tickers.
- addTrade and closeTrade use `getLatestClose`.
- "Sell short" label.
- The worker's inline buying-power code is left alone.
- Verify:
  - unit arithmetic
  - live: a flat short shows about 0 bps; an oversized short gets BAD_REQUEST; a cold portfolioPerformance with 5 positions in 2 tickers takes about 2 throttle intervals.

**20 ticker-page-per-ticker.** As the product plan:
- `topByInstrument` with n ≥ 3, holding its own `MIN_TICKER_SAMPLE`.
- `byTicker` uses it.
- `ticker.overview` drops its dead price call.
- The header shows "Last close · {date}" or "Price unavailable".
- The panels show skeleton and error states.
- Verify: NVDA and AAPL lists differ, and with a bad key the page still renders.

**21 digest-real-recipients.** As the workers plan:
- Per-follower steps with Clerk email lookup (`@clerk/backend`).
- A Resend idempotency key.
- Failures counted as failed.
- Daily and weekly windows, with Monday as the weekly day.
- `DIGEST_FROM_EMAIL`, required.
- Links from `NEXT_PUBLIC_APP_URL`, falling back to www.deepmint.ai.
- **Keys:** ask the maintainer for a Resend key, and test as their own Clerk dev user.

**22 broker-sync-hardening.** Merges snaptrade-secret-encryption and broker-sync-recovery.
- AES-256-GCM `credentialBox` keyed by `BROKER_CREDENTIALS_KEY`. `getSnapTradeClient` returns null without it.
- `sealCreds` and `openCreds` live in `api/lib/snaptrade.ts`, which is already exported, so `api/package.json` is not touched.
- broker-sync's load step returns ids only; each per-link step decrypts inside itself.
- Links in `error` are retried and set back to active on success.
- First sync: completeLink stops setting lastSyncAt, so the first sync uses the 30-day default.
- The Settings Retry button calls syncTrades.
- Verify: crypto round-trip and tamper tests.
- **Keys:** SnapTrade sandbox keys from the maintainer; do not proceed without them. With them: metadata holds only ciphertext, no step output contains the secret, and error-to-active recovery works.

**23 dedupe-status-aware.** As the ingestion plan: pure `dedupeAction`, a transactional supersede of pending copies (pending → rejected, which package 28's trigger allows), and a re-review when only rejected copies exist.

**24 clerk-webhook-and-identity.** As the API plan, plus the slugify consolidation:
- Verify the webhook on the raw body.
- Move the resolver's slug algorithm into `sh/utils.ts` as `slugify(input, fallback)`; the resolver passes `'guide'`, so Guide slugs stay byte-identical.
- Add `clerkDisplayName`.
- Verify: a payload signed with svix and the real CLERK_WEBHOOK_SECRET returns 200 (400 today). "J.P. Morgan" becomes `j-p-morgan` on both paths. The existing slug tests pass unchanged.

**25 sentry-wiring.**
- `instrumentation.ts` `register()` loads the server or edge config by `NEXT_RUNTIME`, with `onRequestError = Sentry.captureRequestError`.
- `instrumentation-client.ts` takes over the client init and adds `onRouterTransitionStart`.
- `next.config.ts` wraps `withSerwist` in `withSentryConfig`; source maps upload only when `SENTRY_AUTH_TOKEN` is set.
- `global-error.tsx` and `error.tsx` call `captureException`.
- `sentry-failures.ts` is an Inngest function on `inngest/function.failed` that reports to Sentry, added to the serve() list in `route.ts`.
- Everything is a no-op without `NEXT_PUBLIC_SENTRY_DSN`.
- **Keys:** a Sentry DSN for a dev project from the maintainer.
- Verify: a thrown route error and a forced failing function both show up in Sentry.

**26 notify-followers-new-claim.** As the product plan. It also skips claims more than 2 days old, so package 56's backfilled or approved emissions do not spam followers.

**27 learn-accuracy.** Describe the current formulas exactly. Package 55 later updates the Sharpe and risk-free text.

### Wave 3

**28 ledger-append-only-triggers.** As the data plan (`drizzle-kit generate --custom`). Verify with the forbidden-statement psql list, admin approve and reject still working, and a full real-key pipeline run with no trigger errors.

**29 aggregates-daily-refresh.** Add a `TZ=America/New_York 30 18 * * *` cron trigger to consensus-signal and influence-aggregate. Package 17 already added concurrency 1 and transactions. Add the as-of date to ConsensusBreakdown and Mag7Grid. Verify: firing the cron and the event together leaves one row per instrument per date.

**30 extraction-redrive.** As the ingestion plan:
- Three backoff retry rounds inside extract-claims, using NCE's dated pricing path.
- Per-capture `.catch` and per-adapter `ingestion/completed` in ingest.
- Backfill re-drives events that already exist.

**31 inngest-step-budgets.**
- `export const maxDuration = 300` on `/api/inngest`. Raise it to 800 only if the maintainer confirms Vercel Pro with Fluid compute.
- Markout prices each claim in its own `step.run('markout-${id}')`, keeping package 17's onConflictDoNothing, and caps claims per run.
- Extractor `LLM_MAX_RETRIES` drops from 2 to 0, so primary plus fallback stays at or under 240 s; Inngest step retries handle transient errors.
- Verify: markout with N due claims shows N steps, each under 40 s. A hanging primary model falls through to the fallback in under 300 s.

**32 db-seed-safety.**
- Refuse unless the DATABASE_URL host is localhost, 127.0.0.1, ::1 or the docker host, or `SEED_ALLOW_REMOTE` equals the exact host.
- Fail fast, with no writes, if Mag-7 rows or seeded slugs already exist.
- Run the whole seed in one transaction.
- New `db:seed:instruments` seeds only the Mag-7, with onConflictDoNothing on ticker (needs 0009).
- Document the `docker compose down -v` reset.
- Verify:
  - a seed against local Docker
  - a fake remote host is refused before connecting
  - a re-run makes no writes
  - `db:seed:instruments` twice leaves 7 rows.

**33 claim-detail-page.** As the product plan: `/claims/[id]` with provenance and outcomes; `events.raw_text` is never returned publicly; ClaimCard gets a source chip and a link.

**34 mcp-tool-contracts.** As the API plan:
- Per-tool scope checks.
- get_entity_track_record reuses package 10's outcomes in `claims.list`.
- rationaleTags on submit_claim.
- `MAG7_TICKERS` check.
- Verify with the live MCP suite, local first, then read-only calls on www.

**35 search-slash-shortcut** and **36 backfill-prices-transient-errors.** As their area plans.

### Wave 4

**37 mirror-portfolio-fixes.** As the product plan, with migration 0011:
- signal-simulate returns early on neutral claims; it owns the neutral skip.
- Trades carry claim_id.
- Markout closes mirrored trades at the outcome's exit price.
- Insufficient cash produces one notification.
- The portfolio cap excludes mirrors; mirrors have their own cap of 5.
- Coordinate with package 19's accounting.

**38 extractor-output-validation.** As the ingestion plan, plus three additions:
- The rating enums and SourceKind derive from `@deepmint/db` enums.
- Export `DEFAULT_MODEL` for package 69.
- Off-grid horizons are still rejected but logged; D22 decides any follow-up.

**39 feed-capture-dates.** As the ingestion plan. Must land before any feed is switched on (package 57).

**40 claim-notes-ui** and **41 notification-links.** As the product plan. Package 41 adds follower slug and type to new-follower metadata, and `createNotification` skips entities with no Clerk user.

**42 leaderboard-min-sample [D1 option 1].** As the scoring plan, with two changes:
- Package 9 already routes v1 through `leaderboard.top`, so only `top` and `bestInCurrentConditions` are gated; v1 just maps `sampleSize`.
- `byTicker` is not touched; package 20 already gates it.

score.ts writes `outcome_count` and `z_significant`; rank notifications use the floor. Delete `checkAntiGaming`. After deploy, send one `markouts/completed`.

**43 public-read-pages [D2 option 1].** As the product plan. Prerequisites 12, 13, 14 and 18 are done by now.

**44 copy-no-false-ai-claims [D3 option 1].** As the product plan. The Explore stub text belongs to package 50.

### Wave 5

**45 merkle-audit-coverage.** As the workers plan, with migration 0012:
- recorded_at is added without a backfill.
- V2 leaf hash over every immutable field.
- Windowed by recorded_at.
- `leaf_version`, with onConflictDoNothing on the date.

**46 attribution-review-guards.**
- Move the evidence helpers to `sh/claimEvidence.ts`; the extractor re-exports them.
- A firm named in a non-rating lane is stored as `wall_street_rating` and held for review.
- Fix the worker comments.
- `pendingReview` returns `holdReasons`.
- Approving an unattributed rating returns BAD_REQUEST.
- The review page explains each hold.
- An approval confirmation step ships under every D15 option.

**47 neutral-claim-returns [D4 option 1].** New neutral outcomes get `returnBps = 0`. The scorer leaves neutral outcomes out of every return metric but keeps them in hit rate.

**48 player-daily-book [D5 option 1].** Pure `dailyBookReturns`, using NCE's exit-date rule, plus unit tests; a one-claim book compounds to the claim's outcome return. No worker change. Split out of player-risk-metrics so the methodology is reviewed on its own.

**49 broker-verification-semantics [D7 option 1].** Merges the API package with the scoring copy package.
- completeLink stores every account and sets status `pending`.
- `verified` requires at least one imported trade in a tracked instrument; a sync error sets `failed`.
- Disconnect also resets `broker_links.is_verified`.
- Copy in Settings and the landing page states exactly the badge and the 1.5× consensus weight on claims.
- **Keys:** SnapTrade sandbox.

**50 nav-cleanup [D10 option 1, D11 option 2].**
- Remove the watcher type.
- Remove Explore and delete its stub.
- Add a "Getting an API key" section (with the maintainer's contact address) and an MCP section to the API docs page.
- If the decisions lag, the watcher removal can ship alone.

**51 profile-edit-and-clerk-sync [D8 option 1].**
- `user.updated` syncs name and avatar; the slug never changes.
- `entity.update` is narrowed to bio and styleTags.
- Settings gets a ProfileForm, and the own profile gets an "Edit profile" link.
- Deletion handling moves to package 64.
- Maintainer: subscribe the Clerk endpoint to `user.updated`.

**52 leaderboard-regime-chips [D6 option 1].** Remove the chips. Under option 2, move this package after 59, to W8, and query `eiv` with an as-of caption.

**53 paper-fill-semantics [D9 option 1].** Fills return their session date; the form and positions show "last close {date}".

### Wave 6

**54 mcp-agent-identity [D12 option 1].** As the API plan, with migration 0013, minus the admin UI, which moves to package 60.
- Agent Player entity, with the key bound through `api_keys.entity_id`.
- `isAgent` added to `publicEntityColumns`.
- Agent badge.
- Live MCP tests.

**55 player-risk-metrics [D5 option 1].**
- Per-instrument `step.run('bars-<ticker>')`, at most 7 calls.
- Daily book from package 48.
- `sharpeRatio` net of `RISK_FREE_ANNUAL` (4%).
- Compounded `maxDrawdown`.
- `calmarRatio`, which wires the dead function.
- `cvar5` and `consistencyScore`.
- Update the Learn Sharpe text and the README.
- Verify: at most 7 bars requests, a one-claim book within 1 bp of its outcome, and identical values across runs.

**56 claims-created-all-lanes [D13 option B].** As the workers plan:
- extract-claims emits events deduplicated by claim id.
- reviewClaim emits on approve.
- signal-simulate adds only the 48 h staleness rule; package 37 already skips neutral claims.
- Backfill emits nothing.

**57 guide-feed-admin [D14 option A].** As the ingestion plan. Prerequisites 15, 30 and 39 are done. Live only after D15 is answered.

### Wave 7

**58 guide-applications-backend [D16 option 2].**
- Migration 0014.
- `guides` router: apply, adminList and adminReview.
- The approval transaction links the user to the ingested Guide, or switches the entity's type.
- The admin review section gets a Guide applications view.
- Rewrite the resolver comment at resolver.ts:34-35. It owns that comment for two-verified-flags too.

**59 eiv-regime-history [D6 option 1].** As the scoring plan:
- Tag outcomes with the regime of the latest snapshot on or before the entry date.
- A regime's data is used once it has at least 5 outcomes.
- `computeOverallEIV` drops the 0.4 penalty.
- bestInCurrentConditions shows only the latest run and returns `asOfDate`.

**60 api-key-ui-agent-scopes [D12].** Agent name, a claims:write checkbox and an expiry select on the admin API-keys page.

**61 terminology-unify [D17 option 1].** As the product plan.

**62 mag7-universe-guards (low).**
- `isCoveredTicker` in constants: claims.submit rejects uncovered tickers; paper.addTrade requires an active, covered instrument; search filters; consensus-signal skips uncovered instruments.
- `consensus.mag7` is filtered and ordered.
- Delete `instruments.mag7`.
- Narrow the instrument asset class to equity and etf.
- `Ratelimit.slidingWindow(CLAIM_RATE_LIMIT, "1 h")`.
- The MCP check stays with package 34.

**63 single-verified-flag [D7 option A].** Every surface reads `brokerLinkStatus === 'verified'`. The seed stops setting `isVerified`. The column is marked unused. No broker.ts or resolver.ts edits; packages 49 and 58 own those.

### Wave 8

**64 entity-account-deletion [D18 option A].** As the data plan:
- Anonymise in one transaction.
- `user.deleted` webhook, plus an admin action.
- The record stays ranked as "Deleted user".
- Keys revoked.
- Digest and agentEntity guards.
- Maintainer: subscribe the endpoint to `user.deleted`.

**65 guide-applications-ui [D16].** "Apply as a Guide" button, a Settings form, and a sign-up redirect.

**66 paper-equity-history [D19 option 2].**
- Migration 0015.
- An after-close cron in Eastern time values all portfolios with one `getLatestCloses` and inserts with ON CONFLICT DO NOTHING.
- `paper.equityHistory` feeds the chart.
- Reuses `api/lib/paperAccounting.ts` through the export package 19 added, so there is no new db query module.

**67 claim-audit-proof [D20 option A].**
- The audit window and leaf construction are extracted to `api/lib/auditWindow.ts`, exported, so the worker and API build identical leaves. It lives in api rather than db/queries to keep db/package.json free in W8.
- Add `getMerkleProof` and `verifyMerkleProof` to `sh/merkle.ts`.
- `claims.auditProof` and `claims.auditRoots`.
- Verification runs in the browser with WebCrypto.
- New `/audit` page, added to the public routes.

### Waves 9–10

**68 worker-dead-code-cleanup.** As the workers plan, minus the score.ts hunk, which package 4 took. Update the function counts in the docs.

**69 bench-providers-refresh.** Only the script; package 38 already exported `DEFAULT_MODEL`.

**70 repo-hygiene.**
- Maintainer first confirms the Vercel Root Directory and the dashboard build and install commands; the Vercel project settings can be read without changing them.
- If the root is `apps/web`, move `vercel.json` to `web/vercel.json`; otherwise delete it and record the settings in the README.
- Delete the unreferenced `run-migration.mjs`.
- `git rm --cached .claude/launch.json`; local copies stay.
- Delete the three unreferenced PNGs after grep confirms nothing uses them.
- Verify: a preview deploy's build log.

**71 redis-local-dev.**
- Add an Upstash-compatible REST proxy (serverless-redis-http) beside the existing Redis in compose.
- Document the opt-in `UPSTASH_REDIS_REST_URL` and token in `.env.example`.
- Declare `@upstash/redis` in packages/shared.
- Alternative, if the maintainer prefers: drop the redis service.
- Verify: with the variables set, regime-cache keys appear, X-RateLimit-Remaining decrements, and the 11th claim in an hour is rejected; without them, everything is a no-op.

**72 scoring-dead-code-cleanup [D21 option 1].** As the scoring plan:
- Delete the MAE/MFE and continuous-Brier helpers.
- Document brier_slices as unused.
- Add the `target_hit_rate` metric.

**73 remove-dead-snapshot-capture [D25 option A].** As the ingestion plan, plus removing playwright and the S3 SDK from `serverExternalPackages` in `next.config.ts`.

**74 prune-unused-trpc-procedures [D24 option 1].** Re-run the caller grep and delete only what is still uncalled. `instruments.mag7` is already gone (package 62).

**75 shared-code-dedupe.**
- Delete `errors.ts` and its export entry.
- Delete `centsToDollars`, `bpsToPercent`, `percentToBps`, `BPS_PER_PERCENT` and `CENTS_PER_DOLLAR`.
- Delete `historicalCacheKey` and `TTL_HISTORICAL`.
- Keep `currentPriceCacheKey`, `TTL_CURRENT`, `dollarsToCents`, `CLAIM_RATE_LIMIT` and `Mag7Ticker`, which are now used.
- Delete the four unused UI files.
- ComparisonChart uses the shared `formatBps`; ConsensusBreakdown renames its formatter.
- Re-grep before each deletion.

**76 spec-citation-comments.** Comments only. Replace each gitignored spec citation with a one-line statement of the rule or formula and a pointer to its test.

**77 polygon-account-limit [D23 option 1].** Add an account-scoped Inngest concurrency key `"polygon"`, limit 1, to the Polygon-heavy functions. Under option 2, add an Upstash slot in `polygonRateLimit` (`sh/polygon.ts` only; package 71 already declared the dependency).

### Conditional follow-ups

These are scheduled only if a non-recommended option is chosen, in the first free wave from W9, with any migration taking the next free number:
- market-regime-backfill (D6 option 2)
- broker-trade-corroboration (D7 option 2) or broker-trade-scoring (D7 option 3, after package 55)
- review-reattribution (D15 option C), or approval retraction (D15 option B, which needs the package 28 trigger widened by a migration)
- merkle-anchoring (D20 option B)
- off-grid-horizons (D22 option B or C)
- paper next-close fills (D9 option 2, migration)
- explore page build (D10 option 2)
- self-serve API keys (D11 option 3)
- snapshot capture (D25 option B)

## Decisions

Each decision lists its options, recommendation, the packages it blocks, and the wave by which it is needed.

**D1. Minimum-sample policy for public rankings.** Needed by W4. Blocks 42.
1. Gate at 10 scored outcomes, per horizon on horizon boards. Rows below the floor show as "Provisional (n of 10)" on profiles. Every row shows n. The z-test flag is stored as a badge.
2. The spec's anti-gaming gate: 30 outcomes and 90 days, with kurtosis and turnover penalties. Boards stay empty for 90 or more days.
3. No gate: rank on the Wilson lower bound and shrunk averages.

Recommendation: 1, with N = 10 in a shared constant.

**D2. What may signed-out visitors see?** Needed by W4. Blocks 43.
1. Open the read-only pages (leaderboard, profiles, ticker, Learn, claim pages).
2. Keep the sign-in wall and move those procedures to protectedProcedure.
3. Hybrid: leaderboard and profiles only.

Recommendation: 1. The data is already public through tRPC and REST, and package 18 lands first.

**Decided (2026-10-06): the maintainer's own option.** Only ticker pages, Learn and claim pages are public; the leaderboard and profiles stay behind sign-in. Package 43 builds that. Still open, to settle when wave 4 starts: whether the leaderboard and profile tRPC procedures, which are public today, also move behind sign-in.

**D3. How does product copy describe AI?** Needed by W4. Blocks 44.
1. "AI" only for extraction.
2. Drop "AI" everywhere.
3. Keep AI-first copy and build ML scoring.

Recommendation: 1.

**D4. What does a neutral claim's return_bps mean?** Needed by W5. Blocks 47.
1. No position: 0 bps, excluded from return metrics, kept in hit rate.
2. Range bet: 200 bps minus |move|.
3. Exclude neutral claims from all scoring.

Recommendation: 1.

**D5. Player Sharpe, Calmar, drawdown, CVaR and consistency methodology.** Needed by W5. Blocks 48 and 55.
1. A daily mark-to-market book from daily closes; at most 7 bar requests per run.
2. Trade-level statistics annualised by √(252/h).
3. Drop these Player metrics until verified P&L exists.

Recommendation: 1.

**D6. Regime-aware ranking.** This merges the scoring regime decision and the product chips decision. Needed by W5 for package 52 and W7 for package 59. Blocks 52 and 59.
1. Each outcome takes the regime on its entry date from #12's snapshots. A regime's data counts once it has 5 or more outcomes; earlier outcomes count only toward overall. eiv_overall drops the 0.4 penalty. Best in Current Conditions shows the latest run with its date. The leaderboard chips are removed now, and come back for EIV only once two regimes have history.
2. As option 1, plus a one-off Polygon backfill of market_regimes (needs a live I:VIX entitlement check), and EIV-only chips kept now.
3. Drop the regime feature: eiv_overall only, no chips, no Best in Current Conditions.

Recommendation: 1. Scoring every metric per regime, which the product plan offered, is a later extension of option 1.

**D7. Broker linking and the Verified badge.** This merges the scoring broker decision, the API Verified decision and the data two-flags decision. Needed by W5. Blocks 49 and 63.
1. Verified means broker-verified only: at least one imported trade in a tracked instrument on any linked account, withdrawn on sync failure or disconnect. Linking gives only the badge and 1.5× consensus weight on the user's claims, and the copy says exactly this. `entities.is_verified` is no longer read.
2. Per-claim corroboration: a neutral "Broker linked" label, and the 1.5× weight only on claims matched by a synced trade within 48 h. Needs one migration.
3. Option 1 now, plus scoring real trades later as verified_* metrics through the D5 daily book.

Recommendation: 1. Also considered: dropping the 1.5× weight entirely, and a separate "Verified Guide" badge tied to D16.

**D8. Who owns profile fields?** Needed by W5. Blocks 51.
1. Clerk owns name and avatar, synced on user.updated with a stable slug; Deepmint owns bio and style tags.
2. Deepmint owns name, bio and tags; only the avatar syncs.
3. Profiles stay read-only; sync only.

Recommendation: 1. Deletion is decided separately in D18.

**D9. At what price do paper trades fill?** Needed by W5. Blocks 53.
1. Last close, labelled with its date.
2. Next close: pending until a worker prices it. Needs a migration.
3. Intraday, which needs a Polygon plan upgrade.

Recommendation: 1.

**D10. Explore in the nav.** Needed by W5. Blocks 50.
1. Remove it.
2. Build a Mag-7 Explore page.
3. Redirect it to the dashboard.

Recommendation: 1.

**D11. API docs access.** Needed by W5. Blocks 50.
1. Admin-only.
2. Visible to signed-in users, with "Getting an API key" and MCP sections. Needs a maintainer contact address.
3. Self-serve read keys.

Recommendation: 2.

**D12. MCP agent identity.** Needed by W6. Blocks 54 and 60.
1. Agent Player: `entities.is_agent` and `api_keys.entity_id`. One migration.
2. A new entity type, `agent`.
3. A separate Clerk admin account per agent; no schema change.

Recommendation: 1. Under option 3, package 54 is dropped and package 60 ships unblocked.

**D13. Which claims does a mirror copy?** Needed by W6. Blocks 56.
1. Every claim when it goes active.
2. Only claims dated within 48 h. Backfill never mirrors.
3. Ingest-time claims only, never approvals.

Recommendation: 2.

**D14. How is a Guide feed switched on?** Needed by W6. Blocks 57.
1. An admin `/admin/guides` page.
2. A SQL runbook plus a backfill flag.
3. Self-serve by claimed Guides, which depends on D16.

Recommendation: 1.

**D15. Undo and re-attribution of reviewed claims.** Needed by W5 for the closure of carrier-entity-claims-approvable, and before any news or feed lane is switched on. Blocks only a conditional follow-up; package 46 ships under every option.
1. Approve and reject stay final, with a confirmation step (in package 46).
2. Allow retracting an approval (active → rejected) while no outcome exists. Conflicts with package 28's trigger, so it needs a trigger migration.
3. Option 2 plus re-attribution by inserting a new claim and rejecting the held copy. Compatible with the triggers when limited to held claims.

Recommendation: 1 now; build re-attribution of held claims before switching on the news or feed lanes.

**D16. How does someone become a Guide?** Needed by W7. Blocks 58 and 65.
1. Self-select at sign-up.
2. Apply, and an admin approves, linking the user to an ingested Guide where one exists. One migration.
3. Ingested-only, with an admin link action.

Recommendation: 2.

**D17. User-facing terminology.** Needed by W7. Blocks 61.
1. "Claim", with "Expected Information Value".
2. "Prediction".
3. "Call".

Recommendation: 1.

**D18. What does account deletion do?** Needed by W8. Blocks 64; it also removes deletion handling from 51. The area plans disagree here: the product plan said hide, the data plan said anonymise.
1. Anonymise: blank personal fields, slug becomes `deleted-<id>`, keys revoked, the record stays ranked as "Deleted user".
2. Hide everywhere and exclude from scoring.
3. Defer, and remove the partial `deleted_at` checks.

Recommendation: 1. A user cannot erase a bad record and re-register, and personal data is still removed.

**D19. The paper equity curve.** Needed by W8. Blocks 66.
1. Remove the chart and the Learn sentence that promises it.
2. Daily snapshots in a new table, written by a cron. One migration.
3. Rebuild on demand from bars.

Recommendation: 2.

**D20. Publishing and anchoring the Merkle roots.** Needed by W8. Blocks 67.
1. Publish the roots list and per-claim proofs.
2. Option 1 plus OpenTimestamps anchoring. Likely a migration.
3. Keep the roots internal and drop the "audited" wording.

Recommendation: 1 now, 2 after launch.

**D21. Unused scoring code.** Needed by W9. Blocks 72.
1. Mixed: wire what is cheap (including target_hit_rate), delete MAE/MFE and continuous Brier, keep brier_slices documented.
2. Build everything, with a migration and one Polygon call per claim.
3. Delete everything, including the target_hit computation.

Recommendation: 1.

**D22. Off-grid extracted horizons.** Needed any time; it decides only whether extractor-silent-drops closes with package 38.
1. Reject and log (done in package 38).
2. Snap to the nearest grid value and hold for review.
3. Extend the horizon grid.

Recommendation: 1.

**D23. Account-wide Polygon rate limiting.** This one is new, from the infra planning. Needed by W10. Blocks 77.
1. Package 2's in-process queue plus an account-scoped Inngest concurrency key `"polygon"` (limit 1) on the Polygon-heavy functions. No new infrastructure.
2. A Redis (Upstash) slot inside `polygonRateLimit`. Needs Upstash provisioned in production.
3. Accept the per-instance queue and document the residue.

Recommendation: 1. #12 and package 2 already remove most interactive Polygon calls.

**D24. Unused tRPC procedures.** Needed by W10. Blocks 74.
1. Delete those no package wires up.
2. Give each a UI caller.
3. Expose the read-only ones through REST v1 or MCP.

Recommendation: 1.

**D25. R2 snapshots.** Needed by W10. Blocks 73.
1. Delete the capture and R2 code and its dependencies; keep the column.
2. A fetch-only snapshot written in the events insert.
3. Playwright screenshots in a separate worker.

Recommendation: 1.

## Coverage

Not excluded: 98 issues. Excluded (open PRs): self-logged-claim-lookahead (NCE), markout-holiday-exit-never-priced (NCE), mcp-unreachable-basepath (#11), regime-lookup-on-interactive-pages (#12), index-fallback-fabricates-values (#12). 98 + 5 = 103.

**Scoring (10)**

| Issue | Where it went |
|---|---|
| leaderboard-no-minimum-sample | 9 (sort), 42 [D1] |
| eiv-not-regime-aware | 59 [D6] |
| player-metrics-annualise-claim-returns | 48, 55 [D5] |
| score-outcomes-unordered | 4 |
| broker-trades-never-scored | 49 [D7] |
| influence-pipeline-flaws | 6 |
| consensus-includes-expired-claims | 5 |
| neutral-claim-scoring | 47 [D4] |
| target-precision-floor-inactive | 7 |
| dead-scoring-code | 6, 8, 55, 72 [D21] |

**Product (28)**

| Issue | Where it went |
|---|---|
| claim-outcomes-not-shown | 10 |
| leaderboard-regime-filter-empty | 52 [D6] |
| most-influential-tab-empty | 11 |
| guide-signup-path-missing | 58, 65 [D16] |
| signin-wall-vs-anonymous-trpc | 43 [D2] |
| ai-scoring-copy-misleading | 11, 44 [D3] |
| profile-edit-and-clerk-sync | 51 [D8]; deletion part 64 [D18] |
| claim-provenance-not-visible | 33, 67 [D20] |
| price-lookups-uncached-serial | 2, 19, 20, 37 |
| instrument-universe-inconsistent | 62 (low) |
| ticker-top-lists-global | 20 |
| ticker-page-dead-fragile-wiring | 5, 20 |
| current-price-is-previous-close | 20, 27, 53 [D9] |
| mirror-portfolio-behaviour | 37 (staleness rule in 56) |
| explore-stub-in-nav | 50 [D10] |
| watcher-nav-type-dead | 50 |
| equity-curve-placeholder | 66 [D19] |
| search-slash-hint | 35 |
| follow-mirror-own-profile | 12 |
| admin-pages-not-gated | 13 |
| notifications-dead-ends | 26, 41 |
| learn-content-drift | 27 (Sharpe text refreshed in 55) |
| terminology-inconsistent | 61 [D17] |
| api-key-ui-scopes | 60 [D12] |
| api-docs-nav-for-all | 50 [D11] |
| ticker-requests-no-ui | **skipped**: dormant until instrument expansion (Mag-7 scope); no cheap correctness fix needed |
| claim-notes-no-ui | 40 |
| pwa-assets-behind-auth | 14 |

**API (15)**

| Issue | Where it went |
|---|---|
| consensus-mag7-returns-all-instruments | 62 (low) |
| mcp-acts-as-admin | 54 [D12] |
| paper-short-equity-overstated | 19 |
| entity-endpoints-leak-private-fields | 18 |
| claims-detail-any-status | 18 |
| broker-verified-means-any-account | 49 [D7] |
| snaptrade-secret-plaintext | 22 |
| paper-short-cash-bypass | 19 |
| identity-derivation-inconsistent | 24 |
| v1-leaderboard-missing-fixes | 9 |
| mcp-tool-contract-gaps | 34 |
| openapi-spec-drift | 9 |
| clerk-webhook-fragile | 24 |
| clerk-getuser-per-request | 13 |
| unused-trpc-procedures | 74 [D24] |

**Workers (9)**

| Issue | Where it went |
|---|---|
| claims-created-only-self-logged | 56 [D13] |
| digest-placeholder-recipient | 21 |
| aggregates-refresh-only-after-markout | 29 |
| backfill-prices-deactivates-on-error | 36 (low) |
| broker-sync-error-sticky | 22 |
| cron-times-assume-edt (residue) | 1 |
| merkle-audit-gaps | 45, 67 [D20] |
| leaderboard-refresh-noop | 68 |
| worker-stale-docstrings | 4, 68 |

**Ingestion (13)**

| Issue | Where it went |
|---|---|
| guide-resolver-matches-user-slug | 15 |
| extraction-failures-never-retried | 30 |
| firm-reattribution-all-lanes | 46 |
| carrier-entity-claims-approvable | 46; residual decided by D15 |
| cross-source-dedupe-ignores-status | 23 |
| rss-undated-items-reingested | 39 |
| rss-lane-cannot-be-enabled | 57 [D14] |
| r2-snapshot-capture-dead | 73 [D25] |
| bench-providers-stale | 69 |
| extractor-silent-drops | 38; off-grid part decided by D22 |
| firm-guide-resolution-edge-cases | 15 |
| rationale-tags-vocabulary | 38 |
| extractor-client-before-prefilter | 38 |

**Data (7)**

| Issue | Where it went |
|---|---|
| fallback-prices-in-ledger (keyless residue) | 2 |
| uniqueness-invariants-comment-only | 17, 28 |
| soft-delete-half-implemented | 64 [D18] |
| stale-schema-and-scoring-comments | 5, 17 |
| two-verified-flags | 63 [D7] |
| dead-and-duplicated-shared-code | 2, 24, 38, 62, 75 |
| asset-class-unpriceable | 62 (create guard, low); pricing for non-equity classes **skipped**, as it is instrument expansion |

**Infrastructure (15)**

| Issue | Where it went |
|---|---|
| trpc-inngest-prefixed-keys | 3 |
| polygon-throttle-not-serialized | 2, 77 [D23] |
| sentry-inert | 25 |
| db-seed-unsafe | 32 |
| stale-worker-build-artifacts | 3 |
| inngest-route-no-maxduration | 31 |
| domain-mismatch | 9, 21, 68, 73 |
| lint-broken | 16 |
| worker-scripts-broken | 3 |
| root-vercel-json | 70 |
| redis-compose-unused | 71 |
| ci-coverage-narrow | 16 |
| run-migration-script-unsafe | 70 |
| turbo-env-undeclared | 16 |
| tracked-personal-files | 70 |

**Code comments (1)**

| Issue | Where it went |
|---|---|
| gitignored-doc-references | 76 |

## Keys to request and maintainer steps

**Keys** (ask before writing each wave's live tests):

| Wave | Keys |
|---|---|
| W1 | POLYGON_API_KEY, HF_API_KEY, TEST_API_KEY, Clerk dev keys |
| W2 | Resend API key (21), SnapTrade sandbox keys (22, later 49), Sentry DSN (25), CLERK_WEBHOOK_SECRET (24) |
| W8 | Clerk dev-instance webhook tunnel (51 and 64 tests) |

**Production steps for the maintainer:**
- Paste migrations 0009 to 0015 in order, each **before** its wave's PR merges.
- Set env vars: DIGEST_FROM_EMAIL (21), BROKER_CREDENTIALS_KEY (22), NEXT_PUBLIC_SENTRY_DSN and an optional SENTRY_AUTH_TOKEN (25).
- Report whether production has an unprefixed INNGEST_EVENT_KEY (3).
- Confirm the Vercel plan, for maxDuration (31), and the Root Directory (70).
- Optionally add the Clerk session-token claim (13).
- Subscribe the Clerk webhook to user.updated (W5) and user.deleted (W8).
- Send one `markouts/completed` after package 42 deploys.
- After 2026-11-02, check that markout ran at 22:00 UTC (1).
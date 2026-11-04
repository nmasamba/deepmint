# Known issues

The register of verified defects in Deepmint's code, from the coherence audit of **2026-10-05**. Every entry was checked against `main` at `cd63901` (after PRs #6–#9). It lists **35 open issues: no high, 7 medium and 28 low**. Docs drift that this docs update fixed is listed at the end, under [Fixed by this docs update](#fixed-by-this-docs-update).

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
| [Scoring and ranking](#area-scoring) | 0 | 1 | 1 | 2 |
| [Product (web app)](#area-product) | 0 | 3 | 8 | 11 |
| [API: tRPC, REST v1, MCP, auth](#area-api) | 0 | 1 | 2 | 3 |
| [Workers and schedules](#area-workers) | 0 | 1 | 4 | 5 |
| [Ingestion and extraction](#area-ingestion) | 0 | 0 | 2 | 2 |
| [Data model and shared code](#area-data) | 0 | 0 | 4 | 4 |
| [Infrastructure, config and tooling](#area-infra) | 0 | 1 | 6 | 7 |
| [Code comments](#area-docs) | 0 | 0 | 1 | 1 |
| **All** | **0** | **7** | **28** | **35** |

<a id="area-scoring"></a>

## Scoring and ranking

<a id="eiv-not-regime-aware"></a>

### "Regime-aware" EIV is never regime-aware

**Medium** · feature-gap · `eiv-not-regime-aware`

- **What's wrong:** `score.ts` passes an empty regime history to `computeRegimeAwareEIV`. Every entity therefore gets the fallback with a fixed 0.4 penalty, and `eiv` always equals `eiv_overall`. The current regime only sets the `regime_tag` string. `leaderboard.bestInCurrentConditions` returns the `eiv` rows from the latest scoring date with a matching tag, with no age limit, and does not return that date.
- **User impact:** "Best in Current Conditions" is the plain overall-EIV top 5 from whichever scoring run last had that regime label, which may be weeks old. The 0.4 factor also shrinks every EIV, so the profile labels Strong Edge (≥60) and Moderate Edge (≥30) are harder to reach.
- **Evidence:** [`apps/worker/functions/score.ts:188-199`](../apps/worker/functions/score.ts#L188-L199) · [`apps/worker/functions/score.ts:228-239`](../apps/worker/functions/score.ts#L228-L239) · [`packages/scoring/src/eiv.ts:34`](../packages/scoring/src/eiv.ts#L34) · [`packages/scoring/src/eiv.ts:52`](../packages/scoring/src/eiv.ts#L52) · [`packages/api/routers/leaderboard.ts:181-196`](../packages/api/routers/leaderboard.ts#L181-L196)

<a id="dead-scoring-code"></a>

### Unused scoring functions and outcome columns

**Low** · dead-code · `dead-scoring-code`

- **What's wrong:** Four exported functions are called only by tests: `maeAndMfe`, `computeSliceOutcome`, `continuousBrierScore` and `timeDecayedBrierScore`. `outcomes.brier_slices` is never written. `outcomes.target_hit` is computed, but no metric or UI uses it.
- **User impact:** Maintainers may assume continuous Brier and MAE/MFE feed live scores.
- **Evidence:** [`packages/scoring/src/player.ts:23`](../packages/scoring/src/player.ts#L23) · [`packages/scoring/src/guide.ts:141-189`](../packages/scoring/src/guide.ts#L141-L189) · [`apps/worker/functions/markoutClaim.ts:110-129`](../apps/worker/functions/markoutClaim.ts#L110-L129)

<a id="area-product"></a>

## Product (web app)

<a id="guide-signup-path-missing"></a>

### "Sign Up as a Guide" creates a Player; there is no way to become or claim a Guide

**Medium** · feature-gap · `guide-signup-path-missing`

- **What's wrong:** Both landing-page buttons, "Sign Up as a Guide" and "Sign Up as a Player", go to plain `/sign-up`, and every new user is created as type `player`. No code changes `entities.type`, and the profile-claiming flow mentioned in a resolver comment does not exist.
- **User impact:** An analyst who signs up as a Guide becomes a Player: scored with Player metrics (no Brier, z-score or target precision), listed with Players, without the ×1.2 Guide consensus weight or an Influence tab. An analyst already ingested as a Guide ends up with two unlinked entities.
- **Evidence:** [`apps/web/components/landing/ChoosePath.tsx:69-75`](../apps/web/components/landing/ChoosePath.tsx#L69-L75) · [`apps/web/components/landing/ChoosePath.tsx:123-129`](../apps/web/components/landing/ChoosePath.tsx#L123-L129) · [`packages/db/queries/ensureEntityForClerkUser.ts:58`](../packages/db/queries/ensureEntityForClerkUser.ts#L58) · [`packages/ingestion/src/sources/resolver.ts:34-35`](../packages/ingestion/src/sources/resolver.ts#L34-L35)

<a id="profile-edit-and-clerk-sync"></a>

### Deleting a Clerk account leaves the public profile in place

**Medium** · feature-gap · `profile-edit-and-clerk-sync`

- **What's wrong:** The Clerk webhook handles `user.created` and `user.updated`, not `user.deleted`, and nothing ever sets `entities.deleted_at`. (Since wave 5 Clerk's name and avatar sync on `user.updated`, once the endpoint subscribes to it, the slug never changes, and users edit their bio and style tags in Settings.)
- **User impact:** Deleting a Clerk account leaves the public profile, claims and leaderboard rows in place.
- **Evidence:** [`apps/web/app/api/webhooks/clerk/route.ts`](../apps/web/app/api/webhooks/clerk/route.ts)

<a id="claim-provenance-not-visible"></a>

### The "audited" track record cannot be checked against an audit root

**Medium** · feature-gap · `claim-provenance-not-visible`

- **What's wrong:** Nothing reads `audit_roots`, and no Merkle proof is ever generated. (Since wave 3 each claim has a page, `/claims/[id]`, with its source link, publisher, dates, verified quote, content hash and outcome, and claim cards carry a source chip that links to it.)
- **User impact:** Users can trace a call to its source, but not check it against an audit root, so the "audited performance" and "verified track records" copy has only half of its evidence behind it.
- **Evidence:** [`apps/worker/functions/audit.ts:56-62`](../apps/worker/functions/audit.ts#L56-L62)

<a id="instrument-universe-inconsistent"></a>

### Each surface uses a different instrument universe

**Low** · feature-gap · `instrument-universe-inconsistent`

- **What's wrong:** Ingestion and ticker pages accept only the 7 Mag-7 tickers. Claim submission, search and the consensus worker accept any active instrument. Paper trades accept any instrument, even an inactive one. (Since wave 3 the MCP ticker tools accept only the Mag 7, though `search_instruments` still lists any instrument.)
- **User impact:** Latent while only the Mag 7 exist, as in production since 2026-08-11, and Mag-7 only is the deliberate scope for now. Once an admin adds instruments (for example with the S&P button), users can claim and trade tickers whose pages say "Coming soon", and ingestion never produces Guide claims for them. Make every surface agree before expanding.
- **Evidence:** [`packages/ingestion/src/extractor.ts:461-472`](../packages/ingestion/src/extractor.ts#L461-L472) · [`apps/web/app/(app)/ticker/[symbol]/page.tsx:18-30`](../apps/web/app/%28app%29/ticker/%5Bsymbol%5D/page.tsx#L18-L30) · [`packages/api/routers/claims.ts:73-91`](../packages/api/routers/claims.ts#L73-L91) · [`packages/api/routers/paper.ts:138-150`](../packages/api/routers/paper.ts#L138-L150)

<a id="explore-stub-in-nav"></a>

### Explore is a stub but a main navigation item

**Low** · feature-gap · `explore-stub-in-nav`

- **What's wrong:** `/explore` renders a heading and one line promising "AI-surfaced tickers, sectors, and weighted market signals", and nothing else. It is the third sidebar item and one of the four mobile bottom-bar tabs.
- **User impact:** A quarter of the mobile tab bar leads to an empty page.
- **Evidence:** [`apps/web/app/(app)/explore/page.tsx:1-10`](../apps/web/app/%28app%29/explore/page.tsx#L1-L10) · [`apps/web/components/layout/Sidebar.tsx:33`](../apps/web/components/layout/Sidebar.tsx#L33) · [`apps/web/components/layout/Sidebar.tsx:161`](../apps/web/components/layout/Sidebar.tsx#L161)

<a id="watcher-nav-type-dead"></a>

### Sidebar "watcher" entity type and per-type nav filtering are dead

**Low** · dead-code · `watcher-nav-type-dead`

- **What's wrong:** The sidebar's `NavItem.entityType` allows `"watcher"`, the only occurrence of that word in the code; entity types are `player` and `guide`. Nothing reads `entityType`, so "My Claims" shows for everyone, which is correct because every signed-in user is a Player.
- **User impact:** None for users. It suggests a role model that does not exist.
- **Evidence:** [`apps/web/components/layout/Sidebar.tsx:27`](../apps/web/components/layout/Sidebar.tsx#L27) · [`apps/web/components/layout/Sidebar.tsx:96`](../apps/web/components/layout/Sidebar.tsx#L96) · [`packages/db/schema/entities.ts:3`](../packages/db/schema/entities.ts#L3)

<a id="equity-curve-placeholder"></a>

### Paper "Equity Curve" is a two-point placeholder

**Low** · feature-gap · `equity-curve-placeholder`

- **What's wrong:** The chart plots only Start and Now; no equity history is stored. Learn describes it as a way to "track your performance".
- **User impact:** A straight line that tells users nothing the Total Return card does not.
- **Evidence:** [`apps/web/components/paper/EquityCurve.tsx:21-26`](../apps/web/components/paper/EquityCurve.tsx#L21-L26) · [`apps/web/components/paper/PortfolioDetail.tsx:105-111`](../apps/web/components/paper/PortfolioDetail.tsx#L105-L111) · [`apps/web/lib/learnModules.ts:277`](../apps/web/lib/learnModules.ts#L277)

<a id="terminology-inconsistent"></a>

### EIV and "claim" have several user-facing names

**Low** · docs-drift · `terminology-inconsistent`

- **What's wrong:** EIV is "Expected Information Value" in the scoring code and Learn, but "Earned Information Value" on profiles. "Claim" and "prediction" are used interchangeably, often on one screen ("Make a Prediction" opens "Submit a Claim").
- **User impact:** Cosmetic confusion; nothing breaks.
- **Evidence:** [`packages/scoring/src/eiv.ts:2`](../packages/scoring/src/eiv.ts#L2) · [`apps/web/lib/learnModules.ts:218`](../apps/web/lib/learnModules.ts#L218) · [`apps/web/components/EntityProfileTabs.tsx:99`](../apps/web/components/EntityProfileTabs.tsx#L99) · [`apps/web/app/(app)/dashboard/page.tsx:30`](../apps/web/app/%28app%29/dashboard/page.tsx#L30) · [`apps/web/components/claims/SubmitClaimForm.tsx:132`](../apps/web/components/claims/SubmitClaimForm.tsx#L132)

<a id="api-key-ui-scopes"></a>

### Admin API-key page cannot mint write keys or set an expiry

**Low** · feature-gap · `api-key-ui-scopes`

- **What's wrong:** The page offers only `scores:read`, `consensus:read` and `leaderboard:read`, and sends no `expiresAt`, although `apiKeys.create` accepts `claims:write` and an expiry.
- **User impact:** A key for the MCP write tools needs a hand-made tRPC call or a database edit, and every UI-made key never expires.
- **Evidence:** [`apps/web/app/(app)/admin/api-keys/page.tsx:34-38`](../apps/web/app/%28app%29/admin/api-keys/page.tsx#L34-L38) · [`apps/web/app/(app)/admin/api-keys/page.tsx:90-94`](../apps/web/app/%28app%29/admin/api-keys/page.tsx#L90-L94) · [`packages/api/routers/apiKeys.ts:8-26`](../packages/api/routers/apiKeys.ts#L8-L26)

<a id="api-docs-nav-for-all"></a>

### "API Docs" is shown to everyone, but only admins can get keys

**Low** · feature-gap · `api-docs-nav-for-all`

- **What's wrong:** Every signed-in user sees API Docs (`/docs/api`). Keys can only be minted by admins, there is no request flow, and the page does not say how to get one or mention MCP.
- **User impact:** Non-admins reach a full API reference they cannot use, with no way to ask for access.
- **Evidence:** [`apps/web/components/layout/Sidebar.tsx:51`](../apps/web/components/layout/Sidebar.tsx#L51) · [`packages/api/routers/apiKeys.ts:17`](../packages/api/routers/apiKeys.ts#L17) · [`apps/web/app/(app)/docs/api/page.tsx:8-24`](../apps/web/app/%28app%29/docs/api/page.tsx#L8-L24)

<a id="ticker-requests-no-ui"></a>

### Users cannot request a ticker, and approving a request creates nothing

**Low** · feature-gap · `ticker-requests-no-ui`

- **What's wrong:** `instruments.requestTicker` has no caller, so the admin "User Requests" tab is always empty. `reviewRequest` only updates the request's status: it creates no instrument and starts no price check. The admin UI has no control to add one ticker.
- **User impact:** The request-to-coverage workflow does nothing end to end. It is dormant groundwork for the planned post-maturity expansion, so it matters only when that work starts.
- **Evidence:** [`packages/api/routers/instruments.ts:400-454`](../packages/api/routers/instruments.ts#L400-L454) · [`packages/api/routers/instruments.ts:480-507`](../packages/api/routers/instruments.ts#L480-L507) · [`apps/web/app/(app)/admin/instruments/page.tsx:104-115`](../apps/web/app/%28app%29/admin/instruments/page.tsx#L104-L115)

<a id="area-api"></a>

## API: tRPC, REST v1, MCP, auth

<a id="consensus-mag7-returns-all-instruments"></a>

### Dashboard "Consensus — Mag 7" grid lists every active instrument

**Medium** · bug · `consensus-mag7-returns-all-instruments`

- **What's wrong:** `consensus.mag7` selects every active instrument, with no ticker filter or ordering, and runs one sequential query per instrument. Each tile links to `/ticker/{ticker}`. A correctly filtered `instruments.mag7` exists, but nothing calls it and its response shape differs.
- **User impact:** Latent while only the Mag 7 exist. After an admin presses "Seed S&P 500 Top 50", every dashboard shows 57 tiles in no set order under the Mag 7 heading, 50 of them leading to "Coming soon", and each load runs 57 sequential queries.
- **Evidence:** [`packages/api/routers/consensus.ts:26-49`](../packages/api/routers/consensus.ts#L26-L49) · [`apps/web/components/dashboard/Mag7Grid.tsx:31-34`](../apps/web/components/dashboard/Mag7Grid.tsx#L31-L34) · [`apps/web/app/(app)/dashboard/page.tsx:38-41`](../apps/web/app/%28app%29/dashboard/page.tsx#L38-L41) · [`packages/api/routers/instruments.ts:193-233`](../packages/api/routers/instruments.ts#L193-L233)

<a id="snaptrade-secret-plaintext"></a>

### SnapTrade user secrets are stored in plaintext

**Low** · security · `snaptrade-secret-plaintext`

- **What's wrong:** `initLink` stores the SnapTrade `userSecret` unencrypted in `broker_links.metadata`, and `broker-sync` returns whole rows from a step, so Inngest run state keeps a copy.
- **User impact:** None today: no secrets are stored. Once enabled, database or Inngest read access exposes them; using them also needs the partner consumer key, which lives in Vercel env.
- **Evidence:** [`packages/api/routers/broker.ts:110-127`](../packages/api/routers/broker.ts#L110-L127) · [`apps/worker/functions/broker-sync.ts:36-46`](../apps/worker/functions/broker-sync.ts#L36-L46)

<a id="unused-trpc-procedures"></a>

### 16 of 72 tRPC procedures have no UI caller

**Low** · dead-code · `unused-trpc-procedures`

- **What's wrong:** 13 are called nowhere: `entity.search`, `instruments.detail`, `.list`, `.mag7`, `.adminCreate`, `.requestTicker`, `leaderboard.byTicker`, `consensus.history`, `scores.history`, `social.followers`, `social.following`, `regime.history` and `influence.myInfluencers`. Two more are called only by MCP (`consensus.byInstrument`, `entity.bySlug`), and `entity.stats` only by the hidden landing `SocialProof`.
- **User impact:** Maintenance cost; 5 of the 13 answer signed-out callers.
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

<a id="merkle-audit-gaps"></a>

### Merkle roots are stored but never published, and older claims have gaps

**Low** · data-integrity · `merkle-audit-gaps`

- **What's wrong:** `bitcoin_tx_id` is never written and nothing reads `audit_roots`, so a root proves nothing to anyone outside the database. Claims stored before migration 0012 have no `recorded_at`: those dated earlier than they were stored (ratings, backfill, retried extractions) are in no root, and those that are in a root were hashed by leaf version 1, which leaves out target, entry price, confidence and rationale. (Since wave 5 each day's root covers every claim recorded that day, whatever its date, hashes every column but the review status, and a re-run for a stored date changes nothing.)
- **User impact:** No visible effect today, because roots are neither published nor anchored. Once published, older history would be only partly covered.
- **Evidence:** [`apps/worker/functions/audit.ts`](../apps/worker/functions/audit.ts) · [`packages/db/schema/audit.ts`](../packages/db/schema/audit.ts)

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

<a id="soft-delete-half-implemented"></a>

### Soft delete is read in some places but never set

**Low** · data-integrity · `soft-delete-half-implemented`

- **What's wrong:** `entities.deleted_at` is checked by five procedures but written by nothing. Most reads (profiles, search, REST v1, consensus, scoring, influence, MCP) ignore it, and a comment wrongly says consensus excludes deleted entities.
- **User impact:** No effect today. A user cannot be removed, and a manual SQL soft-delete would hide an entity from only some surfaces.
- **Evidence:** [`packages/db/schema/entities.ts:22`](../packages/db/schema/entities.ts#L22) · [`packages/api/routers/entities.ts:109-114`](../packages/api/routers/entities.ts#L109-L114) · [`apps/worker/functions/consensus-signal.ts:57-66`](../apps/worker/functions/consensus-signal.ts#L57-L66)

<a id="two-verified-flags"></a>

### Two "verified" flags are read inconsistently

**Low** · bug · `two-verified-flags`

- **What's wrong:** Profile headers and the ticker Top Entities panel show Verified if `entities.is_verified` or `broker_link_status='verified'`. The leaderboard page, Settings, REST v1 and consensus read only `broker_link_status`. Only the seed sets `is_verified`. No UI reads `broker_links.is_verified`.
- **User impact:** None in production, where neither flag is set. In a seeded local database the badge differs between surfaces.
- **Evidence:** [`apps/web/components/EntityProfileHeader.tsx:45-46`](../apps/web/components/EntityProfileHeader.tsx#L45-L46) · [`apps/web/components/ticker/TopEntitiesPanel.tsx:54-56`](../apps/web/components/ticker/TopEntitiesPanel.tsx#L54-L56) · [`apps/web/app/(app)/leaderboard/page.tsx:191-192`](../apps/web/app/%28app%29/leaderboard/page.tsx#L191-L192) · [`apps/web/app/api/v1/leaderboard/route.ts:107`](../apps/web/app/api/v1/leaderboard/route.ts#L107)

<a id="dead-and-duplicated-shared-code"></a>

### Dead and duplicated shared code

**Low** · dead-code · `dead-and-duplicated-shared-code`

- **What's wrong:** Unused: `errors.ts` (6 error classes), `centsToDollars`, `bpsToPercent`, `percentToBps`, `BPS_PER_PERCENT`, `CENTS_PER_DOLLAR`, `CLAIM_RATE_LIMIT`, `Mag7Ticker`, `historicalCacheKey` with `TTL_HISTORICAL`, and four `components/ui` files. Duplicated: the claims rate limit (hard-coded 10/h), a 7-ticker list in `instruments.mag7`, and two local copies of the shared `formatBps`. (Since wave 2 there is one `slugify`, in `@deepmint/shared`.)
- **User impact:** None for users; noise for maintainers.
- **Evidence:** [`packages/shared/src/errors.ts:1-45`](../packages/shared/src/errors.ts#L1-L45) · [`packages/shared/src/polygonCache.ts:80-85`](../packages/shared/src/polygonCache.ts#L80-L85) · [`packages/api/routers/claims.ts:34`](../packages/api/routers/claims.ts#L34)

<a id="asset-class-unpriceable"></a>

### Non-equity asset classes are accepted but cannot be priced

**Low** · feature-gap · `asset-class-unpriceable`

- **What's wrong:** The schema and the admin API accept equity, etf, crypto, forex, commodity and index, but pricing never reads `asset_class` and always calls Polygon stocks endpoints. ETFs work, because they trade as stocks; crypto, forex, commodity and index instruments cannot be priced, so claims and paper trades on them fail. The only UI create path hard-codes `equity`.
- **User impact:** None today: reachable only with a hand-made admin tRPC call.
- **Evidence:** [`packages/db/schema/instruments.ts:3-4`](../packages/db/schema/instruments.ts#L3-L4) · [`packages/api/routers/instruments.ts:19-39`](../packages/api/routers/instruments.ts#L19-L39) · [`packages/shared/src/polygon.ts:125`](../packages/shared/src/polygon.ts#L125) · [`packages/shared/src/polygon.ts:180`](../packages/shared/src/polygon.ts#L180)

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

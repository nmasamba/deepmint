# Known issues

The register of verified defects in Deepmint's code, from the coherence audit of **2026-10-05**. Every entry was checked against `main` at `cd63901` (after PRs #6–#9). It lists **100 open issues: 1 high, 28 medium and 71 low**. Docs drift that this docs update fixed is listed at the end, under [Fixed by this docs update](#fixed-by-this-docs-update).

## How this register was produced

1. **Code map.** Six readers each mapped one area (product, server interfaces, workers, ingestion, scoring and data model, infrastructure) and cited `path:line` for every fact. A critic pass spot-checked their citations and corrected their errors.
2. **Adversarial verification.** Each candidate issue from the map went to a verifier told to refute it from the code (and, where needed, the installed packages and the live site), to rewrite what it overstated and to re-judge its severity. None was refuted outright; 109 issues were confirmed or corrected, and 7 of them were docs drift that this update fixed. A final cross-document review of the docs found one more, [markout-holiday-exit-never-priced](#markout-holiday-exit-never-priced), and verified it against the code. The audit itself is summarised in [DEVLOG.md](DEVLOG.md).

Facts the code cannot show come from the maintainer. Production keys were last recorded on 2026-07-02 and could not be re-checked on 2026-10-05; see [EXTERNAL_KEYS.md](EXTERNAL_KEYS.md). Read the impacts with that context: the product is pre-launch, auth runs on a Clerk development instance, only the Mag-7 instruments are known to exist in production, and Upstash, Sentry, R2, SnapTrade and Resend were last recorded as unset.

**Instrument scope.** Mag-7 only is the deliberate scope until the core product has matured; expanding to more stocks is planned for after that (maintainer decision, 2026-10-05). Entries described as "latent while only the Mag 7 exist" are therefore not urgent. Fix them as part of that expansion, before any admin presses "Seed S&P 500 Top 50".

## Maintaining this file

- **When a PR fixes an issue,** delete its entry and update the counts table in that PR, and cite the issue id, such as `self-logged-claim-lookahead`, in the PR description. Record the fix in [CHANGELOG.md](CHANGELOG.md).
- **When a fix is partial,** rewrite the entry to describe what remains.
- **To add an issue,** verify it against the code first, give `path:line` evidence, and place it in its area in severity order.
- **Line numbers** in the evidence links are those of `cd63901`. After later edits, search for the named symbol.

## Most important

The one high-severity issue:

1. **[Self-logged claims book a price move the user could already see](#self-logged-claim-lookahead).** The entry price is the previous close, but the claim is timed at submission, so a Player can log a 1D call after seeing much of the day's move and bank it. Outcomes are append-only, so affected track records cannot be corrected.

## Counts by area

| Area | High | Medium | Low | Total |
|---|---|---|---|---|
| [Scoring and ranking](#area-scoring) | 1 | 3 | 7 | 11 |
| [Product (web app)](#area-product) | 0 | 9 | 19 | 28 |
| [API: tRPC, REST v1, MCP, auth](#area-api) | 0 | 3 | 12 | 15 |
| [Workers and schedules](#area-workers) | 0 | 4 | 6 | 10 |
| [Ingestion and extraction](#area-ingestion) | 0 | 2 | 11 | 13 |
| [Data model and shared code](#area-data) | 0 | 2 | 5 | 7 |
| [Infrastructure, config and tooling](#area-infra) | 0 | 5 | 10 | 15 |
| [Code comments](#area-docs) | 0 | 0 | 1 | 1 |
| **All** | **1** | **28** | **71** | **100** |

<a id="area-scoring"></a>

## Scoring and ranking

<a id="self-logged-claim-lookahead"></a>

### Self-logged claims book a price move the user could already see

**High** · data-integrity · `self-logged-claim-lookahead`

- **What's wrong:** `claims.submit` stores `getCurrentPrice()` as the entry price, and that is always the previous session's close. `created_at` is the submission time, and markout exits at the close on `created_at + horizon_days`. The scored return therefore includes whatever the user could already see at submission: the session so far, pre-market gaps and after-hours news. `target_hit` leaks the same way, because its bar window starts on the submission date. The leak is up to one session of the window: about half for a 1D claim, about 1/6 for 1W and about 1/22 for 1M. Live-ingested Guide claims without a rating date use the same price, but Guides do not choose when they are captured.
- **User impact:** Any Player can log 1D claims in the direction a stock has already moved and bank most of the return. That raises their hit rate, average return, Sharpe and EIV on a board with no minimum sample ([leaderboard-no-minimum-sample](#leaderboard-no-minimum-sample)). The 10 claims/hour limit is off without Upstash. Claims and outcomes are append-only, so contaminated records cannot be corrected. Exposure is small while the product is pre-launch, but the flaw is in the scoring core.
- **Evidence:** [`packages/api/routers/claims.ts:93-110`](../packages/api/routers/claims.ts#L93-L110) · [`packages/shared/src/polygon.ts:101-131`](../packages/shared/src/polygon.ts#L101-L131) · [`packages/db/schema/claims.ts:51`](../packages/db/schema/claims.ts#L51) · [`apps/worker/functions/markoutClaim.ts:77-89`](../apps/worker/functions/markoutClaim.ts#L77-L89) · [`apps/worker/functions/markoutClaim.ts:114-117`](../apps/worker/functions/markoutClaim.ts#L114-L117)

<a id="leaderboard-no-minimum-sample"></a>

### Leaderboards have no minimum sample or significance gate, and always sort descending

**Medium** · bug · `leaderboard-no-minimum-sample`

- **What's wrong:** `leaderboard.top`, `bestInCurrentConditions`, `byTicker` and `GET /api/v1/leaderboard` apply no outcome-count or significance filter, and all sort `scores.value DESC`. The scorer writes scores after one outcome. `hit_rate` and `avg_return_bps` have no sample adjustment, and Sharpe has no floor above n=2. EIV's `n/(n+20)` shrinkage is too weak: with the fixed Brier of 0.5 that every Player gets, 1/1 correct at +800 bps scores 0.8, above 120/200 at +150 bps (0.5). The z-test's `isSignificant` flag (p<0.05, n≥15) is discarded, and `checkAntiGaming` is never called. `calibration_brier` and `max_drawdown` are lower-is-better, yet tRPC, MCP and v1 return them worst first.
- **User impact:** Once outcomes exist, a Player whose first call lands shows 100% on the default board (Hit Rate, All), above long records, and the page shows no sample count. Latent while there is little scored data.
- **Evidence:** [`packages/api/routers/leaderboard.ts:28-42`](../packages/api/routers/leaderboard.ts#L28-L42) · [`packages/api/routers/leaderboard.ts:79`](../packages/api/routers/leaderboard.ts#L79) · [`apps/web/app/api/v1/leaderboard/route.ts:90`](../apps/web/app/api/v1/leaderboard/route.ts#L90) · [`apps/worker/functions/score.ts:80-83`](../apps/worker/functions/score.ts#L80-L83) · [`apps/worker/functions/score.ts:137-142`](../apps/worker/functions/score.ts#L137-L142) · [`apps/web/app/(app)/leaderboard/page.tsx:42`](../apps/web/app/%28app%29/leaderboard/page.tsx#L42)

<a id="eiv-not-regime-aware"></a>

### "Regime-aware" EIV is never regime-aware

**Medium** · feature-gap · `eiv-not-regime-aware`

- **What's wrong:** `score.ts` passes an empty regime history to `computeRegimeAwareEIV`. Every entity therefore gets the fallback with a fixed 0.4 penalty, and `eiv` always equals `eiv_overall`. The current regime only sets the `regime_tag` string. `leaderboard.bestInCurrentConditions` returns the `eiv` rows from the latest scoring date with a matching tag, with no age limit, and does not return that date.
- **User impact:** "Best in Current Conditions" is the plain overall-EIV top 5 from whichever scoring run last had that regime label, which may be weeks old. The 0.4 factor also shrinks every EIV, so the profile labels Strong Edge (≥60) and Moderate Edge (≥30) are harder to reach.
- **Evidence:** [`apps/worker/functions/score.ts:188-199`](../apps/worker/functions/score.ts#L188-L199) · [`apps/worker/functions/score.ts:228-239`](../apps/worker/functions/score.ts#L228-L239) · [`packages/scoring/src/eiv.ts:34`](../packages/scoring/src/eiv.ts#L34) · [`packages/scoring/src/eiv.ts:52`](../packages/scoring/src/eiv.ts#L52) · [`packages/api/routers/leaderboard.ts:181-196`](../packages/api/routers/leaderboard.ts#L181-L196)

<a id="player-metrics-annualise-claim-returns"></a>

### Player Sharpe and Calmar treat per-claim returns as daily returns

**Medium** · bug · `player-metrics-annualise-claim-returns`

- **What's wrong:** Player metrics use each active claim's `return_bps` as one "daily" return, whatever its horizon (1 to 365 days). Sharpe is mean/std × √252 with no risk-free rate. Calmar compounds claim returns in sequence even when the positions overlapped, then annualises by 252 / number of claims. CVaR and consistency use the same series.
- **User impact:** Player Sharpe and Calmar on profiles, the Sharpe board and the ticker page's Top Players have no financial meaning. Three 1-year claims of +10%, +12% and +8% give a Sharpe of about 79, and long-horizon claimants are inflated by up to √252 against 1-day claimants.
- **Evidence:** [`apps/worker/functions/score.ts:201-221`](../apps/worker/functions/score.ts#L201-L221) · [`packages/scoring/src/player.ts:12-18`](../packages/scoring/src/player.ts#L12-L18)

<a id="score-outcomes-unordered"></a>

### Drawdown, Calmar and consistency depend on arbitrary row order

**Low** · bug · `score-outcomes-unordered`

- **What's wrong:** The Player outcome query has no `ORDER BY`, yet `max_drawdown` (and so Calmar) and `consistency` (from 64 outcomes) treat the rows as a time series.
- **User impact:** Max Drawdown and Calmar on a Player profile can change between runs with no new data. The web leaderboard does not rank on these metrics.
- **Evidence:** [`apps/worker/functions/score.ts:66-78`](../apps/worker/functions/score.ts#L66-L78) · [`apps/worker/functions/score.ts:206-221`](../apps/worker/functions/score.ts#L206-L221) · [`packages/scoring/src/player.ts:63-75`](../packages/scoring/src/player.ts#L63-L75)

<a id="broker-trades-never-scored"></a>

### Broker-synced trades never affect scores or ranks

**Low** · feature-gap · `broker-trades-never-scored`

- **What's wrong:** Synced `player_trades` rows are read only by the two sync paths' duplicate checks. Linking a broker only sets `broker_link_status='verified'`, which gives a badge and a ×1.5 consensus weight on claims. The landing page says linking lets you "verify trades and climb the ranks", and Settings says "verified trades" get the multiplier.
- **User impact:** Dormant while SnapTrade is unconfigured (last recorded). Once enabled, linking changes no score or rank.
- **Evidence:** [`apps/worker/functions/score.ts:66-78`](../apps/worker/functions/score.ts#L66-L78) · [`packages/api/routers/broker.ts:171-196`](../packages/api/routers/broker.ts#L171-L196) · [`apps/web/components/landing/ChoosePath.tsx:118`](../apps/web/components/landing/ChoosePath.tsx#L118) · [`apps/web/components/settings/BrokerVerification.tsx:114-115`](../apps/web/components/settings/BrokerVerification.tsx#L114-L115)

<a id="influence-pipeline-flaws"></a>

### Influence tracking ignores claim status and entity type

**Low** · bug · `influence-pipeline-flaws`

- **What's wrong:** Only self-logged claims (always Players) emit `claims/created`, so `influence-track`'s Guide branch never runs. Its Player branch counts followed entities' claims of any status, including `pending_review` and `rejected`, and treats any followed entity, Players included, as the "guide". `follower_count` actually holds distinct acting Players over 30 days, and `player_trade_id` is never written.
- **User impact:** A Guide's "Events (30d)" and "Followers Acting" can include reactions to unreviewed or rejected claims. A Player whom other Players follow can appear in Trending Influencers, linking to a profile with no Influence tab.
- **Evidence:** [`apps/worker/functions/influence-track.ts:39`](../apps/worker/functions/influence-track.ts#L39) · [`apps/worker/functions/influence-track.ts:95-112`](../apps/worker/functions/influence-track.ts#L95-L112) · [`apps/worker/functions/influence-aggregate.ts:26`](../apps/worker/functions/influence-aggregate.ts#L26) · [`packages/api/routers/influence.ts:28-43`](../packages/api/routers/influence.ts#L28-L43)

<a id="consensus-includes-expired-claims"></a>

### Consensus counts claims whose horizon has passed

**Low** · bug · `consensus-includes-expired-claims`

- **What's wrong:** Consensus uses every active claim from the last 90 days and never checks whether its horizon has ended. `horizonDays` is passed in but unused. Live 180- and 365-day claims older than 90 days drop out.
- **User impact:** "Based on N active claims" counts expired calls at full weight. In the weighting, an expired 1-day call still carries about 41% of a fresh call's weight at 30 days.
- **Evidence:** [`apps/worker/functions/consensus-signal.ts:38-51`](../apps/worker/functions/consensus-signal.ts#L38-L51) · [`packages/scoring/src/consensus.ts:90-116`](../packages/scoring/src/consensus.ts#L90-L116) · [`apps/web/app/(app)/ticker/[symbol]/page.tsx:98`](../apps/web/app/%28app%29/ticker/%5Bsymbol%5D/page.tsx#L98)

<a id="neutral-claim-scoring"></a>

### Neutral claims feed raw price drift into returns

**Low** · bug · `neutral-claim-scoring`

- **What's wrong:** Markout negates the return only for shorts, so a neutral claim stores the raw price move as `return_bps`. That value feeds `avg_return_bps`, EIV and every Player risk metric. (The ±2% threshold differs from `computeSliceOutcome`, but that function is test-only.)
- **User impact:** Market drift is credited or charged to neutral calls: a wrong neutral call before a +10% move adds +1000 bps to the author's average return.
- **Evidence:** [`apps/worker/functions/markoutClaim.ts:102-108`](../apps/worker/functions/markoutClaim.ts#L102-L108) · [`apps/worker/functions/score.ts:139`](../apps/worker/functions/score.ts#L139) · [`apps/worker/functions/score.ts:202`](../apps/worker/functions/score.ts#L202)

<a id="target-precision-floor-inactive"></a>

### Target precision's minimum-move floor is never applied

**Low** · bug · `target-precision-floor-inactive`

- **What's wrong:** `targetPrecision` skips near-entry targets only when `minMoveFrac` is passed, and the scorer never passes it, so the floor is 0. `targetCoverage` counts targets that precision skips.
- **User impact:** A 1-cent target on a $100 stock scores 1.000 if the price moves the right way. Only the Guide Stats tab and the APIs show `target_precision`; EIV and the leaderboard UI do not use it.
- **Evidence:** [`packages/scoring/src/guide.ts:101-126`](../packages/scoring/src/guide.ts#L101-L126) · [`apps/worker/functions/score.ts:159-174`](../apps/worker/functions/score.ts#L159-L174)

<a id="dead-scoring-code"></a>

### Unused scoring functions and outcome columns

**Low** · dead-code · `dead-scoring-code`

- **What's wrong:** Seven exported functions are called only by tests: `detectInfluenceEvents`, `calmarRatio`, `maeAndMfe`, `computeSliceOutcome`, `continuousBrierScore`, `timeDecayedBrierScore` and `formatEIVWithContext`. `outcomes.brier_slices` is never written. `outcomes.target_hit` is computed, at one extra Polygon request per claim with a target, but no metric or UI uses it.
- **User impact:** Maintainers may assume continuous Brier and MAE/MFE feed live scores. Because the profile copies the EIV thresholds instead of calling `formatEIVWithContext`, a scored entity with EIV 0 shows "No data yet" rather than "No Edge".
- **Evidence:** [`packages/scoring/src/influence.ts:46`](../packages/scoring/src/influence.ts#L46) · [`packages/scoring/src/player.ts:23`](../packages/scoring/src/player.ts#L23) · [`packages/scoring/src/guide.ts:141-189`](../packages/scoring/src/guide.ts#L141-L189) · [`packages/scoring/src/eiv.ts:67`](../packages/scoring/src/eiv.ts#L67) · [`apps/web/components/EntityProfileTabs.tsx:104-112`](../apps/web/components/EntityProfileTabs.tsx#L104-L112) · [`apps/worker/functions/markoutClaim.ts:110-129`](../apps/worker/functions/markoutClaim.ts#L110-L129)

<a id="area-product"></a>

## Product (web app)

<a id="claim-outcomes-not-shown"></a>

### Claim cards never show a claim's result

**Medium** · bug · `claim-outcomes-not-shown`

- **What's wrong:** `ClaimCard` can render outcomes and a notes count, but its only callers, `ClaimsTimeline` and `SocialFeed`, pass neither, and `claims.list` and `social.feed` do not fetch them. After the horizon the card reads "Matured" whether or not an outcome exists. `claims.detail` returns outcomes, but no page calls it.
- **User impact:** Users can see an author's aggregate scores but not which individual calls were right. The only per-claim result is the `outcome_matured` notification, which goes to the claim's own entity (so ingested Guide claims notify nobody), is not sent for backfills, and is not a link.
- **Evidence:** [`apps/web/components/claims/ClaimCard.tsx:224-247`](../apps/web/components/claims/ClaimCard.tsx#L224-L247) · [`apps/web/components/claims/ClaimsTimeline.tsx:96-102`](../apps/web/components/claims/ClaimsTimeline.tsx#L96-L102) · [`apps/web/components/dashboard/SocialFeed.tsx:78-84`](../apps/web/components/dashboard/SocialFeed.tsx#L78-L84) · [`packages/api/routers/claims.ts:199-257`](../packages/api/routers/claims.ts#L199-L257)

<a id="leaderboard-regime-filter-empty"></a>

### Leaderboard regime filter always returns an empty board

**Medium** · bug · `leaderboard-regime-filter-empty`

- **What's wrong:** The regime chips filter on `scores.regime_tag`, but only metric `eiv` is written with a tag. Every metric the page offers is written with a null tag.
- **User impact:** Choosing Bull, Bear, High Vol, Low Vol or Rotation empties the table, which then says "No scores yet. AI will rank analysts once predictions are resolved", although scores exist. "All Regimes" and "Best in Current Conditions" work.
- **Evidence:** [`apps/web/app/(app)/leaderboard/page.tsx:22-29`](../apps/web/app/%28app%29/leaderboard/page.tsx#L22-L29) · [`apps/web/app/(app)/leaderboard/page.tsx:157-160`](../apps/web/app/%28app%29/leaderboard/page.tsx#L157-L160) · [`packages/api/routers/leaderboard.ts:35-37`](../packages/api/routers/leaderboard.ts#L35-L37) · [`apps/worker/functions/score.ts:107-112`](../apps/worker/functions/score.ts#L107-L112) · [`apps/worker/functions/score.ts:198`](../apps/worker/functions/score.ts#L198)

<a id="most-influential-tab-empty"></a>

### "Most Influential" leaderboard tab is always empty

**Medium** · bug · `most-influential-tab-empty`

- **What's wrong:** The chip asks `leaderboard.top` for metric `influence_events_30d` in `scores`. That value is a column of `influence_scores`, written only by `influence-aggregate`.
- **User impact:** The tab always shows the empty state, implying rankings will appear later. The same data does show in the dashboard's Trending Influencers.
- **Evidence:** [`apps/web/app/(app)/leaderboard/page.tsx:19`](../apps/web/app/%28app%29/leaderboard/page.tsx#L19) · [`packages/api/routers/leaderboard.ts:47-59`](../packages/api/routers/leaderboard.ts#L47-L59) · [`packages/db/schema/influence.ts:25`](../packages/db/schema/influence.ts#L25) · [`apps/worker/functions/influence-aggregate.ts:61-64`](../apps/worker/functions/influence-aggregate.ts#L61-L64)

<a id="guide-signup-path-missing"></a>

### "Sign Up as a Guide" creates a Player; there is no way to become or claim a Guide

**Medium** · feature-gap · `guide-signup-path-missing`

- **What's wrong:** Both landing-page buttons, "Sign Up as a Guide" and "Sign Up as a Player", go to plain `/sign-up`, and every new user is created as type `player`. No code changes `entities.type`, and the profile-claiming flow mentioned in a resolver comment does not exist.
- **User impact:** An analyst who signs up as a Guide becomes a Player: scored with Player metrics (no Brier, z-score or target precision), listed with Players, without the ×1.2 Guide consensus weight or an Influence tab. An analyst already ingested as a Guide ends up with two unlinked entities.
- **Evidence:** [`apps/web/components/landing/ChoosePath.tsx:69-75`](../apps/web/components/landing/ChoosePath.tsx#L69-L75) · [`apps/web/components/landing/ChoosePath.tsx:123-129`](../apps/web/components/landing/ChoosePath.tsx#L123-L129) · [`packages/db/queries/ensureEntityForClerkUser.ts:58`](../packages/db/queries/ensureEntityForClerkUser.ts#L58) · [`packages/ingestion/src/sources/resolver.ts:34-35`](../packages/ingestion/src/sources/resolver.ts#L34-L35)

<a id="signin-wall-vs-anonymous-trpc"></a>

### Pages are behind sign-in, but their data is readable anonymously

**Medium** · feature-gap · `signin-wall-vs-anonymous-trpc`

- **What's wrong:** Only `/`, `/sign-in` and `/sign-up` are public pages. The leaderboard, profiles, tickers and Learn call `auth.protect()`, so the hero's "See Who's Leading" and the footer's Leaderboard and Learn links land on sign-in. `/api/trpc` is public, and the procedures those pages read (`leaderboard.top`, `claims.list`, `scores.byEntity`, `ticker.overview` and more) are `publicProcedure`, as are `entity.bySlug` and `consensus.*`.
- **User impact:** Visitors cannot see the leaderboard, and a Guide or Player cannot share a track-record profile with anyone without an account. The wall costs conversions and sharing without keeping any data private.
- **Evidence:** [`apps/web/middleware.ts:4-21`](../apps/web/middleware.ts#L4-L21) · [`apps/web/middleware.ts:31-33`](../apps/web/middleware.ts#L31-L33) · [`apps/web/components/landing/HeroSection.tsx:26-39`](../apps/web/components/landing/HeroSection.tsx#L26-L39) · [`apps/web/components/landing/Footer.tsx:22-30`](../apps/web/components/landing/Footer.tsx#L22-L30) · [`packages/api/trpc.ts:32`](../packages/api/trpc.ts#L32)

<a id="ai-scoring-copy-misleading"></a>

### Product copy promises AI scoring and scored paper trades that do not exist

**Medium** · feature-gap · `ai-scoring-copy-misleading`

- **What's wrong:** Site metadata, the landing page, the leaderboard empty state, Learn and Settings say AI grades, scores, ranks or benchmarks calls. The only model is the extraction LLM; scoring, regime detection and consensus are fixed formulas. The paper portfolio page says "AI tracks and scores your performance", but paper trades feed no score. No feature compares a user with "Wall Street consensus". The digest Settings calls "AI-generated" is a plain template.
- **User impact:** Every visitor and search result is told something false about how the product works, in a product sold on trustworthy track records.
- **Evidence:** [`apps/web/app/layout.tsx:18-42`](../apps/web/app/layout.tsx#L18-L42) · [`apps/web/components/landing/HowItWorks.tsx:12-20`](../apps/web/components/landing/HowItWorks.tsx#L12-L20) · [`apps/web/components/landing/ChoosePath.tsx:58`](../apps/web/components/landing/ChoosePath.tsx#L58) · [`apps/web/app/(app)/paper-portfolio/page.tsx:19`](../apps/web/app/%28app%29/paper-portfolio/page.tsx#L19) · [`apps/web/app/(app)/settings/page.tsx:51`](../apps/web/app/%28app%29/settings/page.tsx#L51) · [`apps/worker/functions/score.ts:135-239`](../apps/worker/functions/score.ts#L135-L239)

<a id="profile-edit-and-clerk-sync"></a>

### Users cannot edit their profile, and Clerk changes never sync

**Medium** · feature-gap · `profile-edit-and-clerk-sync`

- **What's wrong:** `entity.update` (display name, bio, style tags) exists but no UI calls it. The Clerk webhook handles only `user.created`, an existing entity is never refreshed from Clerk, and nothing ever sets `entities.deleted_at`.
- **User impact:** A user's public name and avatar are fixed at creation, even after they change them in Clerk's account panel, and bio and style tags cannot be set. Deleting a Clerk account leaves the public profile, claims and leaderboard rows in place.
- **Evidence:** [`packages/api/routers/entities.ts:40-70`](../packages/api/routers/entities.ts#L40-L70) · [`apps/web/app/api/webhooks/clerk/route.ts:60`](../apps/web/app/api/webhooks/clerk/route.ts#L60) · [`packages/db/queries/ensureEntityForClerkUser.ts:38-39`](../packages/db/queries/ensureEntityForClerkUser.ts#L38-L39) · [`apps/web/components/layout/Topbar.tsx:61`](../apps/web/components/layout/Topbar.tsx#L61)

<a id="claim-provenance-not-visible"></a>

### The "audited" track record shows users no evidence

**Medium** · feature-gap · `claim-provenance-not-visible`

- **What's wrong:** Claim lists do not join `events`, and `ClaimCard` renders no source URL, publisher, capture time or verified quote. The JSON already carries `sourceKind`, rating fields, `analystName`, `horizonStated` and `sourceExcerpt`. Only the admin review page shows the quote and raw text. Nothing reads `audit_roots`, and no Merkle proof is ever generated.
- **User impact:** Users cannot trace a call to its source or check it against an audit root, so the "audited performance" and "verified track records" copy has nothing behind it.
- **Evidence:** [`apps/web/components/claims/ClaimCard.tsx:28-56`](../apps/web/components/claims/ClaimCard.tsx#L28-L56) · [`packages/api/routers/claims.ts:166-187`](../packages/api/routers/claims.ts#L166-L187) · [`apps/web/app/(app)/admin/review/page.tsx:121-158`](../apps/web/app/%28app%29/admin/review/page.tsx#L121-L158) · [`apps/worker/functions/audit.ts:56-62`](../apps/worker/functions/audit.ts#L56-L62)

<a id="price-lookups-uncached-serial"></a>

### Price lookups are uncached and serial on user-facing paths

**Medium** · bug · `price-lookups-uncached-serial`

- **What's wrong:** Prices are never cached (the cache-key helpers are dead code). `paper.portfolioPerformance` and `signalSimulate.comparison` await one throttled lookup per open position, one after another, and mirrored portfolios never close positions. The ticker page's server render awaits the price with no catch.
- **User impact:** A portfolio with N open positions shows skeletons for about 12.5 s × (N−1), five positions taking about 50 s. If Polygon fails, the ticker page shows the generic error screen instead of degrading.
- **Evidence:** [`packages/api/routers/paper.ts:349-359`](../packages/api/routers/paper.ts#L349-L359) · [`packages/api/routers/signalSimulate.ts:265-278`](../packages/api/routers/signalSimulate.ts#L265-L278) · [`packages/shared/src/polygonCache.ts:80-92`](../packages/shared/src/polygonCache.ts#L80-L92) · [`apps/web/app/(app)/ticker/[symbol]/page.tsx:44-53`](../apps/web/app/%28app%29/ticker/%5Bsymbol%5D/page.tsx#L44-L53)

<a id="instrument-universe-inconsistent"></a>

### Each surface uses a different instrument universe

**Low** · feature-gap · `instrument-universe-inconsistent`

- **What's wrong:** Ingestion and ticker pages accept only the 7 Mag-7 tickers. Claim submission, search and the consensus worker accept any active instrument. Paper trades accept any instrument, even an inactive one. MCP tool descriptions say "Mag-7 ticker" but resolve any instrument.
- **User impact:** Latent while only the Mag 7 exist, as in production since 2026-08-11, and Mag-7 only is the deliberate scope for now. Once an admin adds instruments (for example with the S&P button), users can claim and trade tickers whose pages say "Coming soon", and ingestion never produces Guide claims for them. Make every surface agree before expanding.
- **Evidence:** [`packages/ingestion/src/extractor.ts:461-472`](../packages/ingestion/src/extractor.ts#L461-L472) · [`apps/web/app/(app)/ticker/[symbol]/page.tsx:18-30`](../apps/web/app/%28app%29/ticker/%5Bsymbol%5D/page.tsx#L18-L30) · [`packages/api/routers/claims.ts:73-91`](../packages/api/routers/claims.ts#L73-L91) · [`packages/api/routers/paper.ts:138-150`](../packages/api/routers/paper.ts#L138-L150) · [`apps/web/app/api/mcp/route.ts:66-67`](../apps/web/app/api/mcp/route.ts#L66-L67)

<a id="ticker-top-lists-global"></a>

### Ticker pages' Top Guides and Top Players ignore the ticker

**Low** · bug · `ticker-top-lists-global`

- **What's wrong:** `ticker.overview` ranks Guides by EIV and Players by Sharpe with no instrument filter; `scores` has no instrument column. `leaderboard.byTicker` ignores its `ticker` argument (nothing calls it).
- **User impact:** All seven ticker pages show the same global lists, implying specialists on that stock.
- **Evidence:** [`packages/api/routers/ticker.ts:54-119`](../packages/api/routers/ticker.ts#L54-L119) · [`packages/db/schema/scores.ts:4-16`](../packages/db/schema/scores.ts#L4-L16) · [`packages/api/routers/leaderboard.ts:104-146`](../packages/api/routers/leaderboard.ts#L104-L146)

<a id="ticker-page-dead-fragile-wiring"></a>

### Ticker page panels that never render, and a wasteful overview query

**Low** · bug · `ticker-page-dead-fragile-wiring`

- **What's wrong:** The consensus worker never writes `avg_target_price_cents` or `target_dispersion_bps`, so the Avg Target and Target Dispersion blocks never render, and REST v1 always returns them null. `ticker.overview` also fetches a price and claim stats the client ignores, so each page view makes two uncached price lookups. The client ignores loading and error states.
- **User impact:** No ticker page shows target data. Each view spends at least 2 requests of the 5 req/min Polygon plan. Top Guides and Top Players say "No data yet." while loading or after a failed second lookup, and a full Polygon outage errors the whole page.
- **Evidence:** [`apps/web/components/ticker/ConsensusBreakdown.tsx:136-172`](../apps/web/components/ticker/ConsensusBreakdown.tsx#L136-L172) · [`apps/worker/functions/consensus-signal.ts:116-128`](../apps/worker/functions/consensus-signal.ts#L116-L128) · [`apps/web/app/(app)/ticker/[symbol]/TickerClientSection.tsx:31-64`](../apps/web/app/%28app%29/ticker/%5Bsymbol%5D/TickerClientSection.tsx#L31-L64) · [`packages/api/routers/ticker.ts:40-52`](../packages/api/routers/ticker.ts#L40-L52) · [`apps/web/app/(app)/ticker/[symbol]/page.tsx:44-53`](../apps/web/app/%28app%29/ticker/%5Bsymbol%5D/page.tsx#L44-L53)

<a id="current-price-is-previous-close"></a>

### "Current price" is the previous session's close

**Low** · bug · `current-price-is-previous-close`

- **What's wrong:** `getCurrentPrice` returns the previous close by design. The ticker page shows it with no label or date, paper trades open, close and mark to it, and Learn says paper trades execute "at the current market price". (Its effect on claim entry prices is [self-logged-claim-lookahead](#self-logged-claim-lookahead).)
- **User impact:** The header price can be a session old but reads as live. Paper P&L is off and can be gamed by trading after an intraday move, but only in the user's own sandbox.
- **Evidence:** [`packages/shared/src/polygon.ts:101-131`](../packages/shared/src/polygon.ts#L101-L131) · [`apps/web/app/(app)/ticker/[symbol]/page.tsx:93-97`](../apps/web/app/%28app%29/ticker/%5Bsymbol%5D/page.tsx#L93-L97) · [`packages/api/routers/paper.ts:153`](../packages/api/routers/paper.ts#L153) · [`packages/api/routers/paper.ts:350`](../packages/api/routers/paper.ts#L350) · [`apps/web/lib/learnModules.ts:273`](../apps/web/lib/learnModules.ts#L273)

<a id="mirror-portfolio-behaviour"></a>

### Mirror portfolios buy on neutral calls, never close, and break the portfolio cap

**Low** · bug · `mirror-portfolio-behaviour`

- **What's wrong:** Neutral claims are mirrored as buys. Mirrored trades are never closed at the claim's horizon; after about 100 open trades the 1% allocation no longer fits and new signals are skipped silently. `signalSimulate.create` skips the 5-portfolio cap but counts toward it, and no procedure deletes a portfolio.
- **User impact:** Mirror P&L does not track the mirrored calls. A user who mirrors five entities can never create a manual paper portfolio again, and the create form fails with no message.
- **Evidence:** [`apps/worker/functions/signal-simulate.ts:62`](../apps/worker/functions/signal-simulate.ts#L62) · [`apps/worker/functions/signal-simulate.ts:86-104`](../apps/worker/functions/signal-simulate.ts#L86-L104) · [`packages/api/routers/paper.ts:29-40`](../packages/api/routers/paper.ts#L29-L40) · [`packages/api/routers/signalSimulate.ts:65-73`](../packages/api/routers/signalSimulate.ts#L65-L73)

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

<a id="search-slash-hint"></a>

### Search box shows a "/" shortcut that does nothing

**Low** · bug · `search-slash-hint`

- **What's wrong:** The top-bar instrument search shows a `/` key hint at desktop widths, but no code listens for the key.
- **User impact:** Cosmetic: pressing `/` does nothing.
- **Evidence:** [`apps/web/components/InstrumentSearch.tsx:111-120`](../apps/web/components/InstrumentSearch.tsx#L111-L120)

<a id="follow-mirror-own-profile"></a>

### Follow and Mirror buttons appear on your own profile and fail silently

**Low** · bug · `follow-mirror-own-profile`

- **What's wrong:** Profile pages never pass `hideFollow`, so Follow and Mirror Signals render on your own profile. The server rejects both, and rejects mirroring an entity you already mirror. The buttons have no error handler, so the message never shows.
- **User impact:** Clicks appear to do nothing. No data is affected.
- **Evidence:** [`apps/web/components/EntityProfileHeader.tsx:124-129`](../apps/web/components/EntityProfileHeader.tsx#L124-L129) · [`packages/api/routers/social.ts:35-40`](../packages/api/routers/social.ts#L35-L40) · [`packages/api/routers/signalSimulate.ts:24-62`](../packages/api/routers/signalSimulate.ts#L24-L62) · [`apps/web/components/FollowButton.tsx:18-30`](../apps/web/components/FollowButton.tsx#L18-L30)

<a id="admin-pages-not-gated"></a>

### Admin pages render for any signed-in user with a false empty state

**Low** · bug · `admin-pages-not-gated`

- **What's wrong:** `/admin/review`, `/admin/instruments` and `/admin/api-keys` are client pages with no role check. Their data calls return FORBIDDEN, but the pages ignore the error and show "No claims pending review", "No instruments yet" or "No API keys yet", with action buttons enabled.
- **User impact:** A non-admin who opens an admin URL sees a misleading empty admin screen. No data leaks and no action succeeds.
- **Evidence:** [`apps/web/app/(app)/admin/review/page.tsx:13`](../apps/web/app/%28app%29/admin/review/page.tsx#L13) · [`apps/web/app/(app)/admin/instruments/page.tsx:18-19`](../apps/web/app/%28app%29/admin/instruments/page.tsx#L18-L19) · [`apps/web/app/(app)/admin/api-keys/page.tsx:44`](../apps/web/app/%28app%29/admin/api-keys/page.tsx#L44) · [`packages/api/trpc.ts:50-62`](../packages/api/trpc.ts#L50-L62)

<a id="notifications-dead-ends"></a>

### Notifications are dead ends, and one preference does nothing

**Low** · feature-gap · `notifications-dead-ends`

- **What's wrong:** Clicking a notification only marks it read; the stored `claimId`, ticker and rank metadata are never used to link anywhere. The "New claim from followed" switch saves a preference for a notification type nothing sends. Outcome, rank-change and new-follower notifications are also written for ingested Guides, which have no user.
- **User impact:** No notification leads to the claim, ticker or follower it describes, and one of the five notification switches in Settings changes nothing.
- **Evidence:** [`apps/web/components/notifications/NotificationItem.tsx:40-50`](../apps/web/components/notifications/NotificationItem.tsx#L40-L50) · [`packages/db/queries/createNotification.ts:9`](../packages/db/queries/createNotification.ts#L9) · [`apps/worker/functions/markout.ts:111-117`](../apps/worker/functions/markout.ts#L111-L117)

<a id="learn-content-drift"></a>

### Learn modules contradict how scoring works

**Low** · docs-drift · `learn-content-drift`

- **What's wrong:** Learn defines Sharpe as return above the risk-free rate (none is subtracted) and implies Player Sharpe and drawdown come from a portfolio (they come from claim outcomes). It says Guides "submit confidence levels" (Guides never submit; their confidence is extracted by the LLM). Its calibration module implies a user's stated confidence is graded, but Players never get a calibration score: confidence only scales a claim's consensus weight (0.75–1.25×). It also says paper trades fill "at the current market price".
- **User impact:** Users form a wrong model of their score, especially around the confidence slider.
- **Evidence:** [`apps/web/lib/learnModules.ts:48`](../apps/web/lib/learnModules.ts#L48) · [`apps/web/lib/learnModules.ts:210`](../apps/web/lib/learnModules.ts#L210) · [`apps/web/lib/learnModules.ts:273`](../apps/web/lib/learnModules.ts#L273) · [`packages/scoring/src/player.ts:12-18`](../packages/scoring/src/player.ts#L12-L18) · [`apps/worker/functions/score.ts:200-239`](../apps/worker/functions/score.ts#L200-L239)

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

<a id="claim-notes-no-ui"></a>

### Claim notes can only be added through MCP, and are never shown

**Low** · feature-gap · `claim-notes-no-ui`

- **What's wrong:** `claims.addNote` is called only by the MCP `add_note` tool. `ClaimCard`'s notes count is never passed, and no page shows notes.
- **User impact:** Players cannot annotate or correct their own claims, though notes are the only correction mechanism for append-only claims.
- **Evidence:** [`packages/api/routers/claims.ts:259-300`](../packages/api/routers/claims.ts#L259-L300) · [`apps/web/components/claims/ClaimCard.tsx:249`](../apps/web/components/claims/ClaimCard.tsx#L249) · [`apps/web/app/api/mcp/route.ts:167-203`](../apps/web/app/api/mcp/route.ts#L167-L203)

<a id="pwa-assets-behind-auth"></a>

### PWA manifest returns 404 and the offline page can never be served

**Low** · bug · `pwa-assets-behind-auth`

- **What's wrong:** The middleware matcher skips `.js` but not `.json`, so `/manifest.json` hits `auth.protect()`. The manifest link sends no cookies, so it returns a 404 for everyone. `/offline` is never precached, so the service worker's fallback cannot work. Precaching the 404ing manifest makes the service worker install fail for signed-out visitors.
- **User impact:** No install-to-home-screen prompt in Chrome, and offline navigations show the browser's error page. iOS Add to Home Screen still works.
- **Evidence:** [`apps/web/middleware.ts:39`](../apps/web/middleware.ts#L39) · [`apps/web/app/layout.tsx:24`](../apps/web/app/layout.tsx#L24) · [`apps/web/app/sw.ts:19-28`](../apps/web/app/sw.ts#L19-L28)

<a id="area-api"></a>

## API: tRPC, REST v1, MCP, auth

<a id="consensus-mag7-returns-all-instruments"></a>

### Dashboard "AI Consensus — Mag 7" grid lists every active instrument

**Medium** · bug · `consensus-mag7-returns-all-instruments`

- **What's wrong:** `consensus.mag7` selects every active instrument, with no ticker filter or ordering, and runs one sequential query per instrument. Each tile links to `/ticker/{ticker}`. A correctly filtered `instruments.mag7` exists, but nothing calls it and its response shape differs.
- **User impact:** Latent while only the Mag 7 exist. After an admin presses "Seed S&P 500 Top 50", every dashboard shows 57 tiles in no set order under the Mag 7 heading, 50 of them leading to "Coming soon", and each load runs 57 sequential queries.
- **Evidence:** [`packages/api/routers/consensus.ts:26-49`](../packages/api/routers/consensus.ts#L26-L49) · [`apps/web/components/dashboard/Mag7Grid.tsx:31-34`](../apps/web/components/dashboard/Mag7Grid.tsx#L31-L34) · [`apps/web/app/(app)/dashboard/page.tsx:38-41`](../apps/web/app/%28app%29/dashboard/page.tsx#L38-L41) · [`packages/api/routers/instruments.ts:193-233`](../packages/api/routers/instruments.ts#L193-L233)

<a id="mcp-acts-as-admin"></a>

### MCP write tools act as the minting admin's own Player

**Medium** · feature-gap · `mcp-acts-as-admin`

- **What's wrong:** `apiKeys.create` always stores `created_by` as the minting admin's entity, and the MCP `submit_claim` and `add_note` tools act as that entity. Keys cannot name another owner, and there is no agent entity type.
- **User impact:** Nothing is affected until a `claims:write` key exists (production had 0 API keys on 2026-08-03). After that, every agent claim lands permanently on the admin's own Player record and scores, agents can add notes to the admin's own claims, and agents cannot be told apart. With Upstash they would also share the admin's 10 claims/hour.
- **Evidence:** [`packages/api/routers/apiKeys.ts:17-43`](../packages/api/routers/apiKeys.ts#L17-L43) · [`apps/web/app/api/mcp/route.ts:139-145`](../apps/web/app/api/mcp/route.ts#L139-L145) · [`apps/web/app/api/mcp/route.ts:220`](../apps/web/app/api/mcp/route.ts#L220) · [`packages/api/routers/claims.ts:282`](../packages/api/routers/claims.ts#L282)

<a id="paper-short-equity-overstated"></a>

### Paper and Signal Simulate equity double-counts open shorts

**Medium** · bug · `paper-short-equity-overstated`

- **What's wrong:** Opening a short adds the sale proceeds to cash, and equity then adds `currentPrice × qty` for every open trade whatever its side. Each open short overstates equity by 2 × price × quantity, in paper portfolios and in the Signal Simulate comparison.
- **User impact:** Total Equity, Total Return and the equity curve are too high while a short is open: a flat $1,000 short on $100,000 shows +2.00%. Each open mirrored short adds about +2% to the mirror's return. Simulated money only.
- **Evidence:** [`packages/api/routers/paper.ts:349-368`](../packages/api/routers/paper.ts#L349-L368) · [`packages/api/routers/paper.ts:417-419`](../packages/api/routers/paper.ts#L417-L419) · [`packages/api/routers/signalSimulate.ts:277-297`](../packages/api/routers/signalSimulate.ts#L277-L297)

<a id="entity-endpoints-leak-private-fields"></a>

### Public entity endpoints return internal columns

**Low** · security · `entity-endpoints-leak-private-fields`

- **What's wrong:** Public `entity.bySlug` and `entity.search` return whole `entities` rows, including `clerk_user_id`, `snaptrade_user_id`, `is_allowlisted` and `deleted_at`, to signed-out callers. `search` does not escape `%` or `_`, so `q=%` lists every entity, 50 per call.
- **User impact:** Anyone can list every user's Clerk user ID and timestamps. Clerk IDs are not credentials, so this is a data-minimisation gap, but any column added later leaks automatically.
- **Evidence:** [`packages/api/routers/entities.ts:20-27`](../packages/api/routers/entities.ts#L20-L27) · [`packages/api/routers/entities.ts:73-88`](../packages/api/routers/entities.ts#L73-L88) · [`apps/web/middleware.ts:14`](../apps/web/middleware.ts#L14)

<a id="claims-detail-any-status"></a>

### `claims.detail` is public and returns pending and rejected claims

**Low** · security · `claims-detail-any-status`

- **What's wrong:** `claims.detail` looks a claim up by id alone and returns it in any status, with outcomes and notes. Every other public claim read filters to `active`.
- **User impact:** Small: ids are random UUIDs, and no public endpoint returns the id of a non-active claim.
- **Evidence:** [`packages/api/routers/claims.ts:199-224`](../packages/api/routers/claims.ts#L199-L224) · [`packages/api/routers/claims.ts:146`](../packages/api/routers/claims.ts#L146)

<a id="broker-verified-means-any-account"></a>

### Broker "verified" only proves that some brokerage account is linked

**Low** · data-integrity · `broker-verified-means-any-account`

- **What's wrong:** `completeLink` sets `broker_link_status='verified'` once SnapTrade lists any account, keeps only `accounts[0]`, and checks no trades. A later sync failure sets only `broker_links.sync_status='error'`, so the flag is never withdrawn.
- **User impact:** Dormant while SnapTrade is unconfigured (last recorded). Once enabled, linking any account, even an empty one, earns a public Verified badge and ×1.5 consensus weight on all claims from the last 90 days, and both survive a broken link. Fix before adding SnapTrade keys.
- **Evidence:** [`packages/api/routers/broker.ts:170-198`](../packages/api/routers/broker.ts#L170-L198) · [`packages/api/routers/broker.ts:384-392`](../packages/api/routers/broker.ts#L384-L392) · [`packages/scoring/src/consensus.ts:97`](../packages/scoring/src/consensus.ts#L97) · [`apps/worker/functions/consensus-signal.ts:99`](../apps/worker/functions/consensus-signal.ts#L99)

<a id="snaptrade-secret-plaintext"></a>

### SnapTrade user secrets are stored in plaintext

**Low** · security · `snaptrade-secret-plaintext`

- **What's wrong:** `initLink` stores the SnapTrade `userSecret` unencrypted in `broker_links.metadata`, and `broker-sync` returns whole rows from a step, so Inngest run state keeps a copy.
- **User impact:** None today: no secrets are stored. Once enabled, database or Inngest read access exposes them; using them also needs the partner consumer key, which lives in Vercel env.
- **Evidence:** [`packages/api/routers/broker.ts:110-127`](../packages/api/routers/broker.ts#L110-L127) · [`apps/worker/functions/broker-sync.ts:36-46`](../apps/worker/functions/broker-sync.ts#L36-L46)

<a id="paper-short-cash-bypass"></a>

### Paper "Sell" opens shorts of any size

**Low** · bug · `paper-short-cash-bypass`

- **What's wrong:** `addTrade` checks cash only for buys, so a sell opens a short of any size, and its proceeds then fund more buys. `createPortfolio` accepts any starting balance (the UI does not offer one). Signal Simulate sizes trades at 1% and is not affected.
- **User impact:** A user can inflate their own paper equity without limit, and pressing Sell to close a long opens a short instead. Private to that user; feeds no score.
- **Evidence:** [`packages/api/routers/paper.ts:158-170`](../packages/api/routers/paper.ts#L158-L170) · [`packages/api/routers/paper.ts:20-26`](../packages/api/routers/paper.ts#L20-L26) · [`apps/worker/functions/signal-simulate.ts:78-104`](../apps/worker/functions/signal-simulate.ts#L78-L104)

<a id="identity-derivation-inconsistent"></a>

### Display names and slugs depend on which path created the entity

**Low** · bug · `identity-derivation-inconsistent`

- **What's wrong:** The Clerk webhook names a user from first and last name, then "User"; the tRPC self-heal also tries the username. Players are slugged by `@deepmint/shared` `slugify` (deletes punctuation) and Guides by the resolver's own (turns punctuation into hyphens), in one shared slug namespace.
- **User impact:** Mostly cosmetic: "J.P. Morgan" becomes `jp-morgan` as a Player and `j-p-morgan` as a Guide. The collision risk is [guide-resolver-matches-user-slug](#guide-resolver-matches-user-slug).
- **Evidence:** [`apps/web/app/api/webhooks/clerk/route.ts:61-64`](../apps/web/app/api/webhooks/clerk/route.ts#L61-L64) · [`apps/web/app/api/trpc/[trpc]/route.ts:38-41`](../apps/web/app/api/trpc/%5Btrpc%5D/route.ts#L38-L41) · [`packages/shared/src/utils.ts:1-8`](../packages/shared/src/utils.ts#L1-L8) · [`packages/ingestion/src/sources/resolver.ts:7-15`](../packages/ingestion/src/sources/resolver.ts#L7-L15)

<a id="v1-leaderboard-missing-fixes"></a>

### REST `/api/v1/leaderboard` lacks the tRPC leaderboard's fixes

**Low** · bug · `v1-leaderboard-missing-fixes`

- **What's wrong:** With no `horizon` given, the route does not default to `all`, so `metric=hit_rate` lists a Guide up to 7 times (pooled plus one row per outcome horizon). Its latest-date probe ignores the horizon, so a horizon with no rows on the newest date returns an empty board. It has no `deleted_at` filter (latent: nothing sets it).
- **User impact:** API callers get duplicate rows and a ranking that differs from the web and MCP boards. Keys are admin-issued and no external consumer is known.
- **Evidence:** [`apps/web/app/api/v1/leaderboard/route.ts:46-65`](../apps/web/app/api/v1/leaderboard/route.ts#L46-L65) · [`packages/api/routers/leaderboard.ts:21`](../packages/api/routers/leaderboard.ts#L21) · [`packages/api/routers/leaderboard.ts:47-57`](../packages/api/routers/leaderboard.ts#L47-L57)

<a id="mcp-tool-contract-gaps"></a>

### MCP tools return less than they promise

**Low** · bug · `mcp-tool-contract-gaps`

- **What's wrong:** `get_entity_track_record` returns only the raw entities row, with no claims, outcomes or scores. Opening a session requires `consensus:read`, and read tools check no further scope. `submit_claim` has no `rationaleTags`. Tool descriptions say "Mag-7 ticker" but any instrument resolves.
- **User impact:** An agent asking for a track record gets no claims, outcomes or scores, and tool descriptions promise Mag-7 while any instrument resolves.
- **Evidence:** [`apps/web/app/api/mcp/route.ts:36-43`](../apps/web/app/api/mcp/route.ts#L36-L43) · [`apps/web/app/api/mcp/route.ts:93-98`](../apps/web/app/api/mcp/route.ts#L93-L98) · [`apps/web/app/api/mcp/route.ts:113-123`](../apps/web/app/api/mcp/route.ts#L113-L123) · [`apps/web/app/api/mcp/route.ts:214`](../apps/web/app/api/mcp/route.ts#L214)

<a id="openapi-spec-drift"></a>

### The OpenAPI spec disagrees with what the v1 API returns

**Low** · docs-drift · `openapi-spec-drift`

- **What's wrong:** The spec's leaderboard `horizon` enum offers `12m`, which is never written, and omits `1y`; the route does not validate horizon, so `12m` returns an empty 200. The spec documents no 403 and no per-endpoint scope, omits `assetClass` from the consensus instrument object, uses OpenAPI 3.0's `nullable` under `openapi: 3.1.0`, and gives `https://deepmint.app` as the contact URL.
- **User impact:** Clients built from the spec get empty boards, undocumented 403s and dropped or mistyped fields.
- **Evidence:** [`apps/web/app/api/v1/openapi.json/route.ts:31`](../apps/web/app/api/v1/openapi.json/route.ts#L31) · [`apps/web/app/api/v1/openapi.json/route.ts:121-127`](../apps/web/app/api/v1/openapi.json/route.ts#L121-L127) · [`apps/web/app/api/v1/openapi.json/route.ts:232-239`](../apps/web/app/api/v1/openapi.json/route.ts#L232-L239) · [`apps/web/app/api/v1/lib/auth.ts:88-98`](../apps/web/app/api/v1/lib/auth.ts#L88-L98)

<a id="clerk-webhook-fragile"></a>

### Clerk webhook verifies a re-serialised body

**Low** · bug · `clerk-webhook-fragile`

- **What's wrong:** The webhook verifies `JSON.stringify(await req.json())` instead of the raw request body. Payloads whose bytes change when re-serialised (an escaped `/`, an escaped `&`, `1.0`) fail with 400 "Invalid signature".
- **User impact:** None today: maintainer notes (2026-08-11, unverified) say no production webhook endpoint is registered, and the tRPC self-heal creates entities either way. Once registered, some sign-ups would get 400s and Svix retries.
- **Evidence:** [`apps/web/app/api/webhooks/clerk/route.ts:42-54`](../apps/web/app/api/webhooks/clerk/route.ts#L42-L54)

<a id="clerk-getuser-per-request"></a>

### Every non-admin request calls Clerk's backend `getUser`

**Low** · bug · `clerk-getuser-per-request`

- **What's wrong:** For signed-in users whose session claim does not say admin, which is every non-admin, the tRPC context and the `(app)` layout both call `users.getUser` to read the role: once per tRPC HTTP request and once per full page render.
- **User impact:** Each such request waits on a Clerk round trip. A Clerk development instance allows 100 backend requests per 10 s; past that, admins lose admin access for that request with nothing logged, and new users' self-heal fails for that request (this one is logged).
- **Evidence:** [`apps/web/app/api/trpc/[trpc]/route.ts:64-81`](../apps/web/app/api/trpc/%5Btrpc%5D/route.ts#L64-L81) · [`apps/web/app/(app)/layout.tsx:19-38`](../apps/web/app/%28app%29/layout.tsx#L19-L38)

<a id="unused-trpc-procedures"></a>

### 19 of 72 tRPC procedures have no UI caller

**Low** · dead-code · `unused-trpc-procedures`

- **What's wrong:** 15 are called nowhere: `entity.update`, `entity.search`, `instruments.detail`, `.list`, `.mag7`, `.adminCreate`, `.requestTicker`, `claims.detail`, `leaderboard.byTicker`, `consensus.history`, `scores.history`, `social.followers`, `social.following`, `regime.history` and `influence.myInfluencers`. Three more are called only by MCP (`claims.addNote`, `consensus.byInstrument`, `entity.bySlug`), and `entity.stats` only by the hidden landing `SocialProof`.
- **User impact:** Maintenance cost; 11 of the 15 answer signed-out callers.
- **Evidence:** [`packages/api/routers/entities.ts:40`](../packages/api/routers/entities.ts#L40) · [`packages/api/routers/instruments.ts:401`](../packages/api/routers/instruments.ts#L401) · [`packages/api/routers/claims.ts:199`](../packages/api/routers/claims.ts#L199) · [`packages/api/routers/leaderboard.ts:104`](../packages/api/routers/leaderboard.ts#L104) · [`packages/api/routers/influence.ts:124`](../packages/api/routers/influence.ts#L124)

<a id="area-workers"></a>

## Workers and schedules

<a id="claims-created-only-self-logged"></a>

### Ingested, backfilled and approved claims never emit `claims/created`, so mirroring a Guide does nothing

**Medium** · bug · `claims-created-only-self-logged`

- **What's wrong:** Only `claims.submit` sends `claims/created`. `processExtraction` (live ingest and backfill) bulk-inserts claims with no event, and admin approval only flips the status. `signal-simulate` listens only for that event, and a Guide can never self-log.
- **User impact:** "Mirror Signals" on any Guide's profile creates a $100,000 portfolio that never trades but still counts toward the 5-portfolio cap. Mirroring a Player works when that Player self-logs. Guide influence is still recorded through the Player branch of `influence-track`.
- **Evidence:** [`packages/api/routers/claims.ts:116-128`](../packages/api/routers/claims.ts#L116-L128) · [`packages/api/routers/claims.ts:401-404`](../packages/api/routers/claims.ts#L401-L404) · [`packages/ingestion/src/extractor.ts:744`](../packages/ingestion/src/extractor.ts#L744) · [`apps/worker/functions/signal-simulate.ts:21`](../apps/worker/functions/signal-simulate.ts#L21) · [`apps/web/components/EntityProfileHeader.tsx:124-127`](../apps/web/components/EntityProfileHeader.tsx#L124-L127)

<a id="digest-placeholder-recipient"></a>

### Daily digest goes to a placeholder address

**Medium** · inert-integration · `digest-placeholder-recipient`

- **What's wrong:** `daily-digest` never looks up a user's email. It sends from `digest@deepmint.app` to `user+<clerkUserId>@deepmint.app`, with links to `https://deepmint.app`. The Daily/Weekly choice in Settings (`digestFrequency`) is never read. A 24-hour lookback on a Mon–Fri 12:00 UTC cron misses Friday 12:00 to Sunday 12:00 UTC, including Friday's ingest and markout. Resend returns errors instead of throwing, so rejected sends count as sent.
- **User impact:** No user receives a digest. Today it skips entirely (`RESEND_API_KEY` last recorded empty). Setting the key would still reach nobody, and the run summary would count rejected sends as sent.
- **Evidence:** [`apps/worker/functions/digest.ts:22`](../apps/worker/functions/digest.ts#L22) · [`apps/worker/functions/digest.ts:32-33`](../apps/worker/functions/digest.ts#L32-L33) · [`apps/worker/functions/digest.ts:56`](../apps/worker/functions/digest.ts#L56) · [`apps/worker/functions/digest.ts:156-173`](../apps/worker/functions/digest.ts#L156-L173)

<a id="aggregates-refresh-only-after-markout"></a>

### Consensus and influence refresh only on days a claim matures

**Medium** · bug · `aggregates-refresh-only-after-markout`

- **What's wrong:** `consensus-signal` and `influence-aggregate` run only on `scoring/completed`, which follows `markouts/completed`, which is sent only when markout (or a backfill) writes an outcome. No cron recomputes them.
- **User impact:** On days when no claim matures, consensus and influence are not recomputed, however many claims arrived; the 90-day window and decay freeze too. The UI shows no as-of date, so stale signals look current. If no claim has ever matured, no consensus row exists.
- **Evidence:** [`apps/worker/functions/markout.ts:136-144`](../apps/worker/functions/markout.ts#L136-L144) · [`apps/worker/functions/score.ts:323-331`](../apps/worker/functions/score.ts#L323-L331) · [`apps/worker/functions/consensus-signal.ts:21`](../apps/worker/functions/consensus-signal.ts#L21) · [`apps/worker/functions/influence-aggregate.ts:14`](../apps/worker/functions/influence-aggregate.ts#L14)

<a id="markout-holiday-exit-never-priced"></a>

### A claim whose end date is a market holiday never gets an outcome

**Medium** · data-integrity · `markout-holiday-exit-never-priced`

- **What's wrong:** `computeMarkoutForClaim` sets the exit date to `created_at + horizon_days` and moves it past weekends only (`nextTradingDay` checks `isWeekend`, not the market calendar). On a market holiday `getEODPrice` has no bar and throws, the function returns null, and markout counts the claim as skipped "to retry next run". The next run computes the same exit date, so the claim is skipped on every run. Backfill uses the same function. (Found by the final cross-document review of this docs update, and verified against the code.)
- **User impact:** Every active claim whose end date lands on an NYSE holiday (the next is Thanksgiving, 2026-11-26) stays "Matured" with no outcome, so it never counts in any score, and nothing reports it. Each stuck claim also costs one throttled Polygon call (12.5 s) on every weekday markout run, for ever, which adds to [inngest-route-no-maxduration](#inngest-route-no-maxduration).
- **Evidence:** [`apps/worker/functions/markoutClaim.ts:27-33`](../apps/worker/functions/markoutClaim.ts#L27-L33) · [`apps/worker/functions/markoutClaim.ts:78-89`](../apps/worker/functions/markoutClaim.ts#L78-L89) · [`packages/shared/src/polygon.ts:179-200`](../packages/shared/src/polygon.ts#L179-L200) · [`apps/worker/functions/markout.ts:91-95`](../apps/worker/functions/markout.ts#L91-L95) · [`apps/worker/functions/backfill.ts:205`](../apps/worker/functions/backfill.ts#L205)

<a id="backfill-prices-deactivates-on-error"></a>

### `backfill-prices` deactivates an instrument on any error

**Low** · bug · `backfill-prices-deactivates-on-error`

- **What's wrong:** Each ticker's check catches any `getHistoricalPrices` error and returns false, and every false is deactivated. A transient 429 or 5xx therefore counts as "no data", and the function's retries never fire. Without a key every new instrument is deactivated. Nothing is logged.
- **User impact:** Adding instruments can switch off valid tickers, removing them from claim submission, search and consensus. Reversible with Activate on `/admin/instruments`.
- **Evidence:** [`apps/worker/functions/backfill-prices.ts:52-80`](../apps/worker/functions/backfill-prices.ts#L52-L80)

<a id="broker-sync-error-sticky"></a>

### One broker-sync failure stops syncing for good

**Low** · bug · `broker-sync-error-sticky`

- **What's wrong:** Both sync paths pick only links with `sync_status='active'` and set `'error'` on any failure. Only `completeLink` sets `'active'` again; the cron's success path does not, so even an error that an Inngest retry recovers from sticks. The error state's Retry button only refetches. `completeLink` also sets `last_sync_at` to now, so trades from before the link are never fetched.
- **User impact:** Dormant while SnapTrade is unconfigured. Once enabled, one error ends syncing for that Player while the Verified badge and ×1.5 weight stay.
- **Evidence:** [`apps/worker/functions/broker-sync.ts:36-46`](../apps/worker/functions/broker-sync.ts#L36-L46) · [`apps/worker/functions/broker-sync.ts:118-137`](../apps/worker/functions/broker-sync.ts#L118-L137) · [`packages/api/routers/broker.ts:182-196`](../packages/api/routers/broker.ts#L182-L196) · [`apps/web/components/settings/BrokerVerification.tsx:149-169`](../apps/web/components/settings/BrokerVerification.tsx#L149-L169)

<a id="cron-times-assume-edt"></a>

### UTC crons drift an hour in winter: markout runs at the 16:00 ET close

**Low** · bug · `cron-times-assume-edt`

- **What's wrong:** The crons are UTC with no `TZ=` prefix, and comments give EDT times. From Monday 2026-11-02 until US daylight time resumes on 2027-03-14, `ingest-sources` (20:30 UTC) runs at 15:30 ET, before the close, and `markout-computation` (21:00 UTC) runs at exactly 16:00 ET.
- **User impact:** Most outcomes will likely land one trading day late: at 16:00 ET the day's bar is probably not available yet, so the claim waits for the next run, which still prices the correct exit date. A claim whose `rating_date` is today can fail its entry-price lookup and be stored with no entry price, so it never scores.
- **Evidence:** [`apps/worker/functions/ingest.ts:53-61`](../apps/worker/functions/ingest.ts#L53-L61) · [`apps/worker/functions/markout.ts:8-15`](../apps/worker/functions/markout.ts#L8-L15) · [`apps/worker/functions/markoutClaim.ts:85-88`](../apps/worker/functions/markoutClaim.ts#L85-L88) · [`packages/ingestion/src/extractor.ts:649-664`](../packages/ingestion/src/extractor.ts#L649-L664)

<a id="merkle-audit-gaps"></a>

### The Merkle audit misses backdated claims and leaves out prices

**Low** · data-integrity · `merkle-audit-gaps`

- **What's wrong:** `merkle-audit` (22:00 UTC daily) hashes claims whose `created_at` is in the previous UTC day. Claims inserted later with an earlier `created_at` (ratings dated two or more days back, nearly all backfill) are in no root. The leaf omits target, entry price, confidence and rationale. `bitcoin_tx_id` is never written, nothing reads `audit_roots`, and a re-run for a stored date fails on its UNIQUE `date`.
- **User impact:** No visible effect today, because roots are neither published nor anchored. Once published, most backfilled history would be uncovered, and entry price, target and confidence could change without breaking a root.
- **Evidence:** [`apps/worker/functions/audit.ts:22-62`](../apps/worker/functions/audit.ts#L22-L62) · [`packages/shared/src/merkle.ts:7-16`](../packages/shared/src/merkle.ts#L7-L16) · [`packages/ingestion/src/extractor.ts:642-644`](../packages/ingestion/src/extractor.ts#L642-L644) · [`apps/worker/functions/backfill.ts:144`](../apps/worker/functions/backfill.ts#L144)

<a id="leaderboard-refresh-noop"></a>

### `leaderboard-refresh` is a no-op that claims to cache results

**Low** · dead-code · `leaderboard-refresh-noop`

- **What's wrong:** The function only logs and returns `{ refreshed: true }`. Its comments describe pre-computation and Redis caching that do not exist; leaderboards query Postgres live.
- **User impact:** Misleads operators reading Inngest runs, and uses one run per scoring event.
- **Evidence:** [`apps/worker/functions/leaderboard-refresh.ts:2-23`](../apps/worker/functions/leaderboard-refresh.ts#L2-L23)

<a id="worker-stale-docstrings"></a>

### Worker docstrings describe behaviour the code no longer has

**Low** · docs-drift · `worker-stale-docstrings`

- **What's wrong:** `getSourceAdapters`' docstring says it falls back to the demo adapter; the body has no fallback, as its own note says, and `DemoSourceAdapter` is used only by a test. `score.ts` comments "entities that have outcomes" over a query of all entities and selects an unused `brokerLinkStatus`. `ingest-sources` returns `totalProcessed` as the number of adapters, not captures.
- **User impact:** Maintainers only.
- **Evidence:** [`apps/worker/functions/ingest.ts:11-15`](../apps/worker/functions/ingest.ts#L11-L15) · [`apps/worker/functions/ingest.ts:46-49`](../apps/worker/functions/ingest.ts#L46-L49) · [`apps/worker/functions/ingest.ts:133`](../apps/worker/functions/ingest.ts#L133) · [`apps/worker/functions/score.ts:50-57`](../apps/worker/functions/score.ts#L50-L57)

<a id="area-ingestion"></a>

## Ingestion and extraction

<a id="guide-resolver-matches-user-slug"></a>

### Firm attribution can land on a signed-up user with the firm's slug

**Medium** · data-integrity · `guide-resolver-matches-user-slug`

- **What's wrong:** `resolveOrCreateGuide` falls back to matching any entity by slug, with no `type='guide'` or `clerk_user_id IS NULL` condition, and firm attribution calls it with no source URL. A user who signs up as, say, "Goldman Sachs" before that firm has a Guide gets slug `goldman-sachs`, and the firm's later ratings are credited to that Player.
- **User impact:** Latent until a firm-attributing lane (RSS, Polygon news or backfill) runs. Any sign-up could then inherit an institution's ratings on purpose, and the firm would never appear as a Guide. Repair means rewriting `claims.entity_id`, against the append-only rule.
- **Evidence:** [`packages/ingestion/src/sources/resolver.ts:49-55`](../packages/ingestion/src/sources/resolver.ts#L49-L55) · [`packages/ingestion/src/extractor.ts:625-637`](../packages/ingestion/src/extractor.ts#L625-L637) · [`packages/db/queries/ensureEntityForClerkUser.ts:42-62`](../packages/db/queries/ensureEntityForClerkUser.ts#L42-L62)

<a id="extraction-failures-never-retried"></a>

### Failed extractions are never re-driven

**Medium** · bug · `extraction-failures-never-retried`

- **What's wrong:** `extract-claims` and backfill put events whose extraction failed after all retries into `failedEventIds`, which appears only in the run output. If `ingest-sources` fails for good (after its retries) before its single `ingestion/completed` send, the events it already stored are never extracted, and later runs skip them by hash. `events` has no extraction-status column.
- **User impact:** A post whose extraction failed (LLM outage, bad key, exhausted credits) keeps no claims unless an operator re-drives it. Re-running the `extract-claims` run in the Inngest dashboard is safe, because events that already have claims are skipped.
- **Evidence:** [`apps/worker/functions/extract.ts:69-79`](../apps/worker/functions/extract.ts#L69-L79) · [`apps/worker/functions/ingest.ts:86-95`](../apps/worker/functions/ingest.ts#L86-L95) · [`apps/worker/functions/ingest.ts:124-129`](../apps/worker/functions/ingest.ts#L124-L129) · [`apps/worker/functions/backfill.ts:167-176`](../apps/worker/functions/backfill.ts#L167-L176) · [`packages/ingestion/src/extractor.ts:586-594`](../packages/ingestion/src/extractor.ts#L586-L594)

<a id="firm-reattribution-all-lanes"></a>

### A Guide's own post that names a bank is credited to the bank

**Low** · data-integrity · `firm-reattribution-all-lanes`

- **What's wrong:** Any claim with a valid `analyst_firm` is credited to that firm's Guide in every lane. That is the intended issuer-not-carrier rule, but in a Guide's lane the claim keeps `source_kind='analyst_feed'`. Nothing guards against a Guide who works at the firm, or a model that names a firm on the Guide's own view; those calls move to the firm and can go active without review. The workers' "attribution is inherent" comments are wrong.
- **User impact:** Latent until a historical backfill runs or a Guide feed is enabled (a database edit). Nothing reads `source_kind` yet.
- **Evidence:** [`packages/ingestion/src/extractor.ts:619-637`](../packages/ingestion/src/extractor.ts#L619-L637) · [`packages/ingestion/src/extractor.ts:676-677`](../packages/ingestion/src/extractor.ts#L676-L677) · [`apps/worker/functions/extract.ts:43-49`](../apps/worker/functions/extract.ts#L43-L49)

<a id="carrier-entity-claims-approvable"></a>

### Approving an unattributed rating makes the news publisher score

**Low** · data-integrity · `carrier-entity-claims-approvable`

- **What's wrong:** A Wall Street rating with no resolved firm is stored as `pending_review` under the publication's entity, which is an ordinary Guide. Approval only flips the status, so the publisher is then scored and ranked as a Guide. The review page does not say why the claim was held, and approval cannot be undone in the app.
- **User impact:** Latent: only the Polygon news lane, off unless `INGEST_POLYGON_NEWS=1`, produces these claims.
- **Evidence:** [`packages/ingestion/src/extractor.ts:671-685`](../packages/ingestion/src/extractor.ts#L671-L685) · [`packages/api/routers/claims.ts:370-407`](../packages/api/routers/claims.ts#L370-L407) · [`apps/web/app/(app)/admin/review/page.tsx:70-77`](../apps/web/app/%28app%29/admin/review/page.tsx#L70-L77)

<a id="cross-source-dedupe-ignores-status"></a>

### Claim dedupe lets a pending or rejected copy block a later valid one

**Low** · data-integrity · `cross-source-dedupe-ignores-status`

- **What's wrong:** Dedupe on entity, instrument, direction, horizon and UTC date ignores status. A weaker earlier copy (pending, or rejected by an admin) blocks a later copy with a verified quote, which is dropped and only counted.
- **User impact:** If the weaker copy is rejected or never reviewed, the call never scores and its evidence is lost.
- **Evidence:** [`packages/ingestion/src/extractor.ts:687-716`](../packages/ingestion/src/extractor.ts#L687-L716)

<a id="rss-undated-items-reingested"></a>

### Undated RSS items are re-ingested on every run

**Low** · data-integrity · `rss-undated-items-reingested`

- **What's wrong:** An RSS item with no `isoDate` or `pubDate` gets `capturedAt = now()`, which is part of the content hash. Each weekday run therefore stores it as a new event, and extraction usually adds a new append-only claim. An RSS 2.0 item with a malformed `pubDate` is stored with `captured_at` 1970-01-01.
- **User impact:** Latent: no RSS feed can be enabled without a database edit.
- **Evidence:** [`packages/ingestion/src/sources/rss.ts:41-45`](../packages/ingestion/src/sources/rss.ts#L41-L45) · [`packages/ingestion/src/hasher.ts:13-17`](../packages/ingestion/src/hasher.ts#L13-L17) · [`apps/worker/functions/ingest.ts:80-95`](../apps/worker/functions/ingest.ts#L80-L95)

<a id="rss-lane-cannot-be-enabled"></a>

### The RSS lane can only be switched on in SQL

**Low** · feature-gap · `rss-lane-cannot-be-enabled`

- **What's wrong:** The RSS lane reads only Guides with `is_allowlisted=true` and a `source_url`. Only the fake seed sets `is_allowlisted=true` (with no `source_url`); every other creator hard-codes false, and no API or admin page changes it.
- **User impact:** Unless rows were edited by hand (not recorded) or `INGEST_POLYGON_NEWS=1` is set, the weekday ingest cron captures nothing. Turning on a backfilled Guide's feed takes a SQL `UPDATE` setting `is_allowlisted = true` on that one Guide's row.
- **Evidence:** [`apps/worker/functions/ingest.ts:17-26`](../apps/worker/functions/ingest.ts#L17-L26) · [`apps/worker/functions/ingest.ts:42-49`](../apps/worker/functions/ingest.ts#L42-L49) · [`packages/db/seed.ts:105-117`](../packages/db/seed.ts#L105-L117) · [`packages/ingestion/src/sources/resolver.ts:70`](../packages/ingestion/src/sources/resolver.ts#L70)

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

<a id="extractor-silent-drops"></a>

### The extractor drops some valid calls without saying why

**Low** · bug · `extractor-silent-drops`

- **What's wrong:** The pre-filter matches "GOOG", but validation accepts only `GOOGL`, with no mapping and no trimming of `$` or spaces. Off-grid horizons are rejected despite a "map to nearest" comment. A ticker with no instruments row is skipped and counted nowhere. Ingestion does not check `is_active`, so deactivated instruments still receive claims.
- **User impact:** Calls on GOOG, or with 60-day or 2-year horizons, never reach the ledger. Rejection reasons are not logged, and backfill ignores even the counts.
- **Evidence:** [`packages/ingestion/src/extractor.ts:320`](../packages/ingestion/src/extractor.ts#L320) · [`packages/ingestion/src/extractor.ts:466-487`](../packages/ingestion/src/extractor.ts#L466-L487) · [`packages/ingestion/src/extractor.ts:613-620`](../packages/ingestion/src/extractor.ts#L613-L620) · [`apps/worker/functions/backfill.ts:140-163`](../apps/worker/functions/backfill.ts#L140-L163)

<a id="firm-guide-resolution-edge-cases"></a>

### Long firm names fall back to the carrier, and failed inserts leave orphan Guides

**Low** · bug · `firm-guide-resolution-edge-cases`

- **What's wrong:** Firm names up to 200 characters pass validation, but `display_name` is `varchar(100)`, so creating a 101–200-character firm fails and the claim stays with the carrier. In the Polygon news lane (off by default), a publisher name over 100 characters would abort the whole ingest run. Firm Guides are created before the post's single claim insert, so a persistent insert failure (such as a target above $21,474,836.47 overflowing the integer column) loses the post's claims and leaves orphan Guides.
- **User impact:** Rare. Orphan Guides are empty profiles, which `entity.search` (no UI caller) returns.
- **Evidence:** [`packages/ingestion/src/extractor.ts:139`](../packages/ingestion/src/extractor.ts#L139) · [`packages/db/schema/entities.ts:10`](../packages/db/schema/entities.ts#L10) · [`packages/ingestion/src/sources/resolver.ts:60-88`](../packages/ingestion/src/sources/resolver.ts#L60-L88) · [`packages/ingestion/src/sources/polygonNews.ts:77-86`](../packages/ingestion/src/sources/polygonNews.ts#L77-L86) · [`packages/ingestion/src/extractor.ts:494-498`](../packages/ingestion/src/extractor.ts#L494-L498)

<a id="rationale-tags-vocabulary"></a>

### Extracted rationale tags accept any string

**Low** · data-integrity · `rationale-tags-vocabulary`

- **What's wrong:** Self-logged claims accept only the 10 `RATIONALE_TAGS` (at most 10). Extracted claims store whatever strings the model returns, with no vocabulary, count, length or duplicate check, and the prompt's example lists all ten tags.
- **User impact:** Claim cards can show invented, long or duplicate tags (duplicate React keys), and stored tags cannot be corrected.
- **Evidence:** [`packages/ingestion/src/extractor.ts:79`](../packages/ingestion/src/extractor.ts#L79) · [`packages/ingestion/src/extractor.ts:505-507`](../packages/ingestion/src/extractor.ts#L505-L507) · [`packages/api/routers/claims.ts:56-59`](../packages/api/routers/claims.ts#L56-L59)

<a id="extractor-client-before-prefilter"></a>

### `extractClaims` needs `HF_API_KEY` even for text it would skip

**Low** · bug · `extractor-client-before-prefilter`

- **What's wrong:** The LLM client, which throws without `HF_API_KEY`, is built before the Mag-7 pre-filter. Every production caller filters first, and the missing-key test relies on this order.
- **User impact:** None for users; a code-order trap for tests and scripts.
- **Evidence:** [`packages/ingestion/src/extractor.ts:405-414`](../packages/ingestion/src/extractor.ts#L405-L414) · [`packages/ingestion/src/__tests__/extractor.test.ts:147-161`](../packages/ingestion/src/__tests__/extractor.test.ts#L147-L161)

<a id="area-data"></a>

## Data model and shared code

<a id="fallback-prices-in-ledger"></a>

### A failed entry-price lookup leaves a claim that never scores; a keyless deploy writes fake prices

**Medium** · data-integrity · `fallback-prices-in-ledger`

- **What's wrong:** With a key, extraction and backfill swallow any entry-price error and insert the claim with `entry_price_cents` null. Claims are immutable, re-extraction skips the event, and markout returns nothing for it on every run. With no key, price helpers return fixed dev prices (Mag 7 only) and empty history, so claims and outcomes get made-up entry prices and 0 bps returns.
- **User impact:** Live: a Guide claim whose price lookup fails once (a 429, or a rating dated on a market holiday) shows as active but never scores, and nothing reports it. Latent: a keyless deploy writing to a shared database would store fake, undeletable outcomes.
- **Evidence:** [`packages/ingestion/src/extractor.ts:646-664`](../packages/ingestion/src/extractor.ts#L646-L664) · [`apps/worker/functions/backfill.ts:145-152`](../apps/worker/functions/backfill.ts#L145-L152) · [`apps/worker/functions/markoutClaim.ts:74`](../apps/worker/functions/markoutClaim.ts#L74) · [`packages/shared/src/polygon.ts:38-56`](../packages/shared/src/polygon.ts#L38-L56)

<a id="uniqueness-invariants-comment-only"></a>

### Uniqueness and append-only rules exist only in comments

**Medium** · data-integrity · `uniqueness-invariants-comment-only`

- **What's wrong:** No migration creates the unique indexes the schema comments describe (one outcome per claim and horizon, one instrument per ticker and exchange, one score per entity, metric, horizon, regime and date), and `events.content_hash` is not unique. No trigger or permission enforces append-only. Dedupe is check-then-insert with no `ON CONFLICT` and no Inngest concurrency limit: markout checks every due claim first, then spends minutes pricing them before inserting. Derived tables are deleted and re-inserted outside a transaction.
- **User impact:** Sequential retries are safe. A historical backfill overlapping the 21:00 UTC markout can write duplicate outcomes, which count twice in hit rate, returns and EIV and are never removed.
- **Evidence:** [`packages/db/schema/outcomes.ts:21-22`](../packages/db/schema/outcomes.ts#L21-L22) · [`packages/db/schema/events.ts:9`](../packages/db/schema/events.ts#L9) · [`apps/worker/functions/markout.ts:44-61`](../apps/worker/functions/markout.ts#L44-L61) · [`apps/worker/functions/markout.ts:83-108`](../apps/worker/functions/markout.ts#L83-L108) · [`apps/worker/functions/score.ts:243-251`](../apps/worker/functions/score.ts#L243-L251)

<a id="soft-delete-half-implemented"></a>

### Soft delete is read in some places but never set

**Low** · data-integrity · `soft-delete-half-implemented`

- **What's wrong:** `entities.deleted_at` is checked by five procedures but written by nothing. Most reads (profiles, search, REST v1, consensus, scoring, influence, MCP) ignore it, and a comment wrongly says consensus excludes deleted entities.
- **User impact:** No effect today. A user cannot be removed, and a manual SQL soft-delete would hide an entity from only some surfaces.
- **Evidence:** [`packages/db/schema/entities.ts:22`](../packages/db/schema/entities.ts#L22) · [`packages/api/routers/entities.ts:109-114`](../packages/api/routers/entities.ts#L109-L114) · [`apps/worker/functions/consensus-signal.ts:57-66`](../apps/worker/functions/consensus-signal.ts#L57-L66)

<a id="stale-schema-and-scoring-comments"></a>

### Schema and consensus comments describe behaviour that does not exist

**Low** · docs-drift · `stale-schema-and-scoring-comments`

- **What's wrong:** The `scores` schema comment lists metrics never written (`hit_rate_3m`, `hit_rate_6m`, `hit_rate_12m`, `overall_player`, `overall_guide`) and a `12m` horizon; real horizons are `all`, `1d`, `1w`, `1m`, `3m`, `6m` and `1y`. The `confidenceMultiplier` comment says the APIs can write out-of-range confidence, but every writer bounds it to 0–100; only direct SQL could, as the column has no CHECK.
- **User impact:** Queries written from the comment return nothing.
- **Evidence:** [`packages/db/schema/scores.ts:8-12`](../packages/db/schema/scores.ts#L8-L12) · [`packages/scoring/src/consensus.ts:45-48`](../packages/scoring/src/consensus.ts#L45-L48) · [`packages/api/routers/claims.ts:54`](../packages/api/routers/claims.ts#L54)

<a id="two-verified-flags"></a>

### Two "verified" flags are read inconsistently

**Low** · bug · `two-verified-flags`

- **What's wrong:** Profile headers and the ticker Top Entities panel show Verified if `entities.is_verified` or `broker_link_status='verified'`. The leaderboard page, Settings, REST v1 and consensus read only `broker_link_status`. Only the seed sets `is_verified`. `broker_links.is_verified` is never reset and no UI reads it.
- **User impact:** None in production, where neither flag is set. In a seeded local database the badge differs between surfaces.
- **Evidence:** [`apps/web/components/EntityProfileHeader.tsx:45-46`](../apps/web/components/EntityProfileHeader.tsx#L45-L46) · [`apps/web/components/ticker/TopEntitiesPanel.tsx:54-56`](../apps/web/components/ticker/TopEntitiesPanel.tsx#L54-L56) · [`apps/web/app/(app)/leaderboard/page.tsx:191-192`](../apps/web/app/%28app%29/leaderboard/page.tsx#L191-L192) · [`apps/web/app/api/v1/leaderboard/route.ts:107`](../apps/web/app/api/v1/leaderboard/route.ts#L107)

<a id="dead-and-duplicated-shared-code"></a>

### Dead and duplicated shared code

**Low** · dead-code · `dead-and-duplicated-shared-code`

- **What's wrong:** Unused: `errors.ts` (6 error classes), `centsToDollars`, `dollarsToCents`, `bpsToPercent`, `percentToBps`, `BPS_PER_PERCENT`, `CENTS_PER_DOLLAR`, `CLAIM_RATE_LIMIT`, `Mag7Ticker`, `getBatchEODPrices`, the price cache-key helpers and four `components/ui` files. Duplicated: the claims rate limit (hard-coded 10/h), a 7-ticker list in `instruments.mag7`, the rating enums and `SourceKind` in the extractor, two `slugify`s, and two local copies of the shared `formatBps`.
- **User impact:** None for users; noise for maintainers.
- **Evidence:** [`packages/shared/src/errors.ts:1-45`](../packages/shared/src/errors.ts#L1-L45) · [`packages/shared/src/polygon.ts:468`](../packages/shared/src/polygon.ts#L468) · [`packages/shared/src/polygonCache.ts:80-94`](../packages/shared/src/polygonCache.ts#L80-L94) · [`packages/api/routers/claims.ts:34`](../packages/api/routers/claims.ts#L34)

<a id="asset-class-unpriceable"></a>

### Non-equity asset classes are accepted but cannot be priced

**Low** · feature-gap · `asset-class-unpriceable`

- **What's wrong:** The schema and the admin API accept equity, etf, crypto, forex, commodity and index, but pricing never reads `asset_class` and always calls Polygon stocks endpoints. ETFs work, because they trade as stocks; crypto, forex, commodity and index instruments cannot be priced, so claims and paper trades on them fail. The only UI create path hard-codes `equity`.
- **User impact:** None today: reachable only with a hand-made admin tRPC call.
- **Evidence:** [`packages/db/schema/instruments.ts:3-4`](../packages/db/schema/instruments.ts#L3-L4) · [`packages/api/routers/instruments.ts:19-39`](../packages/api/routers/instruments.ts#L19-L39) · [`packages/shared/src/polygon.ts:125`](../packages/shared/src/polygon.ts#L125) · [`packages/shared/src/polygon.ts:180`](../packages/shared/src/polygon.ts#L180)

<a id="area-infra"></a>

## Infrastructure, config and tooling

<a id="trpc-inngest-prefixed-keys"></a>

### tRPC routers' Inngest clients never see the `INNGEST_WORKFLOW_`-prefixed keys

**Medium** · config · `trpc-inngest-prefixed-keys`

- **What's wrong:** The claims, social and instruments routers each create an Inngest client when the module loads, and it copies the environment then. The mapping from `INNGEST_WORKFLOW_*` to `INNGEST_*` is imported only by `/api/inngest` and `apps/worker/inngest.ts`. In cloud mode, `send()` throws when there is no event key.
- **User impact:** Applies only if production lacks an unprefixed `INNGEST_EVENT_KEY`, which could not be checked on 2026-10-05. If so, `claims/created` and `social/followed` fail silently (no mirrored trades, influence events or follower notifications from self-logged activity), and admin instrument creation throws after inserting the rows, skipping the price check. Crons are unaffected.
- **Evidence:** [`packages/api/routers/claims.ts:21-23`](../packages/api/routers/claims.ts#L21-L23) · [`packages/api/routers/claims.ts:116-128`](../packages/api/routers/claims.ts#L116-L128) · [`packages/api/routers/social.ts:85-93`](../packages/api/routers/social.ts#L85-L93) · [`packages/api/routers/instruments.ts:361-366`](../packages/api/routers/instruments.ts#L361-L366) · [`apps/web/app/api/inngest/inngest-env.ts:6-9`](../apps/web/app/api/inngest/inngest-env.ts#L6-L9)

<a id="polygon-throttle-not-serialized"></a>

### The Polygon throttle is not a queue: concurrent calls fire together

**Medium** · bug · `polygon-throttle-not-serialized`

- **What's wrong:** `polygonRateLimit` sleeps first and records the request time afterwards, so callers that start together compute the same wait and fire together. Every `Promise.all` pair in the regime code sends two requests per interval. The state is per serverless instance, not per account.
- **User impact:** Regime detection bursts at about 2× (4× when two lookups overlap) the 5 req/min plan. 429s are hidden by silent fallbacks (dropped sector ETFs, default dispersion 0.08, default S&P return, hard-coded SPX 5300) that can mislabel the regime, and overlapping requests can make claim submission fail.
- **Evidence:** [`packages/shared/src/polygon.ts:76-94`](../packages/shared/src/polygon.ts#L76-L94) · [`packages/shared/src/polygon.ts:372-375`](../packages/shared/src/polygon.ts#L372-L375) · [`packages/shared/src/polygon.ts:434-437`](../packages/shared/src/polygon.ts#L434-L437)

<a id="sentry-inert"></a>

### Sentry cannot be switched on by setting the DSN

**Medium** · inert-integration · `sentry-inert`

- **What's wrong:** `sentry.{client,server,edge}.config.ts` exist, but there is no `instrumentation.ts` or `instrumentation-client.ts`, `next.config.ts` has no `withSentryConfig`, and nothing else imports `@sentry/nextjs`. The error boundaries report nothing. `SENTRY_AUTH_TOKEN` is read by nothing.
- **User impact:** No error reporting from the app or the unattended Inngest functions. Enabling it needs code changes, not just a key.
- **Evidence:** [`apps/web/next.config.ts:1-15`](../apps/web/next.config.ts#L1-L15) · [`apps/web/sentry.server.config.ts:1-7`](../apps/web/sentry.server.config.ts#L1-L7) · [`apps/web/app/global-error.tsx:1-31`](../apps/web/app/global-error.tsx#L1-L31)

<a id="db-seed-unsafe"></a>

### `db:seed` writes fake data with no safety check

**Medium** · data-integrity · `db-seed-unsafe`

- **What's wrong:** `db:seed` checks only that `DATABASE_URL` is set: there is no host or environment guard, confirmation or transaction. It inserts the Mag 7, five fictional verified Guides, three Players, 100 active claims backdated 90–365 days with random entry prices, trades, synthetic consensus, influence events and follows. Instruments have no unique index, so each run adds seven more Mag-7 rows, and a re-run on a seeded database fails on `entities_slug_unique` after partial writes. No script seeds only the Mag 7.
- **User impact:** Run against production, it would duplicate the Mag-7 instruments and put fake Guides with backdated claims into the ledger; the next weekday markout would turn them into public scores. Cleanup would need hand-written SQL across about ten tables.
- **Evidence:** [`packages/db/seed.ts:5-11`](../packages/db/seed.ts#L5-L11) · [`packages/db/seed.ts:51-65`](../packages/db/seed.ts#L51-L65) · [`packages/db/seed.ts:203-242`](../packages/db/seed.ts#L203-L242) · [`packages/db/drizzle/0000_medical_hammerhead.sql:102-114`](../packages/db/drizzle/0000_medical_hammerhead.sql#L102-L114)

<a id="stale-worker-build-artifacts"></a>

### Stale compiled worker files shadow the source in production

**Medium** · config · `stale-worker-build-artifacts`

- **What's wrong:** Compiled leftovers from 2026-04-02 are tracked in `apps/worker` (`inngest.js`, `inngest.js.map`, `inngest.d.ts`, `inngest.d.ts.map`, `functions/ingest.js.map`). Next's webpack resolves `.js` before `.ts`, so the production build bundles the stale `inngest.js`, which lacks the `INNGEST_WORKFLOW_` key mapping, for all 15 functions. tsx scripts load `inngest.ts`.
- **User impact:** Production works only because `/api/inngest` imports `inngest-env.ts` first. Any future change to `apps/worker/inngest.ts` would work locally and silently not ship.
- **Evidence:** [`apps/worker/inngest.js:1-2`](../apps/worker/inngest.js#L1-L2) · [`apps/worker/inngest.ts:7-10`](../apps/worker/inngest.ts#L7-L10) · [`apps/web/app/api/inngest/route.ts:4`](../apps/web/app/api/inngest/route.ts#L4)

<a id="inngest-route-no-maxduration"></a>

### `/api/inngest` sets no `maxDuration` for steps that can run for minutes

**Low** · config · `inngest-route-no-maxduration`

- **What's wrong:** Several steps are long single invocations under the project's default function limit (unverified; about 300 s with Fluid compute). Markout prices every due claim in one step at 12.5–25 s each, so about 12–24 due claims fill 300 s. Scoring starts with the uncached regime lookup (about 3 minutes). One LLM model can take 3 × 120 s.
- **User impact:** Probably nothing at today's volume. As it grows, steps are killed and retried. If every markout attempt times out, scoring does not run that day, and a hung primary model uses up the step before the fallback model is tried.
- **Evidence:** [`apps/web/app/api/inngest/route.ts:1-11`](../apps/web/app/api/inngest/route.ts#L1-L11) · [`apps/worker/functions/markout.ts:83-91`](../apps/worker/functions/markout.ts#L83-L91) · [`apps/worker/functions/score.ts:32-38`](../apps/worker/functions/score.ts#L32-L38) · [`packages/ingestion/src/extractor.ts:308-309`](../packages/ingestion/src/extractor.ts#L308-L309)

<a id="domain-mismatch"></a>

### Code hard-codes `deepmint.app` and `deepmint.com`

**Low** · config · `domain-mismatch`

- **What's wrong:** `deepmint.app` is the metadata base fallback, the OpenAPI contact URL and the digest sender, recipient and links. `deepmint.com` is the R2 public URL default and the demo adapter's URLs. Production is www.deepmint.ai, and the OpenAPI and digest values have no env override.
- **User impact:** Only the OpenAPI and Swagger contact link is visible today, and `deepmint.app` does not resolve.
- **Evidence:** [`apps/web/app/layout.tsx:21-23`](../apps/web/app/layout.tsx#L21-L23) · [`apps/web/app/api/v1/openapi.json/route.ts:29-32`](../apps/web/app/api/v1/openapi.json/route.ts#L29-L32) · [`apps/worker/functions/digest.ts:156-165`](../apps/worker/functions/digest.ts#L156-L165) · [`packages/ingestion/src/r2.ts:53`](../packages/ingestion/src/r2.ts#L53)

<a id="lint-broken"></a>

### `pnpm lint` cannot work

**Low** · config · `lint-broken`

- **What's wrong:** `pnpm lint` runs `next lint` in `apps/web`, which has no ESLint config or dependency. `tooling/eslint` is an old-style config that nothing references.
- **User impact:** The repo has no linting. Without a terminal `next lint` exits 1; in one, it starts Next's setup wizard, which can install packages and write a config.
- **Evidence:** [`apps/web/package.json:10`](../apps/web/package.json#L10) · [`package.json:7`](../package.json#L7) · [`tooling/eslint/base.js:3-16`](../tooling/eslint/base.js#L3-L16)

<a id="worker-scripts-broken"></a>

### `apps/worker` `start` and `dev` scripts do nothing useful

**Low** · config · `worker-scripts-broken`

- **What's wrong:** `start` runs `node dist/index.js`, which the build never emits (it emits `dist/src/index.js`, whose extensionless imports fail in Node anyway). `dev` logs "15 functions registered" and serves nothing. The functions actually run inside `apps/web` at `/api/inngest`.
- **User impact:** Developers only: `start` crashes and `dev` misleads.
- **Evidence:** [`apps/worker/package.json:10-12`](../apps/worker/package.json#L10-L12) · [`apps/worker/src/index.ts:39-42`](../apps/worker/src/index.ts#L39-L42)

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

<a id="ci-coverage-narrow"></a>

### CI checks only part of the monorepo

**Low** · config · `ci-coverage-narrow`

- **What's wrong:** CI runs `tsc` for scoring and shared and tests for scoring, shared and ingestion. `next build` type-checks most api, db, ingestion and worker code through the web tsconfig (with DOM types), but not `packages/db/seed.ts`, `drizzle.config.ts`, `ingestion/src/capture.ts`, `ingestion/scripts/bench-providers.ts` or `apps/worker/scripts/backfill.ts`. The api test never runs in CI, the worker has no tests, and the web integration suite is not invoked.
- **User impact:** Type errors in those scripts, and behaviour regressions in routers and jobs, reach `main` unflagged.
- **Evidence:** [`.github/workflows/ci.yml:28-35`](../.github/workflows/ci.yml#L28-L35)

<a id="run-migration-script-unsafe"></a>

### `run-migration.mjs` hard-codes the main checkout and reports success on failure

**Low** · config · `run-migration-script-unsafe`

- **What's wrong:** The unreferenced script migrates from `/Users/nm/Projects/Deepmint/packages/db/drizzle`, forces `ssl: 'require'` (so only a remote database works) and exits 0 after printing "Migration failed".
- **User impact:** Only if someone runs it: from a worktree it applies the main checkout's migrations and reports success, and real failures still exit 0.
- **Evidence:** [`packages/db/run-migration.mjs:8`](../packages/db/run-migration.mjs#L8) · [`packages/db/run-migration.mjs:13`](../packages/db/run-migration.mjs#L13) · [`packages/db/run-migration.mjs:15-16`](../packages/db/run-migration.mjs#L15-L16)

<a id="turbo-env-undeclared"></a>

### `turbo.json` declares no env, so strict mode filters variables and caching ignores them

**Low** · config · `turbo-env-undeclared`

- **What's wrong:** Turbo 2.9.1 runs in strict env mode: shell variables are stripped from tasks (except `NEXT_PUBLIC_*` for web), and env changes, including the root `.env.local`, do not invalidate the `test` cache.
- **User impact:** Root `pnpm test` can replay stale results after `.env.local` changes, and `TEST_API_KEY=… pnpm test` silently skips. CI and Vercel do not use turbo.
- **Evidence:** [`turbo.json:1-25`](../turbo.json#L1-L25) · [`package.json:5-10`](../package.json#L5-L10)

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

The docs part of [gitignored-doc-references](#gitignored-doc-references) is fixed too: [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md) no longer tells sessions to read a gitignored spec, though older [DEVLOG.md](DEVLOG.md) entries still cite them as history. The doc statements behind several open entries were also corrected, including [sentry-inert](#sentry-inert), `mcp-unreachable-basepath` (since fixed), [polygon-throttle-not-serialized](#polygon-throttle-not-serialized), [redis-compose-unused](#redis-compose-unused) and [db-seed-unsafe](#db-seed-unsafe); their code issues stay open above.

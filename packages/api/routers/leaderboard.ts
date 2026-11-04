import { z } from "zod";
import { memberProcedure, router } from "../trpc";
import { alias } from "drizzle-orm/pg-core";
import { db, desc, asc, eq, gte, and, isNull } from "@deepmint/db";
import { scores, entities, instruments } from "@deepmint/db/schema";
import { LOWER_IS_BETTER_METRICS, MIN_RANKED_OUTCOMES } from "@deepmint/shared";
import { getLatestMarketRegime } from "../lib/marketRegime";
import { topByInstrument } from "../lib/topByInstrument";

// The scorer's rows beside each ranked score: its entity's sample at that
// horizon on that date, and whether the pooled hit rate cleared the z-test.
const sample = alias(scores, "sample");
const significance = alias(scores, "significance");

const sampleRow = (horizon: string) =>
  and(
    eq(sample.entityId, scores.entityId),
    eq(sample.asOfDate, scores.asOfDate),
    eq(sample.metric, "outcome_count"),
    eq(sample.horizon, horizon),
  );

const significanceRow = and(
  eq(significance.entityId, scores.entityId),
  eq(significance.asOfDate, scores.asOfDate),
  eq(significance.metric, "z_significant"),
  eq(significance.horizon, "all"),
);

export const leaderboardRouter = router({
  /**
   * Top entities by metric, among those with at least MIN_RANKED_OUTCOMES
   * scored outcomes at the board's horizon.
   */
  top: memberProcedure
    .input(
      z.object({
        metric: z.string().min(1),
        entityType: z.enum(["player", "guide"]).optional(),
        // Defaults to "all". The scores table holds one row per entity per
        // metric per horizon, so leaving this unfiltered listed an entity once
        // per horizon it had been scored at — up to 7 duplicate rows each for
        // hit_rate, which is written per-horizon as well as pooled.
        horizon: z.string().default("all"),
        regimeTag: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ input }) => {
      // Build WHERE conditions
      const conditions = [
        eq(scores.metric, input.metric),
        eq(scores.horizon, input.horizon),
        // Soft-deleted entities must not be publicly ranked.
        isNull(entities.deletedAt),
      ];

      if (input.regimeTag) {
        conditions.push(eq(scores.regimeTag, input.regimeTag));
      }
      // Filter by entity type in SQL (before LIMIT) so the top N is computed
      // over the requested type, not truncated from a mixed-type top N.
      if (input.entityType) {
        conditions.push(eq(entities.type, input.entityType));
      }

      // Latest as_of_date for this metric AT THIS HORIZON. Probing on the
      // metric alone could select a date that has rows at some other horizon
      // but none at the requested one, yielding an empty board.
      const [latestDate] = await db
        .select({ asOfDate: scores.asOfDate })
        .from(scores)
        .where(
          and(
            eq(scores.metric, input.metric),
            eq(scores.horizon, input.horizon),
          ),
        )
        .orderBy(desc(scores.asOfDate))
        .limit(1);

      if (!latestDate) return [];

      conditions.push(eq(scores.asOfDate, latestDate.asOfDate));
      conditions.push(gte(sample.value, String(MIN_RANKED_OUTCOMES)));

      const rows = await db
        .select({
          entityId: scores.entityId,
          value: scores.value,
          horizon: scores.horizon,
          regimeTag: scores.regimeTag,
          asOfDate: scores.asOfDate,
          sampleSize: sample.value,
          significant: significance.value,
          entityName: entities.displayName,
          entitySlug: entities.slug,
          entityType: entities.type,
          entityAvatar: entities.avatarUrl,
          entityBrokerLinkStatus: entities.brokerLinkStatus,
        })
        .from(scores)
        .innerJoin(entities, eq(scores.entityId, entities.id))
        .innerJoin(sample, sampleRow(input.horizon))
        .leftJoin(significance, significanceRow)
        .where(and(...conditions))
        // Best first: ascending for metrics where lower is better (Brier,
        // drawdown), which descending order listed worst first.
        .orderBy(
          LOWER_IS_BETTER_METRICS.includes(input.metric)
            ? asc(scores.value)
            : desc(scores.value),
        )
        .limit(input.limit);

      return rows.map((row, i) => ({
        rank: i + 1,
        entity: {
          id: row.entityId,
          displayName: row.entityName,
          slug: row.entitySlug,
          type: row.entityType,
          avatarUrl: row.entityAvatar,
          brokerLinkStatus: row.entityBrokerLinkStatus,
        },
        score: parseFloat(row.value),
        horizon: row.horizon,
        regimeTag: row.regimeTag,
        sampleSize: parseFloat(row.sampleSize),
        isSignificant: parseFloat(row.significant ?? "0") === 1,
        // Surfaced so a caller can tell whether it is looking at a current
        // board or a stale one from a previous scoring run.
        asOfDate: row.asOfDate,
      }));
    }),

  /**
   * Top entities for a specific instrument by hit rate on it, with at least
   * MIN_TICKER_SAMPLE outcomes there (see topByInstrument).
   */
  byTicker: memberProcedure
    .input(
      z.object({
        ticker: z.string().min(1),
        entityType: z.enum(["player", "guide"]).optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      const [instrument] = await db
        .select({ id: instruments.id })
        .from(instruments)
        .where(eq(instruments.ticker, input.ticker.toUpperCase()))
        .limit(1);

      if (!instrument) return [];

      return topByInstrument(db, instrument.id, {
        entityType: input.entityType,
        limit: input.limit,
      });
    }),

  /**
   * Best entities in current market conditions.
   * Auto-detects regime and returns top entities by EIV within that regime,
   * among those with at least MIN_RANKED_OUTCOMES scored outcomes.
   */
  bestInCurrentConditions: memberProcedure
    .input(
      z.object({
        entityType: z.enum(["player", "guide"]).optional(),
        limit: z.number().min(1).max(25).default(5),
      }),
    )
    .query(async ({ input }) => {
      // The latest stored regime snapshot; never computed on a page view.
      const snapshot = await getLatestMarketRegime();
      if (!snapshot) return { regime: null, entities: [] };
      const currentRegime = snapshot.regime;

      // Query the regime-tagged "eiv" row, NOT "eiv_overall".
      //
      // score.ts writes eiv_overall with regimeTag null and writes "eiv" with
      // horizon "all" plus the regime tag. Filtering eiv_overall on
      // regime_tag = currentRegime therefore compared NULL to a string, which
      // is never true in SQL — and because the latestDate probe below shares
      // these conditions, this endpoint returned an empty list unconditionally
      // and had never surfaced a single row.
      const conditions = [
        eq(scores.metric, "eiv"),
        eq(scores.horizon, "all"),
        eq(scores.regimeTag, currentRegime),
      ];

      // Get latest date with this regime+metric combo (across all types, so
      // the as-of date is computed over the whole regime leaderboard).
      const [latestDate] = await db
        .select({ asOfDate: scores.asOfDate })
        .from(scores)
        .where(and(...conditions))
        .orderBy(desc(scores.asOfDate))
        .limit(1);

      if (!latestDate) return { regime: currentRegime, entities: [] };

      conditions.push(eq(scores.asOfDate, latestDate.asOfDate));
      // Entity-table predicates are added only AFTER the latestDate probe
      // above, which selects from `scores` alone and would produce invalid SQL
      // if it referenced `entities`. Both are applied before LIMIT so the
      // result is the best N of the requested type, not a truncated mixed set.
      conditions.push(isNull(entities.deletedAt));
      conditions.push(gte(sample.value, String(MIN_RANKED_OUTCOMES)));
      if (input.entityType) {
        conditions.push(eq(entities.type, input.entityType));
      }

      const rows = await db
        .select({
          entityId: scores.entityId,
          value: scores.value,
          sampleSize: sample.value,
          entityName: entities.displayName,
          entitySlug: entities.slug,
          entityType: entities.type,
          entityAvatar: entities.avatarUrl,
        })
        .from(scores)
        .innerJoin(entities, eq(scores.entityId, entities.id))
        .innerJoin(sample, sampleRow("all"))
        .where(and(...conditions))
        .orderBy(desc(scores.value))
        .limit(input.limit);

      return {
        regime: currentRegime,
        entities: rows.map((row, i) => ({
          rank: i + 1,
          entity: {
            id: row.entityId,
            displayName: row.entityName,
            slug: row.entitySlug,
            type: row.entityType,
            avatarUrl: row.entityAvatar,
          },
          eivScore: parseFloat(row.value),
          sampleSize: parseFloat(row.sampleSize),
        })),
      };
    }),
});

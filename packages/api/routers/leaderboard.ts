import { z } from "zod";
import { memberProcedure, router } from "../trpc";
import { alias } from "drizzle-orm/pg-core";
import { db, desc, asc, eq, gte, and, isNull } from "@deepmint/db";
import { scores, entities, instruments } from "@deepmint/db/schema";
import {
  LOWER_IS_BETTER_METRICS,
  MIN_RANKED_OUTCOMES,
  RETURN_METRICS,
} from "@deepmint/shared";
import type { MarketRegime } from "@deepmint/scoring";
import { topByInstrument } from "../lib/topByInstrument";

// The scorer's rows beside each ranked score: its entity's sample at that
// horizon on that date, and whether the pooled hit rate cleared the z-test.
const sample = alias(scores, "sample");
const significance = alias(scores, "significance");
// An entity's outcome count in the regime its EIV row is tagged with.
const regimeSample = alias(scores, "regime_sample");

// The sample behind a metric: a return board leaves out neutral claims, or
// nine of them would carry one lucky position over the floor.
const sampleRow = (metric: string, horizon: string) =>
  and(
    eq(sample.entityId, scores.entityId),
    eq(sample.asOfDate, scores.asOfDate),
    eq(
      sample.metric,
      RETURN_METRICS.includes(metric) ? "position_count" : "outcome_count",
    ),
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
        .innerJoin(sample, sampleRow(input.metric, input.horizon))
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
   * Best entities in the latest scoring run's market regime, by their EIV
   * from the outcomes entered in that regime (the scorer writes one only
   * when there are at least MIN_REGIME_OUTCOMES), among those with at least
   * MIN_RANKED_OUTCOMES scored outcomes in all. Only the latest run counts,
   * and its date is returned with it: an older run would describe
   * conditions that may have passed.
   */
  bestInCurrentConditions: memberProcedure
    .input(
      z.object({
        entityType: z.enum(["player", "guide"]).optional(),
        limit: z.number().min(1).max(25).default(5),
      }),
    )
    .query(async ({ input }) => {
      // The latest scoring run: it writes eiv_overall for every entity it
      // scores, whether or not any of them has a record in the regime.
      const [latestRun] = await db
        .select({ asOfDate: scores.asOfDate })
        .from(scores)
        .where(and(eq(scores.metric, "eiv_overall"), eq(scores.horizon, "all")))
        .orderBy(desc(scores.asOfDate))
        .limit(1);
      if (!latestRun) return { regime: null, asOfDate: null, entities: [] };

      // The regime that run scored in, from its regime-tagged "eiv" rows.
      // eiv_overall carries no tag.
      const [tagged] = await db
        .select({ regimeTag: scores.regimeTag })
        .from(scores)
        .where(
          and(
            eq(scores.metric, "eiv"),
            eq(scores.horizon, "all"),
            eq(scores.asOfDate, latestRun.asOfDate),
          ),
        )
        .orderBy(desc(scores.computedAt))
        .limit(1);
      if (!tagged?.regimeTag) {
        return { regime: null, asOfDate: latestRun.asOfDate, entities: [] };
      }

      // Both floors apply before LIMIT: the board's sample floor on all
      // outcomes, and the regime's sample, which is the n shown.
      const conditions = [
        eq(scores.metric, "eiv"),
        eq(scores.horizon, "all"),
        eq(scores.regimeTag, tagged.regimeTag),
        eq(scores.asOfDate, latestRun.asOfDate),
        isNull(entities.deletedAt),
        gte(sample.value, String(MIN_RANKED_OUTCOMES)),
      ];
      if (input.entityType) {
        conditions.push(eq(entities.type, input.entityType));
      }

      const rows = await db
        .select({
          entityId: scores.entityId,
          value: scores.value,
          sampleSize: regimeSample.value,
          entityName: entities.displayName,
          entitySlug: entities.slug,
          entityType: entities.type,
          entityAvatar: entities.avatarUrl,
        })
        .from(scores)
        .innerJoin(entities, eq(scores.entityId, entities.id))
        .innerJoin(sample, sampleRow("eiv", "all"))
        .innerJoin(
          regimeSample,
          and(
            eq(regimeSample.entityId, scores.entityId),
            eq(regimeSample.asOfDate, scores.asOfDate),
            eq(regimeSample.metric, "regime_outcome_count"),
            eq(regimeSample.horizon, "all"),
            eq(regimeSample.regimeTag, scores.regimeTag),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(scores.value))
        .limit(input.limit);

      return {
        regime: tagged.regimeTag as MarketRegime,
        asOfDate: latestRun.asOfDate,
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

import { inngest } from "../inngest";
import { db, eq, sql, gte } from "@deepmint/db";
import { influenceEvents, influenceScores, entities } from "@deepmint/db/schema";

/**
 * Influence aggregation worker: triggered by scoring/completed event.
 * Aggregates influence data per Guide for the last 30 days.
 * Upserts into influence_scores table.
 */
export const influenceAggregateFunction = inngest.createFunction(
  {
    id: "influence-aggregate",
    retries: 2,
    triggers: [{ event: "scoring/completed" }],
  },
  async ({ step }) => {
    const result = await step.run("aggregate-influence", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

      // Get all guides who have influence events in last 30d
      const guideStats = await db
        .select({
          guideEntityId: influenceEvents.guideEntityId,
          totalEvents: sql<number>`count(*)::int`,
          uniquePlayers: sql<number>`count(DISTINCT ${influenceEvents.playerEntityId})::int`,
          avgLag: sql<string>`avg(${influenceEvents.lagHours})`,
        })
        .from(influenceEvents)
        .where(gte(influenceEvents.detectedAt, thirtyDaysAgo))
        .groupBy(influenceEvents.guideEntityId);

      let upserted = 0;

      for (const stat of guideStats) {
        // Get top instruments (by event count)
        const topInstrumentRows = await db
          .select({
            instrumentId: influenceEvents.instrumentId,
            count: sql<number>`count(*)::int`,
          })
          .from(influenceEvents)
          .where(
            sql`${influenceEvents.guideEntityId} = ${stat.guideEntityId}
                AND ${influenceEvents.detectedAt} >= ${thirtyDaysAgo}`,
          )
          .groupBy(influenceEvents.instrumentId)
          .orderBy(sql`count(*) DESC`)
          .limit(5);

        const topInstruments = topInstrumentRows.map((r) => r.instrumentId);

        // Delete existing score for this guide+date, then insert
        await db
          .delete(influenceScores)
          .where(
            sql`${influenceScores.guideEntityId} = ${stat.guideEntityId}
                AND ${influenceScores.asOfDate} = ${today}`,
          );

        await db.insert(influenceScores).values({
          guideEntityId: stat.guideEntityId,
          followerCount: stat.uniquePlayers,
          influenceEvents30d: stat.totalEvents,
          avgLagHours: stat.avgLag ? parseFloat(stat.avgLag).toFixed(2) : null,
          topInstruments,
          asOfDate: today,
        });

        upserted++;
      }

      console.log(
        `[influence-aggregate] ${upserted} guide influence scores upserted`,
      );
      return { upserted };
    });

    return result;
  },
);

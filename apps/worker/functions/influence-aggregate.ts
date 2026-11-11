import { inngest } from "../inngest";
import { db, eq, and, sql, gte } from "@deepmint/db";
import { influenceEvents, influenceScores, entities, claims } from "@deepmint/db/schema";

/**
 * Influence aggregation worker: runs after scoring and every day at 18:30 US
 * Eastern, so the 30-day window moves on days when no claim matures.
 * Aggregates influence data per Guide for the last 30 days.
 * Upserts into influence_scores table.
 */
export const influenceAggregateFunction = inngest.createFunction(
  {
    id: "influence-aggregate",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [
      { event: "scoring/completed" },
      { cron: "TZ=America/New_York 30 18 * * *" },
    ],
  },
  async ({ step }) => {
    const result = await step.run("aggregate-influence", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

      // Events from the last 30 days that still count: both claims active and
      // the credited entity a Guide. Rows recorded before those rules were
      // enforced may break them. A deleted Guide keeps its influence, as it
      // keeps its rank (D18).
      const counted = and(
        gte(influenceEvents.detectedAt, thirtyDaysAgo),
        sql`exists (select 1 from ${claims} where ${claims.id} = ${influenceEvents.guideClaimId} and ${claims.status} = 'active')`,
        sql`(${influenceEvents.playerClaimId} is null or exists (select 1 from ${claims} where ${claims.id} = ${influenceEvents.playerClaimId} and ${claims.status} = 'active'))`,
        sql`exists (select 1 from ${entities} where ${entities.id} = ${influenceEvents.guideEntityId} and ${entities.type} = 'guide')`,
      );

      // Get all guides who have influence events in last 30d
      const guideStats = await db
        .select({
          guideEntityId: influenceEvents.guideEntityId,
          totalEvents: sql<number>`count(*)::int`,
          uniquePlayers: sql<number>`count(DISTINCT ${influenceEvents.playerEntityId})::int`,
          avgLag: sql<string>`avg(${influenceEvents.lagHours})`,
        })
        .from(influenceEvents)
        .where(counted)
        .groupBy(influenceEvents.guideEntityId);

      // Replace the score for this guide+date in one transaction
      const replaceScore = (values: typeof influenceScores.$inferInsert) =>
        db.transaction(async (tx) => {
          await tx
            .delete(influenceScores)
            .where(
              sql`${influenceScores.guideEntityId} = ${values.guideEntityId}
                  AND ${influenceScores.asOfDate} = ${today}`,
            );

          await tx.insert(influenceScores).values(values);
        });

      let upserted = 0;

      for (const stat of guideStats) {
        // Get top instruments (by event count)
        const topInstrumentRows = await db
          .select({
            instrumentId: influenceEvents.instrumentId,
            count: sql<number>`count(*)::int`,
          })
          .from(influenceEvents)
          .where(and(eq(influenceEvents.guideEntityId, stat.guideEntityId), counted))
          .groupBy(influenceEvents.instrumentId)
          .orderBy(sql`count(*) DESC`)
          .limit(5);

        const topInstruments = topInstrumentRows.map((r) => r.instrumentId);

        await replaceScore({
          guideEntityId: stat.guideEntityId,
          followerCount: stat.uniquePlayers,
          influenceEvents30d: stat.totalEvents,
          avgLagHours: stat.avgLag ? parseFloat(stat.avgLag).toFixed(2) : null,
          topInstruments,
          asOfDate: today,
        });

        upserted++;
      }

      // A Guide whose window has emptied gets a zero row, so its old figures
      // stop being the latest.
      const counted30d = new Set(guideStats.map((s) => s.guideEntityId));
      const knownGuides = await db
        .selectDistinct({ guideEntityId: influenceScores.guideEntityId })
        .from(influenceScores);

      for (const { guideEntityId } of knownGuides) {
        if (counted30d.has(guideEntityId)) continue;
        await replaceScore({
          guideEntityId,
          followerCount: 0,
          influenceEvents30d: 0,
          avgLagHours: null,
          topInstruments: [],
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

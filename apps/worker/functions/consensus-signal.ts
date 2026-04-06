import { inngest } from "../inngest";
import { db, eq, sql, gte, desc } from "@deepmint/db";
import {
  claims,
  entities,
  instruments,
  scores,
  consensusSignals,
} from "@deepmint/db/schema";
import { computeConsensusSignal } from "@deepmint/scoring";
import type { ClaimWithWeight } from "@deepmint/scoring";

/**
 * Consensus signal worker: triggered by scoring/completed event.
 * Computes weighted consensus signals for all Mag 7 instruments.
 */
export const consensusSignalFunction = inngest.createFunction(
  {
    id: "consensus-signal",
    retries: 2,
    triggers: [{ event: "scoring/completed" }],
  },
  async ({ step }) => {
    const result = await step.run("compute-consensus-signals", async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);

      // Get all active instruments (Mag 7)
      const allInstruments = await db
        .select({ id: instruments.id, ticker: instruments.ticker })
        .from(instruments)
        .where(eq(instruments.isActive, true));

      let computed = 0;

      for (const instrument of allInstruments) {
        // Get active claims for this instrument (from last 90 days)
        const ninetyDaysAgo = new Date(today.getTime() - 90 * 86400000);

        const activeClaims = await db
          .select({
            direction: claims.direction,
            entityId: claims.entityId,
            confidence: claims.confidence,
            horizonDays: claims.horizonDays,
            createdAt: claims.createdAt,
          })
          .from(claims)
          .where(
            sql`${claims.instrumentId} = ${instrument.id} AND ${claims.status} = 'active' AND ${claims.createdAt} >= ${ninetyDaysAgo}`
          );

        if (activeClaims.length === 0) continue;

        // Get entity data for weighting
        const entityIds = [...new Set(activeClaims.map((c) => c.entityId))];
        const entityRows = await db
          .select({
            id: entities.id,
            type: entities.type,
            brokerLinkStatus: entities.brokerLinkStatus,
          })
          .from(entities)
          .where(
            sql`${entities.id} IN (${sql.join(entityIds.map(id => sql`${id}`), sql`, `)})`
          );

        const entityMap = new Map(entityRows.map((e) => [e.id, e]));

        // Get latest EIV scores for weighting
        const scoreRows = await db
          .select({
            entityId: scores.entityId,
            value: scores.value,
          })
          .from(scores)
          .where(
            sql`${scores.entityId} IN (${sql.join(entityIds.map(id => sql`${id}`), sql`, `)}) AND ${scores.metric} = 'eiv_overall'`
          )
          .orderBy(desc(scores.asOfDate));

        const scoreMap = new Map<string, number>();
        for (const s of scoreRows) {
          if (!scoreMap.has(s.entityId)) {
            scoreMap.set(s.entityId, parseFloat(s.value));
          }
        }

        // Build weighted claims
        const weightedClaims: ClaimWithWeight[] = activeClaims.map((c) => {
          const entity = entityMap.get(c.entityId);
          const ageHours =
            (today.getTime() - new Date(c.createdAt).getTime()) / (1000 * 3600);

          return {
            direction: c.direction,
            entityType: entity?.type ?? "player",
            entityScore: scoreMap.get(c.entityId) ?? 1,
            hasBrokerVerification: entity?.brokerLinkStatus === "verified",
            confidence: c.confidence,
            horizonDays: c.horizonDays,
            ageHours,
          };
        });

        const signal = computeConsensusSignal(weightedClaims);

        // Upsert consensus signal
        // Delete existing signal for this instrument+date, then insert
        await db
          .delete(consensusSignals)
          .where(
            sql`${consensusSignals.instrumentId} = ${instrument.id} AND ${consensusSignals.asOfDate} = ${todayStr}`
          );

        await db.insert(consensusSignals).values({
          instrumentId: instrument.id,
          direction: signal.direction,
          longCount: signal.longCount,
          shortCount: signal.shortCount,
          neutralCount: signal.neutralCount,
          weightedBullishScore: signal.bullishScore.toFixed(6),
          weightedBearishScore: signal.bearishScore.toFixed(6),
          weightedNeutralScore: signal.neutralScore.toFixed(6),
          convictionStrength: signal.convictionStrength.toFixed(4),
          activeClaims: weightedClaims.length,
          asOfDate: todayStr,
        });

        computed++;
      }

      console.log(
        `[consensus-signal] Done: ${computed} instruments computed`
      );
      return { computed };
    });

    return result;
  }
);

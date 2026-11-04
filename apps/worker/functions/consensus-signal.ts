import { inngest } from "../inngest";
import { db, eq, and, inArray, sql, desc } from "@deepmint/db";
import {
  claims,
  entities,
  instruments,
  scores,
  consensusSignals,
} from "@deepmint/db/schema";
import { computeConsensusSignal, computeTargetStats } from "@deepmint/scoring";
import type { ClaimWithWeight } from "@deepmint/scoring";

/**
 * Consensus signal worker: runs after scoring and every day at 18:30 US
 * Eastern, so decay and the live-claim window move on days when no claim
 * matures. Computes weighted consensus signals for all Mag 7 instruments.
 */
export const consensusSignalFunction = inngest.createFunction(
  {
    id: "consensus-signal",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [
      { event: "scoring/completed" },
      { cron: "TZ=America/New_York 30 18 * * *" },
    ],
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
        // Active claims whose horizon is still running. The cutoff is computed
        // in SQL: a JS Date bound inside raw SQL bypasses drizzle's column
        // mapping and fails in the driver (this query used to bind one, so
        // every run threw).
        const activeClaims = await db
          .select({
            direction: claims.direction,
            entityId: claims.entityId,
            confidence: claims.confidence,
            horizonDays: claims.horizonDays,
            targetPriceCents: claims.targetPriceCents,
            createdAt: claims.createdAt,
          })
          .from(claims)
          .where(
            and(
              eq(claims.instrumentId, instrument.id),
              eq(claims.status, "active"),
              sql`${claims.createdAt} + ${claims.horizonDays} * interval '1 day' > now()`,
            ),
          );

        // No live claims still writes a row (zero counts, neutral), so an
        // expired signal stops being the latest one.

        // Get entity data for weighting
        const entityIds = [...new Set(activeClaims.map((c) => c.entityId))];
        const entityRows = await db
          .select({
            id: entities.id,
            type: entities.type,
            brokerLinkStatus: entities.brokerLinkStatus,
          })
          .from(entities)
          .where(inArray(entities.id, entityIds));

        const entityMap = new Map(entityRows.map((e) => [e.id, e]));

        // Get latest EIV scores for weighting
        const scoreRows = await db
          .select({
            entityId: scores.entityId,
            value: scores.value,
          })
          .from(scores)
          .where(and(inArray(scores.entityId, entityIds), eq(scores.metric, "eiv_overall")))
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
            targetPriceCents: c.targetPriceCents,
          };
        });

        const signal = computeConsensusSignal(weightedClaims);
        const targets = computeTargetStats(weightedClaims);

        // Replace the signal for this instrument+date in one transaction
        await db.transaction(async (tx) => {
          await tx
            .delete(consensusSignals)
            .where(
              sql`${consensusSignals.instrumentId} = ${instrument.id} AND ${consensusSignals.asOfDate} = ${todayStr}`
            );

          await tx.insert(consensusSignals).values({
            instrumentId: instrument.id,
            direction: signal.direction,
            longCount: signal.longCount,
            shortCount: signal.shortCount,
            neutralCount: signal.neutralCount,
            weightedBullishScore: signal.bullishScore.toFixed(6),
            weightedBearishScore: signal.bearishScore.toFixed(6),
            weightedNeutralScore: signal.neutralScore.toFixed(6),
            convictionStrength: signal.convictionStrength.toFixed(4),
            avgTargetPriceCents: targets.avgTargetPriceCents,
            targetDispersionBps: targets.targetDispersionBps,
            // The claims the signal actually counted.
            activeClaims: signal.longCount + signal.shortCount + signal.neutralCount,
            asOfDate: todayStr,
          });
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

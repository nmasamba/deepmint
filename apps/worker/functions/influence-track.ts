import { inngest } from "../inngest";
import { db, eq, sql, and, gte } from "@deepmint/db";
import {
  claims,
  follows,
  influenceEvents,
  entities,
} from "@deepmint/db/schema";

const WINDOW_HOURS = 48;

/**
 * Influence tracking worker: triggered by claims/created event.
 * Detects when a Player's action correlates with a followed Guide's claim
 * (or vice versa) within a 48-hour window.
 */
export const influenceTrackFunction = inngest.createFunction(
  {
    id: "influence-track",
    retries: 2,
    triggers: [{ event: "claims/created" }],
  },
  async ({ event, step }) => {
    const { claimId, entityId, instrumentId, direction } = event.data;

    const result = await step.run("detect-influence", async () => {
      // Get entity type
      const [entity] = await db
        .select({ type: entities.type })
        .from(entities)
        .where(eq(entities.id, entityId))
        .limit(1);

      if (!entity) return { eventsCreated: 0 };

      const windowStart = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000);
      let eventsCreated = 0;

      if (entity.type === "guide") {
        // Guide made a claim — check if any following Players have claims
        // on the same instrument in the last 48h AFTER this claim
        // Since this event fires immediately, we check Players who acted
        // on the same instrument recently (they may have anticipated the guide)
        // Actually per spec: check if Players who follow this Guide have claims
        // on same instrument in last 48h
        const playerFollowers = await db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(eq(follows.followedId, entityId));

        if (playerFollowers.length === 0) return { eventsCreated: 0 };

        const followerIds = playerFollowers.map((f) => f.followerId);

        // Find player claims on same instrument within window
        const playerClaims = await db
          .select()
          .from(claims)
          .where(
            sql`${claims.entityId} IN (${sql.join(followerIds.map(id => sql`${id}`), sql`, `)})
                AND ${claims.instrumentId} = ${instrumentId}
                AND ${claims.createdAt} >= ${windowStart}
                AND ${claims.id} != ${claimId}`
          );

        for (const pc of playerClaims) {
          // Player acted after guide's claim? We use the claim's createdAt
          const guideClaim = await db
            .select({ createdAt: claims.createdAt })
            .from(claims)
            .where(eq(claims.id, claimId))
            .limit(1);

          if (!guideClaim[0]) continue;

          const lagMs = new Date(pc.createdAt).getTime() - new Date(guideClaim[0].createdAt).getTime();
          if (lagMs <= 0) continue;
          const lagHours = lagMs / (1000 * 3600);
          if (lagHours > WINDOW_HOURS) continue;

          await db.insert(influenceEvents).values({
            guideEntityId: entityId,
            guideClaimId: claimId,
            playerEntityId: pc.entityId,
            playerClaimId: pc.id,
            instrumentId,
            lagHours: (Math.round(lagHours * 100) / 100).toString(),
            directionMatch: direction === pc.direction,
          });
          eventsCreated++;
        }
      } else {
        // Player made a claim — check if any Guide they follow made a claim
        // on same instrument in preceding 48h
        const guidesFollowed = await db
          .select({ followedId: follows.followedId })
          .from(follows)
          .where(eq(follows.followerId, entityId));

        if (guidesFollowed.length === 0) return { eventsCreated: 0 };

        const guideIds = guidesFollowed.map((f) => f.followedId);

        const guideClaims = await db
          .select()
          .from(claims)
          .where(
            sql`${claims.entityId} IN (${sql.join(guideIds.map(id => sql`${id}`), sql`, `)})
                AND ${claims.instrumentId} = ${instrumentId}
                AND ${claims.createdAt} >= ${windowStart}
                AND ${claims.id} != ${claimId}`
          );

        for (const gc of guideClaims) {
          // Player acted after guide's claim
          const playerClaimTime = new Date(); // claim was just created
          const lagMs = playerClaimTime.getTime() - new Date(gc.createdAt).getTime();
          if (lagMs <= 0) continue;
          const lagHours = lagMs / (1000 * 3600);
          if (lagHours > WINDOW_HOURS) continue;

          await db.insert(influenceEvents).values({
            guideEntityId: gc.entityId,
            guideClaimId: gc.id,
            playerEntityId: entityId,
            playerClaimId: claimId,
            instrumentId,
            lagHours: (Math.round(lagHours * 100) / 100).toString(),
            directionMatch: direction === gc.direction,
          });
          eventsCreated++;
        }
      }

      console.log(
        `[influence-track] ${eventsCreated} influence events detected for claim ${claimId}`,
      );
      return { eventsCreated };
    });

    return result;
  },
);

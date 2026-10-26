import { inngest } from "../inngest";
import { db, eq, and, gt, gte, lt, lte, inArray, isNull } from "@deepmint/db";
import {
  claims,
  follows,
  influenceEvents,
  entities,
} from "@deepmint/db/schema";
import { detectInfluenceEvents } from "@deepmint/scoring";
import type { GuideClaimWindow, PlayerAction } from "@deepmint/scoring";

const WINDOW_HOURS = 48;

/**
 * Influence tracking worker: triggered by claims/created event.
 * Records when a Player's claim follows, within 48 hours, an active claim on
 * the same instrument by a Guide that Player follows. A Guide's claim looks
 * forward to its Player followers' claims; a Player's claim looks back at
 * the Guides it follows. Players follow only Guides here: following another
 * Player records nothing.
 */
export const influenceTrackFunction = inngest.createFunction(
  {
    id: "influence-track",
    retries: 2,
    triggers: [{ event: "claims/created" }],
  },
  async ({ event, step }) => {
    const { claimId, entityId } = event.data;

    const result = await step.run("detect-influence", async () => {
      const [entity] = await db
        .select({ type: entities.type })
        .from(entities)
        .where(eq(entities.id, entityId))
        .limit(1);

      // The stored claim anchors the window (not wall-clock now, which drifts
      // with the delay before this worker runs). A claim held for review or
      // rejected records no influence.
      const [claim] = await db
        .select({
          instrumentId: claims.instrumentId,
          direction: claims.direction,
          status: claims.status,
          createdAt: claims.createdAt,
        })
        .from(claims)
        .where(eq(claims.id, claimId))
        .limit(1);

      if (!entity || !claim || claim.status !== "active") {
        return { eventsCreated: 0 };
      }

      const claimTime = new Date(claim.createdAt);
      const windowMs = WINDOW_HOURS * 3600 * 1000;
      const followGraph = new Map<string, Set<string>>();
      let guideClaims: GuideClaimWindow[];
      let playerActions: PlayerAction[];

      if (entity.type === "guide") {
        // Players following this Guide who made an active claim on the same
        // instrument within 48 h after this one.
        const followers = await db
          .select({ id: follows.followerId })
          .from(follows)
          .innerJoin(entities, eq(follows.followerId, entities.id))
          .where(
            and(
              eq(follows.followedId, entityId),
              eq(entities.type, "player"),
              isNull(entities.deletedAt),
            ),
          );
        if (followers.length === 0) return { eventsCreated: 0 };
        for (const f of followers) followGraph.set(f.id, new Set([entityId]));

        guideClaims = [
          {
            claimId,
            entityId,
            instrumentId: claim.instrumentId,
            direction: claim.direction,
            createdAt: claimTime,
          },
        ];
        const later = await db
          .select({
            id: claims.id,
            entityId: claims.entityId,
            direction: claims.direction,
            createdAt: claims.createdAt,
          })
          .from(claims)
          .where(
            and(
              inArray(claims.entityId, followers.map((f) => f.id)),
              eq(claims.instrumentId, claim.instrumentId),
              eq(claims.status, "active"),
              gt(claims.createdAt, claimTime),
              lte(claims.createdAt, new Date(claimTime.getTime() + windowMs)),
            ),
          );
        playerActions = later.map((c) => ({
          entityId: c.entityId,
          claimId: c.id,
          instrumentId: claim.instrumentId,
          direction: c.direction,
          createdAt: new Date(c.createdAt),
        }));
      } else {
        // Guides this Player follows, and their active claims on the same
        // instrument within 48 h before this one.
        const guides = await db
          .select({ id: follows.followedId })
          .from(follows)
          .innerJoin(entities, eq(follows.followedId, entities.id))
          .where(
            and(
              eq(follows.followerId, entityId),
              eq(entities.type, "guide"),
              isNull(entities.deletedAt),
            ),
          );
        if (guides.length === 0) return { eventsCreated: 0 };
        followGraph.set(entityId, new Set(guides.map((g) => g.id)));

        const earlier = await db
          .select({
            id: claims.id,
            entityId: claims.entityId,
            direction: claims.direction,
            createdAt: claims.createdAt,
          })
          .from(claims)
          .where(
            and(
              inArray(claims.entityId, guides.map((g) => g.id)),
              eq(claims.instrumentId, claim.instrumentId),
              eq(claims.status, "active"),
              gte(claims.createdAt, new Date(claimTime.getTime() - windowMs)),
              lt(claims.createdAt, claimTime),
            ),
          );
        guideClaims = earlier.map((c) => ({
          claimId: c.id,
          entityId: c.entityId,
          instrumentId: claim.instrumentId,
          direction: c.direction,
          createdAt: new Date(c.createdAt),
        }));
        playerActions = [
          {
            entityId,
            claimId,
            instrumentId: claim.instrumentId,
            direction: claim.direction,
            createdAt: claimTime,
          },
        ];
      }

      const detected = detectInfluenceEvents(
        guideClaims,
        playerActions,
        followGraph,
        WINDOW_HOURS,
      );
      if (detected.length === 0) return { eventsCreated: 0 };

      // Skip pairs already recorded: a retry of this run, or the same pair
      // found earlier from the other claim's side.
      const recorded = await db
        .select({
          guideClaimId: influenceEvents.guideClaimId,
          playerClaimId: influenceEvents.playerClaimId,
        })
        .from(influenceEvents)
        .where(
          and(
            inArray(influenceEvents.guideClaimId, detected.map((d) => d.guideClaimId)),
            inArray(influenceEvents.playerClaimId, detected.map((d) => d.playerClaimId!)),
          ),
        );
      const seen = new Set(recorded.map((r) => `${r.guideClaimId}|${r.playerClaimId}`));
      const fresh = detected.filter(
        (d) => !seen.has(`${d.guideClaimId}|${d.playerClaimId}`),
      );

      if (fresh.length > 0) {
        await db.insert(influenceEvents).values(
          fresh.map((d) => ({
            guideEntityId: d.guideEntityId,
            guideClaimId: d.guideClaimId,
            playerEntityId: d.playerEntityId,
            playerClaimId: d.playerClaimId ?? null,
            instrumentId: d.instrumentId,
            lagHours: d.lagHours.toString(),
            directionMatch: d.directionMatch,
          })),
        );
      }

      console.log(
        `[influence-track] ${fresh.length} influence events recorded for claim ${claimId}` +
          (fresh.length < detected.length ? ` (${detected.length - fresh.length} already recorded)` : ""),
      );
      return { eventsCreated: fresh.length };
    });

    return result;
  },
);

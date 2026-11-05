import { inngest } from "../inngest";
import { db, eq } from "@deepmint/db";
import { claims, entities, events, follows, instruments } from "@deepmint/db/schema";
import { createNotification } from "@deepmint/db/queries/createNotification";

/**
 * Claims older than this are not news: a backfill, a late approval or an old
 * post on a newly read feed stays quiet. The post's own date counts, because
 * the ledger dates such a claim the day it was stored.
 */
const MAX_CLAIM_AGE_MS = 2 * 86_400_000;

/**
 * Notify an entity's followers of its new claim (type new_claim_from_follow,
 * which each follower can switch off in Settings).
 * Triggered by claims/created event.
 */
export const notifyFollowersNewClaimFunction = inngest.createFunction(
  {
    id: "notify-followers-new-claim",
    retries: 2,
    triggers: [{ event: "claims/created" }],
  },
  async ({ event, step }) => {
    const { claimId } = event.data;

    return step.run("notify-followers", async () => {
      const [claim] = await db
        .select({
          entityId: claims.entityId,
          status: claims.status,
          direction: claims.direction,
          horizonDays: claims.horizonDays,
          createdAt: claims.createdAt,
          postedAt: events.capturedAt,
          ticker: instruments.ticker,
          authorName: entities.displayName,
        })
        .from(claims)
        .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
        .innerJoin(entities, eq(claims.entityId, entities.id))
        .leftJoin(events, eq(claims.eventId, events.id))
        .where(eq(claims.id, claimId))
        .limit(1);

      if (!claim || claim.status !== "active") return { notified: 0 };
      const datedAt = Math.min(
        claim.createdAt.getTime(),
        claim.postedAt?.getTime() ?? Infinity,
      );
      if (Date.now() - datedAt > MAX_CLAIM_AGE_MS) {
        return { notified: 0, skipped: "claim older than 2 days" };
      }

      const followers = await db
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(eq(follows.followedId, claim.entityId));

      let notified = 0;
      for (const { followerId } of followers) {
        const created = await createNotification({
          entityId: followerId,
          type: "new_claim_from_follow",
          title: `${claim.authorName} made a ${claim.direction} claim on ${claim.ticker}`,
          body: `Horizon: ${claim.horizonDays} day${claim.horizonDays === 1 ? "" : "s"}`,
          metadata: { claimId, ticker: claim.ticker, direction: claim.direction },
        });
        if (created) notified++;
      }
      return { notified };
    });
  },
);

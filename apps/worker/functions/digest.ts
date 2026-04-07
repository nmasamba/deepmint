import { inngest } from "../inngest";
import { db, eq, and, gte, desc, sql, inArray } from "@deepmint/db";
import {
  entities,
  follows,
  claims,
  instruments,
  outcomes,
  emailPreferences,
} from "@deepmint/db/schema";
import { Resend } from "resend";

/**
 * Daily email digest worker.
 * Cron: noon UTC weekdays (~8am ET).
 * Gathers new claims, outcomes, and leaderboard moves from followed entities.
 */
export const digestFunction = inngest.createFunction(
  {
    id: "daily-digest",
    retries: 1,
    triggers: [{ cron: "0 12 * * 1-5" }],
  },
  async ({ step }) => {
    const result = await step.run("send-digests", async () => {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return { skipped: true, reason: "RESEND_API_KEY not set" };
      }

      const resend = new Resend(apiKey);
      const since = new Date();
      since.setHours(since.getHours() - 24);

      // Get all entities that follow someone and have digest enabled
      const followers = await db
        .select({
          entityId: entities.id,
          displayName: entities.displayName,
          clerkUserId: entities.clerkUserId,
        })
        .from(entities)
        .where(sql`${entities.id} IN (SELECT DISTINCT follower_id FROM follows)`);

      let sent = 0;
      let skipped = 0;

      for (const follower of followers) {
        // Check email preferences
        const [prefs] = await db
          .select()
          .from(emailPreferences)
          .where(eq(emailPreferences.entityId, follower.entityId))
          .limit(1);

        if (prefs && !prefs.digestEnabled) {
          skipped++;
          continue;
        }

        // Get followed entity IDs
        const followedRows = await db
          .select({ followedId: follows.followedId })
          .from(follows)
          .where(eq(follows.followerId, follower.entityId));

        const followedIds = followedRows.map(
          (r: { followedId: string }) => r.followedId,
        );

        if (followedIds.length === 0) {
          skipped++;
          continue;
        }

        // Gather new claims from followed entities (last 24 hours)
        const newClaims = await db
          .select({
            claim: claims,
            entity: {
              displayName: entities.displayName,
              slug: entities.slug,
              type: entities.type,
            },
            instrument: {
              ticker: instruments.ticker,
              name: instruments.name,
            },
          })
          .from(claims)
          .innerJoin(entities, eq(claims.entityId, entities.id))
          .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
          .where(
            and(
              inArray(claims.entityId, followedIds),
              eq(claims.status, "active"),
              gte(claims.createdAt, since),
            ),
          )
          .orderBy(desc(claims.createdAt))
          .limit(20);

        // Gather resolved outcomes from followed entities
        const newOutcomes = await db
          .select({
            outcome: outcomes,
            entity: {
              displayName: entities.displayName,
              slug: entities.slug,
            },
            instrument: {
              ticker: instruments.ticker,
            },
          })
          .from(outcomes)
          .innerJoin(claims, eq(outcomes.claimId, claims.id))
          .innerJoin(entities, eq(claims.entityId, entities.id))
          .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
          .where(
            and(
              inArray(claims.entityId, followedIds),
              gte(outcomes.computedAt, since),
            ),
          )
          .orderBy(desc(outcomes.computedAt))
          .limit(20);

        // Skip if nothing to report
        if (newClaims.length === 0 && newOutcomes.length === 0) {
          skipped++;
          continue;
        }

        // Build plain-text email (React Email template can be added later)
        const claimsSection =
          newClaims.length > 0
            ? `NEW PREDICTIONS FROM PEOPLE YOU FOLLOW\n${newClaims
                .map(
                  (c: { entity: { displayName: string }; instrument: { ticker: string }; claim: { direction: string } }) =>
                    `  ${c.entity.displayName} — ${c.claim.direction.toUpperCase()} ${c.instrument.ticker}`,
                )
                .join("\n")}\n\n`
            : "";

        const outcomesSection =
          newOutcomes.length > 0
            ? `RESULTS ARE IN\n${newOutcomes
                .map(
                  (o: { entity: { displayName: string }; instrument: { ticker: string }; outcome: { returnBps: number | null; directionCorrect: boolean | null } }) =>
                    `  ${o.entity.displayName} — ${o.instrument.ticker}: ${o.outcome.returnBps != null ? `${(o.outcome.returnBps / 100).toFixed(1)}%` : "N/A"} (${o.outcome.directionCorrect ? "Correct" : "Incorrect"})`,
                )
                .join("\n")}\n\n`
            : "";

        const body = `Hi ${follower.displayName},\n\nHere's what happened in the last 24 hours:\n\n${claimsSection}${outcomesSection}View your dashboard: https://deepmint.app/dashboard\n\nManage email preferences: https://deepmint.app/settings\n\n— Deepmint`;

        // We need the user's email from Clerk to send.
        // For now, log what would be sent (Clerk email lookup requires separate API call).
        // In production, integrate with Clerk API to get email from clerkUserId.
        if (follower.clerkUserId) {
          try {
            await resend.emails.send({
              from: "Deepmint <digest@deepmint.app>",
              to: `user+${follower.clerkUserId}@deepmint.app`, // placeholder
              subject: `Deepmint Daily: ${newClaims.length} new predictions, ${newOutcomes.length} outcomes`,
              text: body,
            });
            sent++;
          } catch {
            // Log but don't fail the whole batch
            skipped++;
          }
        } else {
          skipped++;
        }
      }

      return { sent, skipped, total: followers.length };
    });

    return result;
  },
);

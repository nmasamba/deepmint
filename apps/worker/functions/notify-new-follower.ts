import { inngest } from "../inngest";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { createNotification } from "@deepmint/db/queries/createNotification";

/**
 * Notify entity when they get a new follower.
 * Triggered by social/followed event.
 */
export const notifyNewFollowerFunction = inngest.createFunction(
  {
    id: "notify-new-follower",
    retries: 2,
    triggers: [{ event: "social/followed" }],
  },
  async ({ event, step }) => {
    const { followedId, followerId } = event.data;

    await step.run("create-notification", async () => {
      // Get follower name
      const [follower] = await db
        .select({ displayName: entities.displayName })
        .from(entities)
        .where(eq(entities.id, followerId))
        .limit(1);

      if (!follower) return;

      await createNotification({
        entityId: followedId,
        type: "new_follower",
        title: `${follower.displayName} started following you`,
        metadata: { followerId },
      });
    });
  },
);

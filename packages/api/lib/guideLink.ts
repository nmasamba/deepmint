import { and, eq, inArray, sql } from "@deepmint/db";
import {
  brokerLinks,
  emailPreferences,
  entities,
  follows,
  notificationPreferences,
  notifications,
  paperPortfolios,
  playerTrades,
  signalSimulatePortfolios,
  tickerRequests,
  watchlists,
} from "@deepmint/db/schema";

type Db = typeof import("@deepmint/db").db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Entity = typeof entities.$inferSelect;

/**
 * Make an ingested Guide a user's account (D16 option 2, linking). Call inside
 * the approval's transaction, with both rows locked.
 *
 * The user's Clerk id moves from their Player entity to the Guide, so they
 * sign in as the Guide from their next request. Their account goes with it:
 * Clerk's name and avatar (D8), their bio and style tags where the Guide has
 * none, their broker link and badge, paper portfolios and the mirrors they
 * run, the watchlist, the follows they made, notifications and settings.
 *
 * The record stays where it was made: claims, notes, events and outcomes are
 * append-only, so the old Player keeps them, with its scores and its name, as
 * a separate profile with no account. Follows and mirrors of that profile by
 * other people stay on it too. Deleting the account later anonymises both
 * (anonymiseEntity follows guide_applications.linked_guide_id).
 */
export async function linkAccountToGuide(tx: Tx, player: Entity, guide: Entity): Promise<void> {
  const now = new Date();
  // clerk_user_id is unique: free it before the Guide takes it.
  await tx
    .update(entities)
    .set({ clerkUserId: null, brokerLinkStatus: "none", snaptradeUserId: null, updatedAt: now })
    .where(eq(entities.id, player.id));
  await tx
    .update(entities)
    .set({
      clerkUserId: player.clerkUserId,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      bio: guide.bio ?? player.bio,
      styleTags: guide.styleTags?.length ? guide.styleTags : player.styleTags,
      brokerLinkStatus: player.brokerLinkStatus,
      snaptradeUserId: player.snaptradeUserId,
      updatedAt: now,
    })
    .where(eq(entities.id, guide.id));

  const move = { entityId: guide.id };
  await tx.update(paperPortfolios).set(move).where(eq(paperPortfolios.entityId, player.id));
  // A mirror the user ran of this Guide would become a mirror of themself,
  // which the app refuses: it stops, and moves with the rest.
  await tx
    .update(signalSimulatePortfolios)
    .set({ isActive: false })
    .where(
      and(
        eq(signalSimulatePortfolios.entityId, player.id),
        eq(signalSimulatePortfolios.followedEntityId, guide.id),
      ),
    );
  await tx
    .update(signalSimulatePortfolios)
    .set(move)
    .where(eq(signalSimulatePortfolios.entityId, player.id));
  await tx.update(brokerLinks).set(move).where(eq(brokerLinks.entityId, player.id));
  await tx.update(playerTrades).set(move).where(eq(playerTrades.entityId, player.id));
  await tx.update(notifications).set(move).where(eq(notifications.entityId, player.id));
  await tx.update(tickerRequests).set(move).where(eq(tickerRequests.entityId, player.id));

  // The watchlist and follows, each once: nothing the Guide already has, and
  // no follow of the Guide itself.
  await tx
    .delete(watchlists)
    .where(
      and(
        eq(watchlists.entityId, player.id),
        inArray(
          watchlists.instrumentId,
          tx
            .select({ id: watchlists.instrumentId })
            .from(watchlists)
            .where(eq(watchlists.entityId, guide.id)),
        ),
      ),
    );
  await tx.update(watchlists).set(move).where(eq(watchlists.entityId, player.id));
  await tx
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, player.id),
        sql`(${follows.followedId} = ${guide.id} or ${follows.followedId} in (select followed_id from follows where follower_id = ${guide.id}))`,
      ),
    );
  await tx
    .update(follows)
    .set({ followerId: guide.id })
    .where(eq(follows.followerId, player.id));

  // The user's settings. An ingested Guide has none, as only an account's
  // owner creates them; one row each is allowed, so any is cleared first.
  for (const table of [emailPreferences, notificationPreferences] as const) {
    await tx.delete(table).where(eq(table.entityId, guide.id));
    await tx.update(table).set(move).where(eq(table.entityId, player.id));
  }
}

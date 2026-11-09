import { randomUUID } from "node:crypto";
import { db, eq, and, ne, sql } from "@deepmint/db";
import {
  entities,
  apiKeys,
  brokerLinks,
  playerTrades,
  signalSimulatePortfolios,
} from "@deepmint/db/schema";

/** What a deleted account is called wherever its record still shows. */
export const DELETED_DISPLAY_NAME = "Deleted user";

export interface AnonymiseResult {
  entityId: string;
  /** deleted-<id>, the profile's address from now on. */
  slug: string;
  /** The account was already deleted; nothing changed. */
  alreadyDeleted: boolean;
  /**
   * The SnapTrade user still to remove there, if any. It stays on the row
   * until clearSnaptradeUser records that SnapTrade deleted it, so a failed or
   * skipped remote delete loses nothing.
   */
  snaptradeUserId: string | null;
  keysRevoked: number;
  brokerLinksClosed: number;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * deleted-<id>, unless another entity already holds it (slugs never change,
 * so someone could have signed up under that name): then a suffixed form.
 */
async function deletedSlug(tx: Tx, id: string): Promise<string> {
  const slug = `deleted-${id}`;
  const [taken] = await tx
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.slug, slug), ne(entities.id, id)))
    .limit(1);
  return taken ? `${slug}-${randomUUID().slice(0, 8)}` : slug;
}

/**
 * Delete an account by anonymising it, in one transaction (D18 option 1). Its
 * claims, outcomes and scores stay, because the ledger is append-only and a
 * record must not be erased by leaving: the entity keeps ranking as "Deleted
 * user" at deleted-<id>. Its name, bio, avatar, style tags and feed are
 * blanked, the API keys it acts through are revoked, its broker links are
 * disconnected with their stored credentials wiped and their imported trades
 * deleted, and its own signal mirrors stop.
 *
 * clerk_user_id is kept, unique as ever, so a late or replayed Clerk event
 * finds this row and changes nothing, and nothing can create a new entity for
 * the deleted user. deleted_at marks the row; a signed-in request for it acts
 * as no one. Running it again changes nothing.
 */
export async function anonymiseEntity(entityId: string): Promise<AnonymiseResult | null> {
  return db.transaction(async (tx) => {
    const [entity] = await tx
      .select()
      .from(entities)
      .where(eq(entities.id, entityId))
      .for("update")
      .limit(1);
    if (!entity) return null;

    if (entity.deletedAt) {
      return {
        entityId,
        slug: entity.slug,
        alreadyDeleted: true,
        snaptradeUserId: entity.snaptradeUserId,
        keysRevoked: 0,
        brokerLinksClosed: 0,
      };
    }

    const now = new Date();
    const slug = await deletedSlug(tx, entity.id);
    await tx
      .update(entities)
      .set({
        displayName: DELETED_DISPLAY_NAME,
        slug,
        bio: null,
        avatarUrl: null,
        styleTags: [],
        sourceUrl: null,
        isAllowlisted: false,
        brokerLinkStatus: "none",
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(entities.id, entityId));

    // Keys that act as this entity. Keys it minted as an admin act as their
    // agents or as no one (package 54), so they stay.
    const keys = await tx
      .update(apiKeys)
      .set({ isActive: false, revokedAt: now })
      .where(and(eq(apiKeys.entityId, entityId), eq(apiKeys.isActive, true)))
      .returning({ id: apiKeys.id });

    const links = await tx
      .update(brokerLinks)
      .set({
        syncStatus: "disconnected",
        disconnectedAt: sql`coalesce(${brokerLinks.disconnectedAt}, now())`,
        isVerified: false,
        metadata: {},
      })
      .where(eq(brokerLinks.entityId, entityId))
      .returning({ id: brokerLinks.id });
    await tx.delete(playerTrades).where(eq(playerTrades.entityId, entityId));

    await tx
      .update(signalSimulatePortfolios)
      .set({ isActive: false })
      .where(eq(signalSimulatePortfolios.entityId, entityId));

    return {
      entityId,
      slug,
      alreadyDeleted: false,
      snaptradeUserId: entity.snaptradeUserId,
      keysRevoked: keys.length,
      brokerLinksClosed: links.length,
    };
  });
}

/**
 * anonymiseEntity for the entity of a Clerk user. A user with no entity yet
 * (user.created can still be on its way: Svix retries arrive in any order)
 * gets a deleted placeholder holding the Clerk id, so a late user.created or
 * user.updated finds it and creates nothing.
 */
export async function anonymiseClerkUser(clerkUserId: string): Promise<AnonymiseResult> {
  const byClerkId = async () =>
    (
      await db
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.clerkUserId, clerkUserId))
        .limit(1)
    )[0];

  const existing = await byClerkId();
  if (existing) return (await anonymiseEntity(existing.id))!;

  const placeholder = await db.transaction(async (tx) => {
    const id = randomUUID();
    const now = new Date();
    const slug = await deletedSlug(tx, id);
    const [row] = await tx
      .insert(entities)
      .values({
        id,
        clerkUserId,
        type: "player",
        displayName: DELETED_DISPLAY_NAME,
        slug,
        styleTags: [],
        deletedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: entities.clerkUserId })
      .returning({ id: entities.id, slug: entities.slug });
    return row;
  });
  if (placeholder) {
    return {
      entityId: placeholder.id,
      slug: placeholder.slug,
      alreadyDeleted: false,
      snaptradeUserId: null,
      keysRevoked: 0,
      brokerLinksClosed: 0,
    };
  }
  // user.created won the race: anonymise the row it made.
  return (await anonymiseEntity((await byClerkId())!.id))!;
}

/** Record that SnapTrade has deleted this entity's user there. */
export async function clearSnaptradeUser(entityId: string): Promise<void> {
  await db
    .update(entities)
    .set({ snaptradeUserId: null })
    .where(eq(entities.id, entityId));
}

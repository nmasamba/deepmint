import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";

/**
 * Whether a signed-in Clerk user's account has been deleted (D18). Pages treat
 * such a viewer as signed out, as tRPC does: while its Clerk session lasts, a
 * deleted account acts as no one.
 */
export async function isDeletedAccount(clerkUserId: string | null): Promise<boolean> {
  if (!clerkUserId) return false;
  const [row] = await db
    .select({ deletedAt: entities.deletedAt })
    .from(entities)
    .where(eq(entities.clerkUserId, clerkUserId))
    .limit(1);
  return !!row?.deletedAt;
}

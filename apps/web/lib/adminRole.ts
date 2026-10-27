import { clerkClient } from "@clerk/nextjs/server";

const ROLE_TTL_MS = 60_000;
const roleCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
const roleLookups = new Map<string, Promise<boolean>>();

function isAdminRole(metadata: unknown): boolean {
  return (metadata as { role?: string } | null | undefined)?.role === "admin";
}

/**
 * Whether a signed-in user is an admin. The role lives in Clerk
 * privateMetadata.role, which never reaches the client.
 *
 * - A `metadata` session claim (the optional session-token customization
 *   `{"metadata": "{{user.private_metadata}}"}`) is trusted whenever present,
 *   for admins and non-admins alike, so no Clerk call is made.
 * - Otherwise the user is fetched once, and the role is cached per user for
 *   60 s in this process; concurrent lookups share one request. Pass the user
 *   if the caller already fetched it.
 * - A failed lookup is logged; the last known role stands, else non-admin.
 */
export async function resolveIsAdmin(
  userId: string | null,
  sessionClaims: Record<string, unknown> | null | undefined,
  fetchedUser?: { privateMetadata: unknown },
): Promise<boolean> {
  if (!userId) return false;
  if (sessionClaims && "metadata" in sessionClaims) {
    return isAdminRole(sessionClaims.metadata);
  }

  if (fetchedUser) {
    const isAdmin = isAdminRole(fetchedUser.privateMetadata);
    roleCache.set(userId, { isAdmin, expiresAt: Date.now() + ROLE_TTL_MS });
    return isAdmin;
  }

  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.isAdmin;
  const pending = roleLookups.get(userId);
  if (pending) return pending;

  const lookup = (async () => {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const isAdmin = isAdminRole(user.privateMetadata);
      roleCache.set(userId, { isAdmin, expiresAt: Date.now() + ROLE_TTL_MS });
      return isAdmin;
    } catch (err) {
      console.error("[adminRole] Clerk getUser failed", { userId, err });
      return cached?.isAdmin ?? false;
    }
  })().finally(() => roleLookups.delete(userId));
  roleLookups.set(userId, lookup);
  return lookup;
}

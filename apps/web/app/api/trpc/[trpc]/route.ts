import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@deepmint/api";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { ensureEntityForClerkUser } from "@deepmint/db/queries/ensureEntityForClerkUser";
import { slugify } from "@deepmint/shared";

async function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const { userId, sessionClaims } = await auth();

      let entity = null;
      if (userId) {
        const [found] = await db
          .select()
          .from(entities)
          .where(eq(entities.clerkUserId, userId))
          .limit(1);
        entity = found ?? null;

        // Self-heal. Entity creation must not depend on a single Clerk webhook
        // delivery succeeding: the endpoint may be unregistered, the signing
        // secret stale, or the account may predate the endpoint entirely — in
        // all of which cases a signed-in user would otherwise have no entity
        // and every protectedProcedure would throw UNAUTHORIZED forever.
        //
        // Only reached when the entity is genuinely missing, so the extra Clerk
        // lookup costs nothing on the normal path. Failure is non-fatal: the
        // request proceeds unauthenticated rather than 500-ing.
        if (!entity) {
          try {
            const client = await clerkClient();
            const user = await client.users.getUser(userId);
            const displayName =
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              user.username ||
              "User";
            entity = await ensureEntityForClerkUser({
              clerkUserId: userId,
              displayName,
              slug: slugify(displayName),
              avatarUrl: user.imageUrl ?? null,
            });
            console.log("[trpc] self-healed missing entity", {
              clerkUserId: userId,
              slug: entity.slug,
            });
          } catch (err) {
            console.error("[trpc] failed to self-heal entity", err);
            entity = null;
          }
        }
      }

      // Admin role is stored in Clerk `privateMetadata` (server-only). Prefer
      // the session-token `metadata` claim if the session-token customization
      // is configured; otherwise fall back to a direct backend lookup so the
      // admin flag works even with a stale token or no customization.
      let isAdmin = false;
      if (userId) {
        const claimMetadata = sessionClaims?.metadata as
          | { role?: string }
          | undefined;
        if (claimMetadata?.role === "admin") {
          isAdmin = true;
        } else {
          try {
            const client = await clerkClient();
            const user = await client.users.getUser(userId);
            const privateRole = (user.privateMetadata as { role?: string })
              ?.role;
            isAdmin = privateRole === "admin";
          } catch {
            isAdmin = false;
          }
        }
      }

      return createContext({ userId, entity, isAdmin });
    },
  });
}

export { handler as GET, handler as POST };

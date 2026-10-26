import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@deepmint/api";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { ensureEntityForClerkUser } from "@deepmint/db/queries/ensureEntityForClerkUser";
import { slugify } from "@deepmint/shared";
import { resolveIsAdmin } from "@/lib/adminRole";

async function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const { userId, sessionClaims } = await auth();

      let entity = null;
      // A Clerk user fetched by the self-heal below, reused for the role.
      let fetchedUser: { privateMetadata: unknown } | undefined;
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
            fetchedUser = user;
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

      // Admin role (Clerk privateMetadata): from the session claim when the
      // token carries one, else one cached backend lookup per user per 60 s.
      const isAdmin = await resolveIsAdmin(userId, sessionClaims, fetchedUser);

      return createContext({ userId, entity, isAdmin });
    },
  });
}

export { handler as GET, handler as POST };

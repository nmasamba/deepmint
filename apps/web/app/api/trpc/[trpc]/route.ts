import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@deepmint/api";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";

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

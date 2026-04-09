import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@deepmint/api";
import { auth } from "@clerk/nextjs/server";
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

      // Check admin role from Clerk publicMetadata
      const publicMetadata =
        (sessionClaims?.publicMetadata as { role?: string } | undefined) ??
        (sessionClaims?.["public_metadata"] as { role?: string } | undefined);
      const isAdmin = publicMetadata?.role === "admin";

      return createContext({ userId, entity, isAdmin });
    },
  });
}

export { handler as GET, handler as POST };

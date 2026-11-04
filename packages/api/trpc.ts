// First: map the prefixed Inngest keys before any router builds its client.
import "./lib/inngestEnv";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { db } from "@deepmint/db";
import type { entities } from "@deepmint/db/schema";

export interface Context {
  db: typeof db;
  userId: string | null;
  entity: (typeof entities.$inferSelect) | null;
  isAdmin: boolean;
  /** Set only by server routes that have checked an API key: REST v1 and MCP. */
  apiKeyVerified: boolean;
}

export function createContext(opts: {
  userId: string | null;
  entity: (typeof entities.$inferSelect) | null;
  isAdmin?: boolean;
  apiKeyVerified?: boolean;
}): Context {
  return {
    db,
    userId: opts.userId,
    entity: opts.entity,
    isAdmin: opts.isAdmin ?? false,
    apiKeyVerified: opts.apiKeyVerified ?? false,
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.entity) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      entity: ctx.entity,
    },
  });
});

/**
 * Leaderboard and profile reads: a signed-in user, or a server route that has
 * checked an API key. The /api/trpc handler never sets apiKeyVerified, so a
 * signed-out visitor is refused there.
 */
export const memberProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId && !ctx.apiKeyVerified) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next();
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.entity) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  if (!ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      entity: ctx.entity,
    },
  });
});

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { db } from "@deepmint/db";
import type { entities } from "@deepmint/db/schema";

export interface Context {
  db: typeof db;
  userId: string | null;
  entity: (typeof entities.$inferSelect) | null;
  isAdmin: boolean;
}

export function createContext(opts: {
  userId: string | null;
  entity: (typeof entities.$inferSelect) | null;
  isAdmin?: boolean;
}): Context {
  return {
    db,
    userId: opts.userId,
    entity: opts.entity,
    isAdmin: opts.isAdmin ?? false,
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
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

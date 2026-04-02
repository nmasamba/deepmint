import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, ilike, asc } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { router, publicProcedure, protectedProcedure } from "../trpc";

export const entityRouter = router({
  /** Get current authenticated user's entity */
  me: protectedProcedure.query(({ ctx }) => {
    if (!ctx.entity) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Entity not found for current user",
      });
    }
    return ctx.entity;
  }),

  /** Get entity by URL slug */
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [entity] = await ctx.db
        .select()
        .from(entities)
        .where(eq(entities.slug, input.slug))
        .limit(1);

      if (!entity) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entity not found",
        });
      }

      return entity;
    }),

  /** Update current user's profile (allowed fields only) */
  update: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        styleTags: z.array(z.string()).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.entity) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entity not found for current user",
        });
      }

      const [updated] = await ctx.db
        .update(entities)
        .set({
          ...(input.displayName !== undefined && {
            displayName: input.displayName,
          }),
          ...(input.bio !== undefined && { bio: input.bio }),
          ...(input.styleTags !== undefined && { styleTags: input.styleTags }),
          updatedAt: new Date(),
        })
        .where(eq(entities.id, ctx.entity.id))
        .returning();

      return updated!;
    }),

  /** Search entities by display name */
  search: publicProcedure
    .input(
      z.object({
        q: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select()
        .from(entities)
        .where(ilike(entities.displayName, `%${input.q}%`))
        .orderBy(asc(entities.displayName))
        .limit(input.limit);

      return results;
    }),
});

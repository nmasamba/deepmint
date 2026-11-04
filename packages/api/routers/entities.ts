import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, ilike, asc, sql, isNull } from "@deepmint/db";
import { entities, claims, outcomes } from "@deepmint/db/schema";
import { publicEntityColumns } from "@deepmint/db/queries/publicEntity";
import {
  PROFILE_BIO_MAX,
  PROFILE_STYLE_TAG_MAX,
  PROFILE_STYLE_TAGS_MAX,
} from "@deepmint/shared";
import { router, publicProcedure, protectedProcedure, memberProcedure } from "../trpc";

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
  bySlug: memberProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [entity] = await ctx.db
        .select(publicEntityColumns)
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

  /**
   * Update the current user's bio and style tags. Name and avatar belong to
   * Clerk and arrive through the user.updated webhook (D8).
   */
  update: protectedProcedure
    .input(
      z.object({
        bio: z.string().trim().max(PROFILE_BIO_MAX).optional(),
        styleTags: z
          .array(z.string().trim().min(1).max(PROFILE_STYLE_TAG_MAX))
          .max(PROFILE_STYLE_TAGS_MAX)
          .optional(),
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
          ...(input.bio !== undefined && { bio: input.bio || null }),
          ...(input.styleTags !== undefined && { styleTags: input.styleTags }),
          updatedAt: new Date(),
        })
        .where(eq(entities.id, ctx.entity.id))
        .returning();

      return updated!;
    }),

  /** Search entities by display name */
  search: memberProcedure
    .input(
      z.object({
        q: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Escape LIKE wildcards so `%` and `_` match themselves.
      const pattern = input.q.replace(/[\\%_]/g, "\\$&");
      const results = await ctx.db
        .select(publicEntityColumns)
        .from(entities)
        .where(ilike(entities.displayName, `%${pattern}%`))
        .orderBy(asc(entities.displayName))
        .limit(input.limit);

      return results;
    }),

  /** Public stats for landing page (claim count, outcome count, entity count). */
  stats: publicProcedure.query(async ({ ctx }) => {
    const [[claimsResult], [outcomesResult], [entitiesResult]] =
      await Promise.all([
        // Only ACTIVE claims are "predictions tracked". A rejected claim is
        // excluded from the feed, markout and scoring — advertising it in the
        // headline count would overstate the ledger (a bare count(*) here
        // showed 2 while the feed correctly showed 1).
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(claims)
          .where(eq(claims.status, "active")),
        // Likewise only outcomes of active claims count as resolved predictions.
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(outcomes)
          .innerJoin(claims, eq(outcomes.claimId, claims.id))
          .where(eq(claims.status, "active")),
        // Soft-deleted entities are excluded everywhere else (leaderboard,
        // consensus); the public headcount must match.
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(entities)
          .where(isNull(entities.deletedAt)),
      ]);

    return {
      claimsCount: claimsResult?.count ?? 0,
      outcomesCount: outcomesResult?.count ?? 0,
      entitiesCount: entitiesResult?.count ?? 0,
    };
  }),
});

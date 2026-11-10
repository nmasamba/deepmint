import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, ilike, asc, ne, sql, isNull } from "@deepmint/db";
import { entities, claims, outcomes } from "@deepmint/db/schema";
import { publicEntityColumns } from "@deepmint/db/queries/publicEntity";
import { anonymiseEntity, clearSnaptradeUser } from "@deepmint/db/queries/anonymiseEntity";
import { deleteUser, getSnapTradeClient } from "../lib/snaptrade";
import {
  PROFILE_BIO_MAX,
  PROFILE_STYLE_TAG_MAX,
  PROFILE_STYLE_TAGS_MAX,
} from "@deepmint/shared";
import {
  router,
  publicProcedure,
  protectedProcedure,
  memberProcedure,
  adminProcedure,
} from "../trpc";

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

      // Not on a deleted account, even one deleted since this request began.
      const [updated] = await ctx.db
        .update(entities)
        .set({
          ...(input.bio !== undefined && { bio: input.bio || null }),
          ...(input.styleTags !== undefined && { styleTags: input.styleTags }),
          updatedAt: new Date(),
        })
        .where(and(eq(entities.id, ctx.entity.id), isNull(entities.deletedAt)))
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "This account has been deleted",
        });
      }

      return updated;
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
        // A deleted account has no name left to find.
        .where(
          and(
            ilike(entities.displayName, `%${pattern}%`),
            isNull(entities.deletedAt),
          ),
        )
        .orderBy(asc(entities.displayName))
        .limit(input.limit);

      return results;
    }),

  /**
   * Admin: delete an account (D18 option 1), for a user whose deletion never
   * arrived from Clerk or who asked an admin, or for an agent. It is
   * anonymised and stays ranked as "Deleted user" (see anonymiseEntity).
   * Clerk is not touched: while the person's Clerk account exists, their
   * signed-in requests act as no one. An ingested Guide is not an account and
   * cannot be deleted this way, and an admin cannot delete themself here.
   */
  adminDelete: adminProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.entityId === ctx.entity.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own account here",
        });
      }
      const [target] = await ctx.db
        .select({
          id: entities.id,
          clerkUserId: entities.clerkUserId,
          isAgent: entities.isAgent,
        })
        .from(entities)
        .where(eq(entities.id, input.entityId))
        .limit(1);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
      }
      if (!target.clerkUserId && !target.isAgent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a user's account or an agent can be deleted, not an ingested Guide",
        });
      }

      const result = (await anonymiseEntity(target.id))!;
      // As broker.disconnect does: remove the user at SnapTrade too. Its id
      // stays on the row until that succeeds.
      if (result.snaptradeUserId && getSnapTradeClient()) {
        try {
          await deleteUser(result.snaptradeUserId);
          await clearSnaptradeUser(result.snaptradeEntityId!);
        } catch (err) {
          console.error("[entity.adminDelete] SnapTrade deleteUser failed", err);
        }
      }
      return {
        slug: result.slug,
        alreadyDeleted: result.alreadyDeleted,
        keysRevoked: result.keysRevoked,
      };
    }),

  /** Admin: every Guide with its feed, those switched on first. */
  adminGuides: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: entities.id,
        displayName: entities.displayName,
        slug: entities.slug,
        sourceUrl: entities.sourceUrl,
        isAllowlisted: entities.isAllowlisted,
      })
      .from(entities)
      .where(and(eq(entities.type, "guide"), isNull(entities.deletedAt)))
      .orderBy(desc(entities.isAllowlisted), asc(entities.displayName)),
  ),

  /**
   * Admin: set a Guide's feed URL and whether the daily ingest reads it. The
   * URL also identifies the Guide to the backfill resolver, so two Guides can
   * never share one.
   */
  adminSetFeed: adminProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        sourceUrl: z
          .string()
          .trim()
          .url()
          .max(500)
          .regex(/^https?:\/\//i, "A feed URL must start with http:// or https://")
          .nullable(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.enabled && !input.sourceUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A feed needs a URL before it can be switched on",
        });
      }

      if (input.sourceUrl) {
        const [taken] = await ctx.db
          .select({ displayName: entities.displayName })
          .from(entities)
          .where(
            and(
              eq(entities.sourceUrl, input.sourceUrl),
              ne(entities.id, input.entityId),
            ),
          )
          .limit(1);
        if (taken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `${taken.displayName} already uses this URL`,
          });
        }
      }

      const [updated] = await ctx.db
        .update(entities)
        .set({
          sourceUrl: input.sourceUrl,
          isAllowlisted: input.enabled,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(entities.id, input.entityId),
            eq(entities.type, "guide"),
            isNull(entities.deletedAt),
          ),
        )
        .returning({
          id: entities.id,
          sourceUrl: entities.sourceUrl,
          isAllowlisted: entities.isAllowlisted,
        });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Guide not found" });
      }

      return updated;
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
        // A deleted account stays ranked as "Deleted user" (D18), but the
        // headcount counts only the people and Guides still here.
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

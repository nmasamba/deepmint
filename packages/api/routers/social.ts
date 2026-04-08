import { z } from "zod";
import { eq, and, desc, lt, sql, inArray } from "@deepmint/db";
import {
  follows,
  watchlists,
  entities,
  claims,
  instruments,
  emailPreferences,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { Redis } from "@upstash/redis";
import { Inngest } from "inngest";

const inngest = new Inngest({ id: "deepmint" });

// Redis helper — lazy init, null when env vars not set (local dev)
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = getRedis();
const FOLLOWER_COUNT_KEY = (entityId: string) =>
  `deepmint:followers:${entityId}`;

export const socialRouter = router({
  /** Follow an entity. */
  follow: protectedProcedure
    .input(z.object({ targetEntityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.entity.id === input.targetEntityId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot follow yourself",
        });
      }

      // Check target exists
      const [target] = await ctx.db
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.id, input.targetEntityId))
        .limit(1);

      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entity not found",
        });
      }

      // Prevent duplicates
      const [existing] = await ctx.db
        .select({ id: follows.id })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, ctx.entity.id),
            eq(follows.followedId, input.targetEntityId),
          ),
        )
        .limit(1);

      if (existing) {
        return { alreadyFollowing: true };
      }

      await ctx.db.insert(follows).values({
        followerId: ctx.entity.id,
        followedId: input.targetEntityId,
      });

      // Increment Redis counter
      if (redis) {
        await redis.incr(FOLLOWER_COUNT_KEY(input.targetEntityId));
      }

      // Emit event for notification worker
      await inngest.send({
        name: "social/followed",
        data: {
          followerId: ctx.entity.id,
          followedId: input.targetEntityId,
        },
      }).catch(() => {
        // Non-blocking
      });

      return { alreadyFollowing: false };
    }),

  /** Unfollow an entity. */
  unfollow: protectedProcedure
    .input(z.object({ targetEntityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, ctx.entity.id),
            eq(follows.followedId, input.targetEntityId),
          ),
        )
        .returning({ id: follows.id });

      // Decrement Redis counter if a row was actually deleted
      if (redis && deleted.length > 0) {
        await redis.decr(FOLLOWER_COUNT_KEY(input.targetEntityId));
      }

      return { unfollowed: deleted.length > 0 };
    }),

  /** Check if the current user follows a target entity. */
  isFollowing: protectedProcedure
    .input(z.object({ targetEntityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ id: follows.id })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, ctx.entity.id),
            eq(follows.followedId, input.targetEntityId),
          ),
        )
        .limit(1);

      return { isFollowing: !!row };
    }),

  /** Paginated list of followers for an entity. */
  followers: publicProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(follows.followedId, input.entityId)];

      if (input.cursor) {
        conditions.push(lt(follows.createdAt, new Date(input.cursor)));
      }

      const results = await ctx.db
        .select({
          follow: follows,
          entity: {
            id: entities.id,
            displayName: entities.displayName,
            slug: entities.slug,
            type: entities.type,
            avatarUrl: entities.avatarUrl,
          },
        })
        .from(follows)
        .innerJoin(entities, eq(follows.followerId, entities.id))
        .where(and(...conditions))
        .orderBy(desc(follows.createdAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      const items = hasMore ? results.slice(0, -1) : results;

      return {
        items,
        nextCursor: hasMore
          ? items[items.length - 1]?.follow.createdAt.toISOString()
          : null,
      };
    }),

  /** Paginated list of entities this entity follows. */
  following: publicProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(follows.followerId, input.entityId)];

      if (input.cursor) {
        conditions.push(lt(follows.createdAt, new Date(input.cursor)));
      }

      const results = await ctx.db
        .select({
          follow: follows,
          entity: {
            id: entities.id,
            displayName: entities.displayName,
            slug: entities.slug,
            type: entities.type,
            avatarUrl: entities.avatarUrl,
          },
        })
        .from(follows)
        .innerJoin(entities, eq(follows.followedId, entities.id))
        .where(and(...conditions))
        .orderBy(desc(follows.createdAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      const items = hasMore ? results.slice(0, -1) : results;

      return {
        items,
        nextCursor: hasMore
          ? items[items.length - 1]?.follow.createdAt.toISOString()
          : null,
      };
    }),

  /** Follower count for an entity (Redis-first, DB fallback). */
  followerCount: publicProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Try Redis first
      if (redis) {
        const cached = await redis.get<number>(
          FOLLOWER_COUNT_KEY(input.entityId),
        );
        if (cached !== null && cached !== undefined) {
          return { count: cached };
        }
      }

      // DB fallback
      const [result] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.followedId, input.entityId));

      const count = result?.count ?? 0;

      // Seed Redis cache
      if (redis) {
        await redis.set(FOLLOWER_COUNT_KEY(input.entityId), count);
      }

      return { count };
    }),

  /** Social feed — recent claims from entities the current user follows. */
  feed: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get followed entity IDs
      const followedRows = await ctx.db
        .select({ followedId: follows.followedId })
        .from(follows)
        .where(eq(follows.followerId, ctx.entity.id));

      const followedIds = followedRows.map((r: { followedId: string }) => r.followedId);

      if (followedIds.length === 0) {
        return { items: [], nextCursor: null };
      }

      const conditions = [
        eq(claims.status, "active"),
        inArray(claims.entityId, followedIds),
      ];

      if (input.cursor) {
        conditions.push(lt(claims.createdAt, new Date(input.cursor)));
      }

      const results = await ctx.db
        .select({
          claim: claims,
          entity: {
            id: entities.id,
            displayName: entities.displayName,
            slug: entities.slug,
            type: entities.type,
            avatarUrl: entities.avatarUrl,
          },
          instrument: {
            id: instruments.id,
            ticker: instruments.ticker,
            name: instruments.name,
          },
        })
        .from(claims)
        .innerJoin(entities, eq(claims.entityId, entities.id))
        .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
        .where(and(...conditions))
        .orderBy(desc(claims.createdAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      const items = hasMore ? results.slice(0, -1) : results;

      return {
        items,
        nextCursor: hasMore
          ? items[items.length - 1]?.claim.createdAt.toISOString()
          : null,
      };
    }),

  // ---------------------------------------------------------------------------
  // Watchlist
  // ---------------------------------------------------------------------------

  /** Add an instrument to the user's watchlist. */
  addToWatchlist: protectedProcedure
    .input(z.object({ instrumentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent duplicates
      const [existing] = await ctx.db
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(
          and(
            eq(watchlists.entityId, ctx.entity.id),
            eq(watchlists.instrumentId, input.instrumentId),
          ),
        )
        .limit(1);

      if (existing) {
        return { alreadyWatching: true };
      }

      await ctx.db.insert(watchlists).values({
        entityId: ctx.entity.id,
        instrumentId: input.instrumentId,
      });

      return { alreadyWatching: false };
    }),

  /** Remove an instrument from the user's watchlist. */
  removeFromWatchlist: protectedProcedure
    .input(z.object({ instrumentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(watchlists)
        .where(
          and(
            eq(watchlists.entityId, ctx.entity.id),
            eq(watchlists.instrumentId, input.instrumentId),
          ),
        )
        .returning({ id: watchlists.id });

      return { removed: deleted.length > 0 };
    }),

  /** Get the user's watchlist with instrument details. */
  myWatchlist: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        watchlist: watchlists,
        instrument: {
          id: instruments.id,
          ticker: instruments.ticker,
          name: instruments.name,
          sector: instruments.sector,
        },
      })
      .from(watchlists)
      .innerJoin(instruments, eq(watchlists.instrumentId, instruments.id))
      .where(eq(watchlists.entityId, ctx.entity.id))
      .orderBy(desc(watchlists.createdAt));

    return rows;
  }),

  /** Check if the user is watching an instrument. */
  isWatching: protectedProcedure
    .input(z.object({ instrumentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(
          and(
            eq(watchlists.entityId, ctx.entity.id),
            eq(watchlists.instrumentId, input.instrumentId),
          ),
        )
        .limit(1);

      return { isWatching: !!row };
    }),

  // ---------------------------------------------------------------------------
  // Email Preferences
  // ---------------------------------------------------------------------------

  /** Get email preferences for current user. */
  emailPreferences: protectedProcedure.query(async ({ ctx }) => {
    const [prefs] = await ctx.db
      .select()
      .from(emailPreferences)
      .where(eq(emailPreferences.entityId, ctx.entity.id))
      .limit(1);

    // Default: digest enabled, daily frequency
    return prefs ?? { digestEnabled: true, digestFrequency: "daily" };
  }),

  /** Update email preferences (upsert). */
  updateEmailPreferences: protectedProcedure
    .input(
      z.object({
        digestEnabled: z.boolean(),
        digestFrequency: z.enum(["daily", "weekly"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: emailPreferences.id })
        .from(emailPreferences)
        .where(eq(emailPreferences.entityId, ctx.entity.id))
        .limit(1);

      if (existing) {
        await ctx.db
          .update(emailPreferences)
          .set({
            digestEnabled: input.digestEnabled,
            ...(input.digestFrequency
              ? { digestFrequency: input.digestFrequency }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(emailPreferences.entityId, ctx.entity.id));
      } else {
        await ctx.db.insert(emailPreferences).values({
          entityId: ctx.entity.id,
          digestEnabled: input.digestEnabled,
          digestFrequency: input.digestFrequency ?? "daily",
        });
      }

      return { success: true };
    }),
});

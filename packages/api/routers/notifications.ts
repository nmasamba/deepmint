import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { eq, and, lt, desc, sql } from "@deepmint/db";
import { notifications, notificationPreferences } from "@deepmint/db/schema";

export const notificationsRouter = router({
  /** List notifications with cursor-based pagination. */
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(), // ISO timestamp
        limit: z.number().min(1).max(50).default(20),
        unreadOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(notifications.entityId, ctx.entity.id)];

      if (input.unreadOnly) {
        conditions.push(eq(notifications.isRead, false));
      }
      if (input.cursor) {
        conditions.push(lt(notifications.createdAt, new Date(input.cursor)));
      }

      const rows = await ctx.db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
      };
    }),

  /** Count of unread notifications. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.entityId, ctx.entity.id),
          eq(notifications.isRead, false),
        ),
      );

    return { count: result?.count ?? 0 };
  }),

  /** Mark notifications as read (single or all). */
  markRead: protectedProcedure
    .input(
      z.object({
        notificationId: z.string().uuid().optional(), // omit to mark all
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.notificationId) {
        await ctx.db
          .update(notifications)
          .set({ isRead: true })
          .where(
            and(
              eq(notifications.id, input.notificationId),
              eq(notifications.entityId, ctx.entity.id),
            ),
          );
      } else {
        await ctx.db
          .update(notifications)
          .set({ isRead: true })
          .where(
            and(
              eq(notifications.entityId, ctx.entity.id),
              eq(notifications.isRead, false),
            ),
          );
      }

      return { success: true };
    }),

  /** Get notification preferences (defaults when no row exists). */
  preferences: protectedProcedure.query(async ({ ctx }) => {
    const [prefs] = await ctx.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.entityId, ctx.entity.id))
      .limit(1);

    return (
      prefs ?? {
        newFollower: true,
        outcomeMature: true,
        rankChange: true,
        newClaimFromFollow: true,
        signalTradeLogged: true,
      }
    );
  }),

  /** Upsert notification preferences. */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        newFollower: z.boolean().optional(),
        outcomeMature: z.boolean().optional(),
        rankChange: z.boolean().optional(),
        newClaimFromFollow: z.boolean().optional(),
        signalTradeLogged: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.entityId, ctx.entity.id))
        .limit(1);

      if (existing) {
        const [updated] = await ctx.db
          .update(notificationPreferences)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(notificationPreferences.entityId, ctx.entity.id))
          .returning();
        return updated;
      }

      const [created] = await ctx.db
        .insert(notificationPreferences)
        .values({
          entityId: ctx.entity.id,
          newFollower: input.newFollower ?? true,
          outcomeMature: input.outcomeMature ?? true,
          rankChange: input.rankChange ?? true,
          newClaimFromFollow: input.newClaimFromFollow ?? true,
          signalTradeLogged: input.signalTradeLogged ?? true,
        })
        .returning();

      return created;
    }),
});

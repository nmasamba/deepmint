import { z } from "zod";
import { eq, and, desc } from "@deepmint/db";
import {
  entities,
  brokerLinks,
  playerTrades,
  instruments,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { router, protectedProcedure } from "../trpc";
import {
  getSnapTradeClient,
  registerUser,
  getLoginLink,
  listAccounts,
  getAccountActivities,
  deleteUser,
  type SnapTradeUserCredentials,
} from "../lib/snaptrade";

// Rate limiter: 1 sync per hour per entity
function getSyncRateLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(1, "1 h"),
    prefix: "deepmint:broker-sync",
  });
}

const syncRateLimiter = getSyncRateLimiter();

function extractCreds(meta: unknown): SnapTradeUserCredentials | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as { userId?: string; userSecret?: string };
  if (!m.userId || !m.userSecret) return null;
  return { userId: m.userId, userSecret: m.userSecret };
}

export const brokerRouter = router({
  /**
   * Initialize a broker link: register user with SnapTrade and return
   * the OAuth redirect URL.
   */
  initLink: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["snaptrade"]).default("snaptrade"),
      }),
    )
    .mutation(async ({ ctx }) => {
      if (!getSnapTradeClient()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Broker verification is not configured on this deployment",
        });
      }

      if (ctx.entity.type !== "player") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Players can link a broker",
        });
      }

      // Deepmint uses the entity ID as the SnapTrade userId
      const userId = ctx.entity.snaptradeUserId ?? `dm-${ctx.entity.id}`;

      let userSecret: string;

      // Check if we already have credentials stored
      const [existingLink] = await ctx.db
        .select()
        .from(brokerLinks)
        .where(
          and(
            eq(brokerLinks.entityId, ctx.entity.id),
            eq(brokerLinks.provider, "snaptrade"),
          ),
        )
        .orderBy(desc(brokerLinks.createdAt))
        .limit(1);

      const existingCreds = existingLink
        ? extractCreds(existingLink.metadata)
        : null;

      if (existingCreds) {
        userSecret = existingCreds.userSecret;
      } else {
        const creds = await registerUser(userId);
        userSecret = creds.userSecret;

        // Persist the snaptradeUserId on the entity
        await ctx.db
          .update(entities)
          .set({ snaptradeUserId: userId })
          .where(eq(entities.id, ctx.entity.id));
      }

      const redirectUri = await getLoginLink({ userId, userSecret });

      // Upsert a pending broker link row
      if (existingLink) {
        await ctx.db
          .update(brokerLinks)
          .set({
            syncStatus: "pending",
            metadata: { userId, userSecret },
            disconnectedAt: null,
          })
          .where(eq(brokerLinks.id, existingLink.id));
      } else {
        await ctx.db.insert(brokerLinks).values({
          entityId: ctx.entity.id,
          provider: "snaptrade",
          providerAccountId: "",
          syncStatus: "pending",
          metadata: { userId, userSecret },
        });
      }

      // Mark the entity as pending verification
      await ctx.db
        .update(entities)
        .set({ brokerLinkStatus: "pending" })
        .where(eq(entities.id, ctx.entity.id));

      return { redirectUri };
    }),

  /**
   * Complete the broker link after the user returns from SnapTrade OAuth.
   * Looks up the linked accounts and marks the entity as verified.
   */
  completeLink: protectedProcedure.mutation(async ({ ctx }) => {
    const [link] = await ctx.db
      .select()
      .from(brokerLinks)
      .where(
        and(
          eq(brokerLinks.entityId, ctx.entity.id),
          eq(brokerLinks.provider, "snaptrade"),
        ),
      )
      .orderBy(desc(brokerLinks.createdAt))
      .limit(1);

    if (!link) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending broker link found",
      });
    }

    const creds = extractCreds(link.metadata);
    if (!creds) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Broker link is missing credentials",
      });
    }

    const accounts = await listAccounts(creds);

    if (accounts.length === 0) {
      // User hasn't completed OAuth yet
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No broker accounts found. Complete the OAuth flow first.",
      });
    }

    const primary = accounts[0]!;

    await ctx.db
      .update(brokerLinks)
      .set({
        providerAccountId: primary.id,
        brokerName: primary.brokerageName,
        syncStatus: "active",
        isVerified: true,
        lastSyncAt: new Date(),
      })
      .where(eq(brokerLinks.id, link.id));

    await ctx.db
      .update(entities)
      .set({ brokerLinkStatus: "verified" })
      .where(eq(entities.id, ctx.entity.id));

    return { verified: true, brokerName: primary.brokerageName };
  }),

  /** Get the current broker link status for the logged-in entity. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const [link] = await ctx.db
      .select({
        id: brokerLinks.id,
        provider: brokerLinks.provider,
        brokerName: brokerLinks.brokerName,
        syncStatus: brokerLinks.syncStatus,
        lastSyncAt: brokerLinks.lastSyncAt,
        syncErrorMessage: brokerLinks.syncErrorMessage,
        isVerified: brokerLinks.isVerified,
        disconnectedAt: brokerLinks.disconnectedAt,
      })
      .from(brokerLinks)
      .where(eq(brokerLinks.entityId, ctx.entity.id))
      .orderBy(desc(brokerLinks.createdAt))
      .limit(1);

    return {
      entityVerified: ctx.entity.brokerLinkStatus === "verified",
      link: link ?? null,
      snaptradeConfigured: getSnapTradeClient() !== null,
    };
  }),

  /**
   * Disconnect the broker link. Preserves synced trade data (immutability
   * principle) but revokes access tokens on SnapTrade's side.
   */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const [link] = await ctx.db
      .select()
      .from(brokerLinks)
      .where(
        and(
          eq(brokerLinks.entityId, ctx.entity.id),
          eq(brokerLinks.provider, "snaptrade"),
        ),
      )
      .orderBy(desc(brokerLinks.createdAt))
      .limit(1);

    if (!link) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No broker link found",
      });
    }

    // Revoke on SnapTrade
    if (ctx.entity.snaptradeUserId && getSnapTradeClient()) {
      try {
        await deleteUser(ctx.entity.snaptradeUserId);
      } catch {
        // Continue even if SnapTrade revocation fails
      }
    }

    await ctx.db
      .update(brokerLinks)
      .set({
        syncStatus: "disconnected",
        disconnectedAt: new Date(),
        metadata: {},
      })
      .where(eq(brokerLinks.id, link.id));

    await ctx.db
      .update(entities)
      .set({ brokerLinkStatus: "none" })
      .where(eq(entities.id, ctx.entity.id));

    return { disconnected: true };
  }),

  /**
   * Sync trade history from the linked broker account. Upserts to
   * player_trades with is_verified = true.
   */
  syncTrades: protectedProcedure.mutation(async ({ ctx }) => {
    if (syncRateLimiter) {
      const { success } = await syncRateLimiter.limit(
        `entity:${ctx.entity.id}`,
      );
      if (!success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "You can only sync once per hour",
        });
      }
    }

    const [link] = await ctx.db
      .select()
      .from(brokerLinks)
      .where(
        and(
          eq(brokerLinks.entityId, ctx.entity.id),
          eq(brokerLinks.provider, "snaptrade"),
          eq(brokerLinks.syncStatus, "active"),
        ),
      )
      .orderBy(desc(brokerLinks.createdAt))
      .limit(1);

    if (!link) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No active broker link",
      });
    }

    const creds = extractCreds(link.metadata);
    if (!creds || !link.providerAccountId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Broker link is missing credentials",
      });
    }

    try {
      const activities = await getAccountActivities(
        creds,
        link.providerAccountId,
      );

      let inserted = 0;
      for (const act of activities) {
        // Look up the instrument by ticker
        const [instrument] = await ctx.db
          .select({ id: instruments.id })
          .from(instruments)
          .where(eq(instruments.ticker, act.symbol.toUpperCase()))
          .limit(1);

        if (!instrument) continue; // Skip trades on untracked instruments

        const side = act.action === "BUY" ? "buy" : "sell";
        const entryPriceCents = Math.round(act.priceDollars * 100);

        await ctx.db.insert(playerTrades).values({
          entityId: ctx.entity.id,
          instrumentId: instrument.id,
          side,
          entryPriceCents,
          quantity: act.quantity.toString(),
          openedAt: act.executedAt,
          isVerified: true,
        });
        inserted += 1;
      }

      await ctx.db
        .update(brokerLinks)
        .set({
          lastSyncAt: new Date(),
          syncErrorMessage: null,
        })
        .where(eq(brokerLinks.id, link.id));

      return { synced: inserted };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await ctx.db
        .update(brokerLinks)
        .set({
          syncStatus: "error",
          syncErrorMessage: message.slice(0, 500),
        })
        .where(eq(brokerLinks.id, link.id));

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Sync failed: ${message}`,
      });
    }
  }),
});

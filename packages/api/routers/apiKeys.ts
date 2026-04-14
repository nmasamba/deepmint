import { z } from "zod";
import { desc, eq } from "@deepmint/db";
import { apiKeys } from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { generateKey } from "../lib/generateKey";

const VALID_SCOPES = [
  "scores:read",
  "consensus:read",
  "leaderboard:read",
] as const;

export const apiKeysRouter = router({
  /** Admin: create a new API key. */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        scopes: z
          .array(z.enum(VALID_SCOPES))
          .min(1)
          .default(["scores:read", "consensus:read", "leaderboard:read"]),
        rateLimit: z.number().min(1).max(10000).default(60),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { plaintext, hash, prefix } = generateKey();

      const [created] = await ctx.db
        .insert(apiKeys)
        .values({
          name: input.name,
          keyHash: hash,
          keyPrefix: prefix,
          createdBy: ctx.entity.id,
          scopes: input.scopes,
          rateLimit: input.rateLimit,
          expiresAt: input.expiresAt,
        })
        .returning();

      // Return the plaintext ONCE
      return {
        id: created.id,
        name: created.name,
        key: plaintext,
        prefix: created.keyPrefix,
        scopes: created.scopes,
        rateLimit: created.rateLimit,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      };
    }),

  /** Admin: list API keys (never includes plaintext). */
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        rateLimit: apiKeys.rateLimit,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));

    return rows;
  }),

  /** Admin: revoke an API key (sets isActive=false, stamps revokedAt). */
  revoke: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(apiKeys)
        .set({
          isActive: false,
          revokedAt: new Date(),
        })
        .where(eq(apiKeys.id, input.id))
        .returning({ id: apiKeys.id });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        });
      }

      return { revoked: true };
    }),
});

import { z } from "zod";
import { and, desc, eq, isNull, sql } from "@deepmint/db";
import { apiKeys, entities } from "@deepmint/db/schema";
import { slugify } from "@deepmint/shared";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { generateKey } from "../lib/generateKey";

const VALID_SCOPES = [
  "scores:read",
  "consensus:read",
  "leaderboard:read",
  "claims:write",
] as const;

type Db = typeof import("@deepmint/db").db;

/** A new Player for an agent to act as. It has no Clerk user, so no one signs in as it. */
async function createAgentEntity(db: Db, displayName: string): Promise<string> {
  const baseSlug = slugify(displayName, "agent");
  for (let n = 1; n <= 6; n++) {
    const slug = n === 1 ? baseSlug : `${baseSlug.slice(0, 98)}-${n}`;
    const [created] = await db
      .insert(entities)
      .values({ type: "player", isAgent: true, displayName, slug })
      .onConflictDoNothing({ target: entities.slug })
      .returning({ id: entities.id });
    if (created) return created.id;
  }
  throw new TRPCError({
    code: "CONFLICT",
    message: `No free slug for agent "${displayName}"`,
  });
}

export const apiKeysRouter = router({
  /**
   * Admin: create a new API key. A claims:write key acts as an agent Player,
   * never as the admin who mints it: pass agentName to create the agent, or
   * agentEntityId to give an existing one a new key.
   */
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
        agentName: z.string().trim().min(1).max(100).optional(),
        agentEntityId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.agentName && input.agentEntityId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pass agentName or agentEntityId, not both",
        });
      }
      const boundToAgent = !!(input.agentName || input.agentEntityId);
      if (input.scopes.includes("claims:write") && !boundToAgent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A claims:write key acts as an agent: pass agentName or agentEntityId",
        });
      }

      const { plaintext, hash, prefix } = generateKey();

      const created = await ctx.db.transaction(async (tx) => {
        const db = tx as unknown as Db;
        let entityId: string | null = null;
        if (input.agentName) {
          entityId = await createAgentEntity(db, input.agentName);
        } else if (input.agentEntityId) {
          const [agent] = await db
            .select({ id: entities.id })
            .from(entities)
            .where(
              and(
                eq(entities.id, input.agentEntityId),
                eq(entities.isAgent, true),
                // A deleted agent can never write (resolveAgentEntity).
                isNull(entities.deletedAt),
              ),
            )
            .limit(1);
          if (!agent) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "agentEntityId is not an agent, or it has been deleted",
            });
          }
          entityId = agent.id;
        }

        const [row] = await db
          .insert(apiKeys)
          .values({
            name: input.name,
            keyHash: hash,
            keyPrefix: prefix,
            createdBy: ctx.entity.id,
            entityId,
            scopes: input.scopes,
            rateLimit: input.rateLimit,
            expiresAt: input.expiresAt,
          })
          .returning();
        return row!;
      });

      // Return the plaintext ONCE
      return {
        id: created.id,
        name: created.name,
        key: plaintext,
        prefix: created.keyPrefix,
        entityId: created.entityId,
        scopes: created.scopes,
        rateLimit: created.rateLimit,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      };
    }),

  /**
   * Admin: list API keys (never includes plaintext), with the agent each one
   * acts as.
   */
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        entityId: apiKeys.entityId,
        agentName: entities.displayName,
        agentSlug: entities.slug,
        agentDeleted: sql<boolean>`${entities.deletedAt} is not null`,
        scopes: apiKeys.scopes,
        rateLimit: apiKeys.rateLimit,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .leftJoin(entities, eq(apiKeys.entityId, entities.id))
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

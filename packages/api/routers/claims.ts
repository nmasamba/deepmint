import { z } from "zod";
import { eq, and, lt, desc, sql } from "@deepmint/db";
import {
  claims,
  entities,
  instruments,
  notes,
  outcomes,
  events,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
} from "../trpc";
import { VALID_HORIZONS, RATIONALE_TAGS, getCurrentPrice } from "@deepmint/shared";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Inngest } from "inngest";

const inngest = new Inngest({ id: "deepmint" });

// Rate limiter: 10 claims per hour per entity (sliding window)
// Falls back to no-op when Upstash env vars are not set (local dev)
function getRateLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    prefix: "deepmint:claims",
  });
}

const rateLimiter = getRateLimiter();

export const claimRouter = router({
  /** Submit a new claim (Player or Guide). Claims are immutable once created. */
  submit: protectedProcedure
    .input(
      z.object({
        instrumentId: z.string().uuid(),
        direction: z.enum(["long", "short", "neutral"]),
        targetPriceCents: z.number().int().positive().optional(),
        horizonDays: z.number().refine(
          (v): v is (typeof VALID_HORIZONS)[number] =>
            (VALID_HORIZONS as readonly number[]).includes(v),
          { message: "horizonDays must be one of: 1, 7, 30, 90, 180, 365" },
        ),
        confidence: z.number().int().min(0).max(100).optional(),
        rationale: z.string().max(5000).optional(),
        rationaleTags: z
          .array(z.enum(RATIONALE_TAGS))
          .max(10)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Rate limit check
      if (rateLimiter) {
        const { success } = await rateLimiter.limit(ctx.entity.id);
        if (!success) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Rate limit exceeded. Maximum 10 claims per hour.",
          });
        }
      }

      // 2. Verify instrument exists and is active
      const [instrument] = await ctx.db
        .select()
        .from(instruments)
        .where(
          and(
            eq(instruments.id, input.instrumentId),
            eq(instruments.isActive, true),
          ),
        )
        .limit(1);

      if (!instrument) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instrument not found or inactive",
        });
      }

      // 3. Get current price from Polygon (or dev fallback)
      const entryPriceCents = await getCurrentPrice(instrument.ticker);

      // 4. Insert into claims table (append-only, immutable)
      const [claim] = await ctx.db
        .insert(claims)
        .values({
          entityId: ctx.entity.id,
          instrumentId: input.instrumentId,
          direction: input.direction,
          targetPriceCents: input.targetPriceCents ?? null,
          horizonDays: input.horizonDays,
          confidence: input.confidence ?? null,
          rationale: input.rationale ?? null,
          rationaleTags: input.rationaleTags ?? [],
          entryPriceCents,
          status: "active",
          // eventId is null for Player self-logged claims
        })
        .returning();

      // Emit event for downstream workers (signal-simulate, influence tracking)
      await inngest.send({
        name: "claims/created",
        data: {
          claimId: claim.id,
          entityId: claim.entityId,
          instrumentId: claim.instrumentId,
          direction: claim.direction,
          horizonDays: claim.horizonDays,
          entryPriceCents: claim.entryPriceCents,
        },
      }).catch(() => {
        // Non-blocking: don't fail claim submission if Inngest is unavailable
      });

      return claim;
    }),

  /** List claims with cursor-based pagination and filters */
  list: publicProcedure
    .input(
      z.object({
        entityId: z.string().uuid().optional(),
        instrumentId: z.string().uuid().optional(),
        direction: z.enum(["long", "short", "neutral"]).optional(),
        horizonDays: z.number().optional(),
        cursor: z.string().optional(), // ISO timestamp of last item
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(claims.status, "active")];

      if (input.entityId) {
        conditions.push(eq(claims.entityId, input.entityId));
      }
      if (input.instrumentId) {
        conditions.push(eq(claims.instrumentId, input.instrumentId));
      }
      if (input.direction) {
        conditions.push(eq(claims.direction, input.direction));
      }
      if (input.horizonDays) {
        conditions.push(eq(claims.horizonDays, input.horizonDays));
      }
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

  /** Get single claim with outcomes, notes, entity, and instrument */
  detail: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch claim with entity + instrument
      const [result] = await ctx.db
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
            sector: instruments.sector,
          },
        })
        .from(claims)
        .innerJoin(entities, eq(claims.entityId, entities.id))
        .innerJoin(instruments, eq(claims.instrumentId, instruments.id))
        .where(eq(claims.id, input.id))
        .limit(1);

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Fetch outcomes and notes in parallel
      const [claimOutcomes, claimNotes] = await Promise.all([
        ctx.db
          .select()
          .from(outcomes)
          .where(eq(outcomes.claimId, input.id))
          .orderBy(outcomes.horizon),
        ctx.db
          .select({
            id: notes.id,
            noteText: notes.noteText,
            createdAt: notes.createdAt,
            entityId: notes.entityId,
          })
          .from(notes)
          .where(eq(notes.claimId, input.id))
          .orderBy(notes.createdAt),
      ]);

      return {
        ...result,
        outcomes: claimOutcomes,
        notes: claimNotes,
      };
    }),

  /** Append a note to a claim. Notes are append-only. */
  addNote: protectedProcedure
    .input(
      z.object({
        claimId: z.string().uuid(),
        noteText: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the authenticated user owns the claim
      const [claim] = await ctx.db
        .select({ entityId: claims.entityId })
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .limit(1);

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      if (claim.entityId !== ctx.entity.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only add notes to your own claims",
        });
      }

      // Insert note (append-only, immutable)
      const [note] = await ctx.db
        .insert(notes)
        .values({
          claimId: input.claimId,
          entityId: ctx.entity.id,
          noteText: input.noteText,
        })
        .returning();

      return note;
    }),

  /** List claims pending review (admin only) */
  pendingReview: adminProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(claims.status, "pending_review")];

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

      // Fetch linked event text for each claim (if it came from ingestion)
      const enriched = await Promise.all(
        items.map(async (item) => {
          let eventText: string | null = null;
          if (item.claim.eventId) {
            const [event] = await ctx.db
              .select({ rawText: events.rawText })
              .from(events)
              .where(eq(events.id, item.claim.eventId))
              .limit(1);
            eventText = event?.rawText ?? null;
          }
          return { ...item, eventText };
        }),
      );

      return {
        items: enriched,
        nextCursor: hasMore
          ? items[items.length - 1]?.claim.createdAt.toISOString()
          : null,
      };
    }),

  /**
   * Approve or reject a pending claim (admin only).
   * Status transition is the ONLY allowed update on claims. Content is immutable.
   */
  reviewClaim: adminProcedure
    .input(
      z.object({
        claimId: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [claim] = await ctx.db
        .select()
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .limit(1);

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      if (claim.status !== "pending_review") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending_review claims can be reviewed",
        });
      }

      const newStatus = input.action === "approve" ? "active" : "rejected";

      // Status transition is the ONLY allowed update on claims.
      // Content fields (direction, horizon, rationale, etc.) are NEVER modified.
      await ctx.db
        .update(claims)
        .set({ status: newStatus })
        .where(eq(claims.id, input.claimId));

      return { claimId: input.claimId, status: newStatus };
    }),
});

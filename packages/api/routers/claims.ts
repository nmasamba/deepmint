import { z } from "zod";
import { eq, and, lt, desc, sql, inArray } from "@deepmint/db";
import {
  claims,
  entities,
  instruments,
  notes,
  outcomes,
  events,
  auditRoots,
} from "@deepmint/db/schema";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  memberProcedure,
  adminProcedure,
} from "../trpc";
import {
  CLAIM_RATE_LIMIT,
  COVERED_TICKERS,
  VALID_HORIZONS,
  RATIONALE_TAGS,
  claimHoldReasons,
  isCoveredTicker,
  isUnattributedRating,
  getMerkleProof,
} from "@deepmint/shared";
import { enrichClaimRows } from "../lib/claimEnrichment";
import {
  auditDateV1,
  auditDateV2,
  claimLeafPayload,
  recomputeRoot,
  utcDayBounds,
} from "../lib/auditWindow";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Inngest } from "inngest";

const inngest = new Inngest({ id: "deepmint" });

// Rate limiter: CLAIM_RATE_LIMIT claims per hour per entity (sliding window)
// Falls back to no-op when Upstash env vars are not set (local dev)
function getRateLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(CLAIM_RATE_LIMIT, "1 h"),
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
            message: `Rate limit exceeded. Maximum ${CLAIM_RATE_LIMIT} claims per hour.`,
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
      // Only covered tickers have pages, ingestion and scoring alongside.
      if (!isCoveredTicker(instrument.ticker)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${instrument.ticker} is not covered. Deepmint covers the Mag 7: ${COVERED_TICKERS.join(", ")}.`,
        });
      }

      // 3. Insert into claims table (append-only, immutable). No entry price
      // is stored: the latest available price is the previous close, which
      // would credit the claim with a move already visible when it was made.
      // Markout enters it at the first close after created_at and records
      // that price on the outcome.
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
          entryPriceCents: null,
          status: "active",
          sourceKind: "self_logged",
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
        // Not "direction": tRPC's useInfiniteQuery adds direction: "forward"
        // to the input, which failed this enum, so every timeline page 400'd.
        claimDirection: z.enum(["long", "short", "neutral"]).optional(),
        horizonDays: z.number().optional(),
        cursor: z.string().nullish(), // ISO timestamp of last item
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
      if (input.claimDirection) {
        conditions.push(eq(claims.direction, input.claimDirection));
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
        items: await enrichClaimRows(items),
        nextCursor: hasMore
          ? items[items.length - 1]?.claim.createdAt.toISOString()
          : null,
      };
    }),

  /** Get single claim with outcomes, notes, source, entity, and instrument */
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

      // A claim that is not active (pending review or rejected) is visible
      // only to its owner and admins.
      const visible =
        result?.claim.status === "active" ||
        ctx.isAdmin ||
        (!!ctx.entity && ctx.entity.id === result?.claim.entityId);
      if (!result || !visible) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Fetch outcomes, notes and the card's enrichment in parallel
      const [claimOutcomes, claimNotes, [enriched]] = await Promise.all([
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
        enrichClaimRows([result]),
      ]);

      return {
        ...enriched!,
        outcomes: claimOutcomes,
        notes: claimNotes,
      };
    }),

  /**
   * Where a claim stands in the published daily Merkle roots, with its proof
   * when it has one. The root is rebuilt from the ledger first, and a proof is
   * returned only against a root that rebuilds exactly; otherwise the status
   * says why there is none. Visible to whoever may see the claim.
   */
  auditProof: publicProcedure
    .input(z.object({ claimId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [claim] = await ctx.db
        .select()
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .limit(1);
      const visible =
        claim?.status === "active" ||
        ctx.isAdmin ||
        (!!ctx.entity && ctx.entity.id === claim?.entityId);
      if (!claim || !visible) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      }

      // The current audit puts a claim in the root of the day it was
      // recorded; the version 1 audit, in the root of its own date.
      const recordedDay = auditDateV2(claim);
      const datedDay = auditDateV1(claim);
      const roots = await ctx.db
        .select()
        .from(auditRoots)
        .where(inArray(auditRoots.date, [...new Set([recordedDay, datedDay])]));
      const rootOn = (date: string) => roots.find((r) => r.date === date);
      const publish = (r: typeof auditRoots.$inferSelect) => ({
        date: r.date,
        merkleRoot: r.merkleRoot,
        claimCount: r.claimCount,
        leafVersion: r.leafVersion,
        computedAt: r.computedAt,
      });

      const recordedRoot = rootOn(recordedDay);
      let root = recordedRoot?.leafVersion === 1 ? undefined : recordedRoot;
      if (!recordedRoot) {
        // Day D's root is built at 22:00 UTC on D + 1; allow the run 2 hours.
        const due = utcDayBounds(recordedDay).end.getTime() + 24 * 3_600_000;
        if (Date.now() < due) {
          return { status: "awaiting" as const, date: recordedDay };
        }
      }
      if (!root) {
        const dated = rootOn(datedDay);
        if (dated?.leafVersion === 1) root = dated;
      }
      if (!root) {
        // A version 1 root on the day it was recorded went by claims' own
        // dates, so it does not cover a claim dated earlier.
        return recordedRoot
          ? {
              status: "missing" as const,
              reason: "went_by_date" as const,
              date: recordedDay,
              root: publish(recordedRoot),
            }
          : { status: "missing" as const, reason: "no_root" as const, date: recordedDay };
      }

      const published = publish(root);
      const rebuilt = await recomputeRoot(ctx.db, root);
      if (!rebuilt) {
        return { status: "unrecomputable" as const, root: published };
      }
      const leafIndex = rebuilt.claimIds.indexOf(claim.id);
      if (leafIndex < 0) {
        // Only a version 1 root on the claim's own date gets here: it was
        // built before this claim was stored.
        return {
          status: "missing" as const,
          reason: "built_before_stored" as const,
          date: recordedDay,
          root: published,
        };
      }

      return {
        status: "proven" as const,
        root: published,
        leafIndex,
        leafHash: rebuilt.leaves[leafIndex]!,
        leafPayload: claimLeafPayload(claim, root.leafVersion),
        proof: getMerkleProof(rebuilt.leaves, leafIndex),
      };
    }),

  /** The published daily Merkle roots, newest first. */
  auditRoots: memberProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(30),
        // The date of the last root on the previous page.
        cursor: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          date: auditRoots.date,
          merkleRoot: auditRoots.merkleRoot,
          claimCount: auditRoots.claimCount,
          leafVersion: auditRoots.leafVersion,
          computedAt: auditRoots.computedAt,
        })
        .from(auditRoots)
        .where(input.cursor ? lt(auditRoots.date, input.cursor) : undefined)
        .orderBy(desc(auditRoots.date))
        .limit(input.limit + 1);
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]!.date : null,
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
        cursor: z.string().nullish(),
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

      // Fetch linked event text for each claim (if it came from ingestion),
      // and work out why it was held.
      const enriched = await Promise.all(
        items.map(async (item) => {
          const { claim } = item;
          const [event] = claim.eventId
            ? await ctx.db
                .select({
                  rawText: events.rawText,
                  entityId: events.entityId,
                  publisher: events.publisher,
                })
                .from(events)
                .where(eq(events.id, claim.eventId))
                .limit(1)
            : [];
          // The extractor's copy key: same entity, instrument, direction,
          // horizon and date. Compared as a bound date string, never a JS Date.
          const day = claim.createdAt.toISOString().slice(0, 10);
          const [rejectedCopy] = await ctx.db
            .select({ id: claims.id })
            .from(claims)
            .where(
              and(
                eq(claims.status, "rejected"),
                eq(claims.entityId, claim.entityId),
                eq(claims.instrumentId, claim.instrumentId),
                eq(claims.direction, claim.direction),
                eq(claims.horizonDays, claim.horizonDays),
                sql`${claims.createdAt}::date = ${day}::date`,
              ),
            )
            .limit(1);
          return {
            ...item,
            eventText: event?.rawText ?? null,
            holdReasons: claimHoldReasons(claim, {
              carrierEntityId: event?.entityId ?? null,
              publisher: event?.publisher ?? null,
              earlierCopyRejected: !!rejectedCopy,
            }),
          };
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

      if (input.action === "approve" && claim.eventId) {
        const [event] = await ctx.db
          .select({ entityId: events.entityId })
          .from(events)
          .where(eq(events.id, claim.eventId))
          .limit(1);
        if (isUnattributedRating(claim, event?.entityId ?? null)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This rating has no issuing firm, so approving it would score whoever carried the text. Reject it instead.",
          });
        }
      }

      const newStatus = input.action === "approve" ? "active" : "rejected";

      // Status transition is the ONLY allowed update on claims.
      // Content fields (direction, horizon, rationale, etc.) are NEVER modified.
      await ctx.db
        .update(claims)
        .set({ status: newStatus })
        .where(eq(claims.id, input.claimId));

      // An approved claim goes live now, so its listeners hear of it now.
      // Each decides for itself whether it is too old to act on.
      if (newStatus === "active") {
        await inngest.send({
          id: `claims-created-${claim.id}`,
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
          // Non-blocking: the decision stands if Inngest is unavailable
        });
      }

      return { claimId: input.claimId, status: newStatus };
    }),
});

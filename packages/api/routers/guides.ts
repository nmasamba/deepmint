import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, exists, isNull, sql } from "@deepmint/db";
import { claims, entities, guideApplications } from "@deepmint/db/schema";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { linkAccountToGuide } from "../lib/guideLink";
import { invalidateFollowerCount } from "./social";

/**
 * Whether a Guide holds firms' ratings (claims recorded as Wall Street
 * ratings). Such a Guide is a firm's record, fed by every rating that names
 * the firm, so it can never become one person's account.
 */
const holdsFirmRatings = (guideId: Parameters<typeof eq>[1]) =>
  exists(
    sql`(select 1 from ${claims} where ${claims.entityId} = ${guideId} and ${claims.sourceKind} = 'wall_street_rating')`,
  );

/** The slug in a pasted profile address or slug: "deepmint.ai/guide/x?y" is "x". */
function profileSlug(text: string): string {
  return text
    .replace(/^.*\/guide\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

const applicant = alias(entities, "applicant");
const namedGuide = alias(entities, "named_guide");
const linkedGuide = alias(entities, "linked_guide");

/** A web address, or nothing: it is shown to admins as a link. */
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "Use an http or https address" });

/**
 * Becoming a Guide (D16 option 2): a user applies, and an admin approves or
 * rejects. Approval makes the applicant's own entity a Guide, or makes the
 * Guide Deepmint already ingested for them their account (lib/guideLink.ts).
 */
export const guidesRouter = router({
  /**
   * Apply to become a Guide. One open application at a time. (Not called
   * "apply": tRPC reserves that name on a router.)
   */
  submitApplication: protectedProcedure
    .input(
      z.object({
        pitch: z.string().trim().min(20).max(2000),
        sourceUrl: httpUrl.optional(),
        // The address of an ingested Guide's profile, if Deepmint already has one for them.
        guideSlug: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.entity.type !== "player" || ctx.entity.isAgent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            ctx.entity.type === "guide"
              ? "You are already a Guide"
              : "An AI agent cannot apply to be a Guide",
        });
      }

      let claimedGuideId: string | null = null;
      if (input.guideSlug) {
        const [guide] = await ctx.db
          .select({ id: entities.id, firm: holdsFirmRatings(entities.id) })
          .from(entities)
          .where(
            and(
              eq(entities.slug, profileSlug(input.guideSlug)),
              eq(entities.type, "guide"),
              isNull(entities.clerkUserId),
              isNull(entities.deletedAt),
            ),
          )
          .limit(1);
        if (!guide) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No Guide profile without an owner at that address",
          });
        }
        if (guide.firm) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "That profile collects a firm's published ratings, so it cannot become one person's account. Apply without it.",
          });
        }
        claimedGuideId = guide.id;
      }

      const [created] = await ctx.db
        .insert(guideApplications)
        .values({
          entityId: ctx.entity.id,
          pitch: input.pitch,
          sourceUrl: input.sourceUrl ?? null,
          claimedGuideId,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have an application waiting for review",
        });
      }
      return created;
    }),

  /** The signed-in user's latest application, if any. */
  myApplication: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        id: guideApplications.id,
        status: guideApplications.status,
        pitch: guideApplications.pitch,
        sourceUrl: guideApplications.sourceUrl,
        reviewNote: guideApplications.reviewNote,
        reviewedAt: guideApplications.reviewedAt,
        createdAt: guideApplications.createdAt,
        guide: { slug: namedGuide.slug, displayName: namedGuide.displayName },
      })
      .from(guideApplications)
      .leftJoin(namedGuide, eq(guideApplications.claimedGuideId, namedGuide.id))
      .where(eq(guideApplications.entityId, ctx.entity.id))
      .orderBy(desc(guideApplications.createdAt))
      .limit(1);
    if (!row) return null;
    return { ...row, guide: row.guide?.slug ? row.guide : null };
  }),

  /** Admin: applications, the open ones by default, oldest first. */
  adminList: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: guideApplications.id,
          status: guideApplications.status,
          pitch: guideApplications.pitch,
          sourceUrl: guideApplications.sourceUrl,
          reviewNote: guideApplications.reviewNote,
          reviewedAt: guideApplications.reviewedAt,
          createdAt: guideApplications.createdAt,
          applicant: {
            id: applicant.id,
            displayName: applicant.displayName,
            slug: applicant.slug,
            type: applicant.type,
          },
          // The applicant's claims, which stay on their old Player profile if
          // the application is approved with a link.
          claimCount: sql<number>`(select count(*)::int from ${claims} where ${claims.entityId} = ${applicant.id})`,
          guide: {
            id: namedGuide.id,
            displayName: namedGuide.displayName,
            slug: namedGuide.slug,
            sourceUrl: namedGuide.sourceUrl,
            // A Guide that is already someone's account cannot be linked again,
            // nor can a firm's ratings record.
            taken: sql<boolean>`${namedGuide.clerkUserId} is not null`,
            firm: holdsFirmRatings(namedGuide.id),
          },
          linkedGuide: { slug: linkedGuide.slug, displayName: linkedGuide.displayName },
        })
        .from(guideApplications)
        .innerJoin(applicant, eq(guideApplications.entityId, applicant.id))
        .leftJoin(namedGuide, eq(guideApplications.claimedGuideId, namedGuide.id))
        .leftJoin(linkedGuide, eq(guideApplications.linkedGuideId, linkedGuide.id))
        .where(eq(guideApplications.status, input.status))
        .orderBy(
          input.status === "pending"
            ? guideApplications.createdAt
            : desc(guideApplications.reviewedAt),
        )
        .limit(100);
      return rows.map((row) => ({
        ...row,
        guide: row.guide?.id ? row.guide : null,
        linkedGuide: row.linkedGuide?.slug ? row.linkedGuide : null,
      }));
    }),

  /**
   * Admin: decide an application. Approving makes the applicant's own entity
   * a Guide or, with `link`, makes the ingested Guide the applicant named
   * their account; rejecting closes it. Either way the decision is final.
   */
  adminReview: adminProcedure
    .input(
      z.object({
        applicationId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        link: z.boolean().default(false),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const [application] = await tx
          .select()
          .from(guideApplications)
          .where(eq(guideApplications.id, input.applicationId))
          .for("update")
          .limit(1);
        if (!application) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
        }
        if (application.status !== "pending") {
          throw new TRPCError({ code: "CONFLICT", message: "Already decided" });
        }
        if (application.entityId === ctx.entity.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Another admin has to review your own application",
          });
        }

        const decided = {
          reviewedBy: ctx.entity.id,
          reviewedAt: new Date(),
          reviewNote: input.note || null,
        };
        if (input.decision === "reject") {
          await tx
            .update(guideApplications)
            .set({ status: "rejected", ...decided })
            .where(eq(guideApplications.id, application.id));
          return { status: "rejected" as const };
        }

        const [entity] = await tx
          .select()
          .from(entities)
          .where(eq(entities.id, application.entityId))
          .for("update")
          .limit(1);
        if (
          !entity ||
          entity.deletedAt ||
          entity.isAgent ||
          entity.type !== "player" ||
          !entity.clerkUserId
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The applicant is no longer a Player who can become a Guide",
          });
        }

        if (input.link) {
          const [guide] = application.claimedGuideId
            ? await tx
                .select()
                .from(entities)
                .where(eq(entities.id, application.claimedGuideId))
                .for("update")
                .limit(1)
            : [];
          if (
            !guide ||
            guide.type !== "guide" ||
            guide.clerkUserId ||
            guide.deletedAt ||
            guide.isAgent
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "There is no ingested Guide without an owner to link",
            });
          }
          const [firm] = await tx
            .select({ yes: holdsFirmRatings(guide.id) })
            .from(entities)
            .where(eq(entities.id, guide.id));
          if (firm?.yes) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "That Guide holds a firm's ratings and cannot become one person's account",
            });
          }
          await linkAccountToGuide(tx, entity, guide);
          await tx
            .update(guideApplications)
            .set({ status: "approved", linkedGuideId: guide.id, ...decided })
            .where(eq(guideApplications.id, application.id));
          return {
            status: "approved" as const,
            linked: true,
            guideSlug: guide.slug,
            guideId: guide.id as string | undefined,
          };
        }

        await tx
          .update(entities)
          .set({ type: "guide", updatedAt: new Date() })
          .where(eq(entities.id, entity.id));
        await tx
          .update(guideApplications)
          .set({ status: "approved", ...decided })
          .where(eq(guideApplications.id, application.id));
        return {
          status: "approved" as const,
          linked: false,
          guideSlug: entity.slug,
          guideId: undefined as string | undefined,
        };
      });
      // The link dropped the user's follow of the Guide, if they had one.
      if (result.status === "approved" && result.guideId) {
        await invalidateFollowerCount(result.guideId);
      }
      return result;
    }),
});

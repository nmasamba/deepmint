import { describe, it, expect } from "vitest";
import { db, eq } from "@deepmint/db";
import { claims, entities, events, instruments } from "@deepmint/db/schema";
import { createCaller } from "../root";
import { createContext } from "../trpc";

class Rollback extends Error {}

/**
 * Claims cannot be deleted, so each case runs inside a transaction it rolls
 * back, and leaves nothing behind.
 */
async function inRolledBackTransaction(
  run: (tx: typeof db, caller: ReturnType<typeof createCaller>) => Promise<void>,
) {
  await db
    .transaction(async (tx) => {
      const handle = tx as unknown as typeof db;
      const caller = createCaller({
        ...createContext({ userId: "local-admin", entity: null, isAdmin: true }),
        db: handle,
        entity: (await handle.select().from(entities).limit(1))[0] ?? null,
      });
      await run(handle, caller);
      throw new Rollback();
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

async function heldRating(
  tx: typeof db,
  { credited, publisher }: { credited: boolean; publisher: string | null },
) {
  const stamp = `zz-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [carrier] = await tx
    .insert(entities)
    .values({ type: "guide", displayName: "Carrier", slug: `${stamp}-carrier` })
    .returning();
  const [firm] = await tx
    .insert(entities)
    .values({ type: "guide", displayName: "Firm", slug: `${stamp}-firm` })
    .returning();
  const [instrument] = await tx.select().from(instruments).limit(1);
  const [event] = await tx
    .insert(events)
    .values({
      entityId: carrier!.id,
      sourceUrl: `https://example.test/${stamp}`,
      rawText: "A rating.",
      contentHash: stamp,
      capturedAt: new Date(),
      publisher,
    })
    .returning();
  const [claim] = await tx
    .insert(claims)
    .values({
      eventId: event!.id,
      entityId: credited ? firm!.id : carrier!.id,
      instrumentId: instrument!.id,
      direction: "long",
      horizonDays: 90,
      status: "pending_review",
      sourceKind: "wall_street_rating",
    })
    .returning();
  return claim!;
}

describe.skipIf(!process.env.DATABASE_URL)("review guards (local DB)", () => {
  it("refuses to approve a rating with no issuing firm, and allows rejecting it", async () => {
    await inRolledBackTransaction(async (tx, caller) => {
      const claim = await heldRating(tx, { credited: false, publisher: "Example Wire" });
      await expect(
        caller.claims.reviewClaim({ claimId: claim.id, action: "approve" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const [unchanged] = await tx
        .select({ status: claims.status })
        .from(claims)
        .where(eq(claims.id, claim.id));
      expect(unchanged?.status).toBe("pending_review");

      await expect(
        caller.claims.reviewClaim({ claimId: claim.id, action: "reject" }),
      ).resolves.toMatchObject({ status: "rejected" });
    });
  });

  it("approves a rating credited to a firm", async () => {
    await inRolledBackTransaction(async (tx, caller) => {
      const claim = await heldRating(tx, { credited: true, publisher: "Example Wire" });
      await expect(
        caller.claims.reviewClaim({ claimId: claim.id, action: "approve" }),
      ).resolves.toMatchObject({ status: "active" });
    });
  });

  it("pendingReview says why each claim was held", async () => {
    await inRolledBackTransaction(async (tx, caller) => {
      const unattributed = await heldRating(tx, { credited: false, publisher: "Example Wire" });
      const moved = await heldRating(tx, { credited: true, publisher: null });
      const { items } = await caller.claims.pendingReview({ limit: 100 });
      const reasons = (id: string) => items.find((i) => i.claim.id === id)?.holdReasons;
      expect(reasons(unattributed.id)).toContain("unattributed_rating");
      expect(reasons(moved.id)).toContain("firm_in_guide_post");
    });
  });
});

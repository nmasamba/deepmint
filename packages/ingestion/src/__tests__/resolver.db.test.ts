import { describe, it, expect, afterAll } from "vitest";
import { db, eq, like, inArray } from "@deepmint/db";
import { entities, guideApplications } from "@deepmint/db/schema";
import { resolveOrCreateGuide } from "../sources/resolver";

/**
 * resolveOrCreateGuide against a real database (the local Docker Postgres).
 * Each run uses its own slug prefix and deletes the entities it created; none
 * of them has claims.
 */
describe.skipIf(!process.env.DATABASE_URL)("resolveOrCreateGuide (database)", () => {
  const prefix = `zz-resolver-${Date.now()}`;

  afterAll(async () => {
    const ours = (
      await db.select({ id: entities.id }).from(entities).where(like(entities.slug, `${prefix}%`))
    ).map((e) => e.id);
    if (ours.length) {
      await db.delete(guideApplications).where(inArray(guideApplications.entityId, ours));
    }
    await db.delete(entities).where(like(entities.slug, `${prefix}%`));
  });

  async function entityById(id: string) {
    const [row] = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
    return row!;
  }

  it("never credits a firm to a signed-up user who holds its slug", async () => {
    const [user] = await db
      .insert(entities)
      .values({
        type: "player",
        displayName: "Squatter",
        slug: `${prefix}-capital`,
        clerkUserId: `${prefix}-clerk-user`,
      })
      .returning({ id: entities.id });

    const guideId = await resolveOrCreateGuide({ handle: `${prefix} Capital` });
    expect(guideId).not.toBe(user!.id);
    const guide = await entityById(guideId);
    expect(guide.type).toBe("guide");
    expect(guide.clerkUserId).toBeNull();
    expect(guide.slug).toBe(`${prefix}-capital-2`);

    // The same firm resolves to the same Guide again.
    expect(await resolveOrCreateGuide({ handle: `${prefix} Capital` })).toBe(guideId);
  });

  it("skips a slug held by a Player with no Clerk user, too", async () => {
    await db.insert(entities).values({
      type: "player",
      displayName: "Seeded player",
      slug: `${prefix}-partners`,
    });
    const guide = await entityById(await resolveOrCreateGuide({ handle: `${prefix} Partners` }));
    expect(guide.type).toBe("guide");
    expect(guide.slug).toBe(`${prefix}-partners-2`);
  });

  it("matches an existing ingested Guide by slug", async () => {
    const first = await resolveOrCreateGuide({ handle: `${prefix} Research` });
    expect(await resolveOrCreateGuide({ handle: `${prefix}  research ` })).toBe(first);
  });

  it("keeps sending ratings to a Guide linked to its analyst's account", async () => {
    const guideId = await resolveOrCreateGuide({ handle: `${prefix} Analyst` });
    const [player] = await db
      .insert(entities)
      .values({ type: "player", displayName: "Old record", slug: `${prefix}-analyst-old` })
      .returning({ id: entities.id });
    // As an approved, linked application leaves them.
    await db
      .update(entities)
      .set({ clerkUserId: `${prefix}-clerk-analyst` })
      .where(eq(entities.id, guideId));
    await db.insert(guideApplications).values({
      entityId: player!.id,
      pitch: "I publish the Analyst ratings.",
      claimedGuideId: guideId,
      linkedGuideId: guideId,
      status: "approved",
    });
    expect(await resolveOrCreateGuide({ handle: `${prefix} Analyst` })).toBe(guideId);
  });

  it("does not send ratings to a Guide with an account and no link", async () => {
    const [selfMade] = await db
      .insert(entities)
      .values({
        type: "guide",
        displayName: "Self-made",
        slug: `${prefix}-desk`,
        clerkUserId: `${prefix}-clerk-desk`,
      })
      .returning({ id: entities.id });
    const guideId = await resolveOrCreateGuide({ handle: `${prefix} Desk` });
    expect(guideId).not.toBe(selfMade!.id);
    expect((await entityById(guideId)).slug).toBe(`${prefix}-desk-2`);
  });

  it("caps a long name at the column width instead of failing", async () => {
    const name = `${prefix} ${"Very Long Institutional Research Partners ".repeat(5)}`.trim();
    expect(name.length).toBeGreaterThan(150);
    const guide = await entityById(await resolveOrCreateGuide({ handle: name, displayName: name }));
    expect(guide.displayName).toBe(name.slice(0, 100));
    expect(guide.slug.length).toBeLessThanOrEqual(100);
  });

  it("keeps the suffix when the base slug is already 100 characters", async () => {
    const handle = `${prefix}-${"x".repeat(120)}`;
    const base = handle.slice(0, 100);
    await db.insert(entities).values({
      type: "player",
      displayName: "Long slug holder",
      slug: base,
      clerkUserId: `${prefix}-clerk-long`,
    });
    const guide = await entityById(await resolveOrCreateGuide({ handle }));
    expect(guide.slug).toBe(`${base.slice(0, 98)}-2`);
  });
});

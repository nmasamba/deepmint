import { describe, it, expect, afterAll } from "vitest";
import { db, eq, like } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { resolveOrCreateGuide } from "../sources/resolver";

/**
 * resolveOrCreateGuide against a real database (the local Docker Postgres).
 * Each run uses its own slug prefix and deletes the entities it created; none
 * of them has claims.
 */
describe.skipIf(!process.env.DATABASE_URL)("resolveOrCreateGuide (database)", () => {
  const prefix = `zz-resolver-${Date.now()}`;

  afterAll(async () => {
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

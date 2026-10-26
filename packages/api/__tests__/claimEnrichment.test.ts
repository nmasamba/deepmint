import { describe, it, expect } from "vitest";
import { db, eq, and, inArray, sql } from "@deepmint/db";
import { claims, entities, follows, outcomes, notes } from "@deepmint/db/schema";
import { markoutDueDate, isSessionFinal } from "@deepmint/scoring";
import { createCaller } from "../root";
import { createContext } from "../trpc";

type Item = Awaited<ReturnType<ReturnType<typeof createCaller>["claims"]["list"]>>["items"][number];

/** Every enriched field must agree with the tables and the markout rules. */
async function expectMatchesTables(items: Item[]) {
  const ids = items.map((i) => i.claim.id);
  const [outcomeRows, noteRows] = await Promise.all([
    db.select({ id: outcomes.id, claimId: outcomes.claimId }).from(outcomes).where(inArray(outcomes.claimId, ids)),
    db
      .select({ claimId: notes.claimId, count: sql<number>`count(*)::int` })
      .from(notes)
      .where(inArray(notes.claimId, ids))
      .groupBy(notes.claimId),
  ]);
  for (const item of items) {
    expect(item.outcomes.map((o) => o.id).sort()).toEqual(
      outcomeRows.filter((o) => o.claimId === item.claim.id).map((o) => o.id).sort(),
    );
    expect(item.notesCount).toBe(noteRows.find((n) => n.claimId === item.claim.id)?.count ?? 0);
    expect(item.exitDate).toBe(markoutDueDate(item.claim));
    expect(item.exitClosed).toBe(isSessionFinal(item.exitDate, new Date()));
  }
}

describe.skipIf(!process.env.DATABASE_URL)("claim enrichment (local DB)", () => {
  const publicCaller = createCaller(createContext({ userId: null, entity: null }));

  it("claims.list returns each claim's outcomes, notes count and exit state", async () => {
    const page = await publicCaller.claims.list({ limit: 100 });
    expect(page.items.length).toBeGreaterThan(0);
    await expectMatchesTables(page.items);
  });

  it("a scored claim carries its outcome", async () => {
    const [scored] = await db
      .select({ claimId: outcomes.claimId, entityId: claims.entityId })
      .from(outcomes)
      .innerJoin(claims, eq(outcomes.claimId, claims.id))
      .where(eq(claims.status, "active"))
      .limit(1);
    if (!scored) return; // no outcomes in this database yet

    const page = await publicCaller.claims.list({ entityId: scored.entityId, limit: 100 });
    const item = page.items.find((i) => i.claim.id === scored.claimId);
    expect(item?.outcomes.length).toBeGreaterThan(0);
    expect(item?.exitClosed).toBe(true);
    await expectMatchesTables(page.items);
  });

  it("social.feed is enriched the same way", async () => {
    const [follower] = await db
      .select({ entity: entities })
      .from(follows)
      .innerJoin(entities, eq(follows.followerId, entities.id))
      .innerJoin(claims, and(eq(claims.entityId, follows.followedId), eq(claims.status, "active")))
      .limit(1);
    if (!follower) return; // nobody follows an entity with claims here

    const caller = createCaller(createContext({ userId: "local-test", entity: follower.entity }));
    const feed = await caller.social.feed({ limit: 50 });
    expect(feed.items.length).toBeGreaterThan(0);
    await expectMatchesTables(feed.items);
  });
});

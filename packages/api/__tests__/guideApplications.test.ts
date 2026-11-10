import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, eq, inArray, or } from "@deepmint/db";
import {
  brokerLinks,
  emailPreferences,
  entities,
  follows,
  guideApplications,
  instruments,
  notificationPreferences,
  notifications,
  paperPortfolios,
  signalSimulatePortfolios,
  watchlists,
} from "@deepmint/db/schema";
import { anonymiseClerkUser, anonymiseEntity } from "@deepmint/db/queries/anonymiseEntity";
import { ensureEntityForClerkUser } from "@deepmint/db/queries/ensureEntityForClerkUser";
import { createCaller } from "../root";
import { createContext } from "../trpc";

type EntityRow = typeof entities.$inferSelect;
const PITCH = "I publish weekly notes on the Mag 7 and rate each one.";

describe("guide applications, without an account", () => {
  it("need a signed-in user, and an admin to review", async () => {
    const signedOut = createCaller(createContext({ userId: null, entity: null }));
    await expect(signedOut.guides.submitApplication({ pitch: PITCH })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const member = createCaller(
      createContext({ userId: "x", entity: { id: "00000000-0000-4000-8000-000000000009" } as EntityRow }),
    );
    await expect(member.guides.adminList({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("guide applications (local DB)", () => {
  const tag = `zz-w78-ga-${Date.now()}`;
  const created: string[] = [];
  let admin: EntityRow;
  let ada: EntityRow;
  let bob: EntityRow;
  let cyd: EntityRow;
  let dee: EntityRow;
  let eve: EntityRow;
  let followed: EntityRow;
  let guide: EntityRow;
  let guide2: EntityRow;

  const insertEntity = async (values: Partial<EntityRow> & { slug: string }) => {
    const [row] = await db
      .insert(entities)
      .values({ type: "player", displayName: values.slug, ...values })
      .returning();
    created.push(row!.id);
    return row!;
  };
  const read = async (id: string) =>
    (await db.select().from(entities).where(eq(entities.id, id)))[0]!;
  const as = (e: EntityRow, isAdmin = false) =>
    createCaller(createContext({ userId: e.clerkUserId ?? "x", entity: e, isAdmin }));

  beforeAll(async () => {
    admin = await insertEntity({ slug: `${tag}-admin`, clerkUserId: `${tag}-admin` });
    ada = await insertEntity({
      slug: `${tag}-ada`,
      clerkUserId: `${tag}-ada`,
      displayName: "Ada Analyst",
      avatarUrl: "https://img.example/ada.png",
      bio: "Ada's bio",
      brokerLinkStatus: "verified",
      snaptradeUserId: `dm-${tag}`,
    });
    bob = await insertEntity({ slug: `${tag}-bob`, clerkUserId: `${tag}-bob` });
    cyd = await insertEntity({ slug: `${tag}-cyd`, clerkUserId: `${tag}-cyd` });
    dee = await insertEntity({ slug: `${tag}-dee`, clerkUserId: `${tag}-dee`, displayName: "Dee" });
    eve = await insertEntity({ slug: `${tag}-eve`, clerkUserId: `${tag}-eve` });
    followed = await insertEntity({ slug: `${tag}-followed` });
    guide = await insertEntity({ slug: `${tag}-research`, type: "guide", displayName: "Tag Research" });
    guide2 = await insertEntity({ slug: `${tag}-notes`, type: "guide", displayName: "Tag Notes" });

    // Ada's account: what a link must carry over.
    const [aapl] = await db.select().from(instruments).where(eq(instruments.ticker, "AAPL"));
    await db.insert(follows).values([
      { followerId: ada.id, followedId: followed.id },
      { followerId: ada.id, followedId: guide.id },
    ]);
    await db.insert(watchlists).values({ entityId: ada.id, instrumentId: aapl!.id });
    await db.insert(paperPortfolios).values({ entityId: ada.id, name: `${tag} portfolio` });
    // A mirror of her own Guide, which the link must not turn into a self-mirror.
    const [mirrorBook] = await db
      .insert(paperPortfolios)
      .values({ entityId: ada.id, name: `${tag} mirror` })
      .returning();
    await db.insert(signalSimulatePortfolios).values({
      entityId: ada.id,
      followedEntityId: guide.id,
      paperPortfolioId: mirrorBook!.id,
    });
    await db.insert(notifications).values({ entityId: ada.id, type: "new_follower", title: "hello" });
    await db.insert(emailPreferences).values({ entityId: ada.id, digestEnabled: false });
    await db.insert(notificationPreferences).values({ entityId: ada.id, rankChange: false });
    await db.insert(brokerLinks).values({
      entityId: ada.id,
      provider: "snaptrade",
      providerAccountId: `${tag}-acct`,
      isVerified: true,
    });
  });

  afterAll(async () => {
    await db
      .delete(signalSimulatePortfolios)
      .where(inArray(signalSimulatePortfolios.entityId, created));
    await db
      .delete(guideApplications)
      .where(or(inArray(guideApplications.entityId, created), inArray(guideApplications.reviewedBy, created)));
    await db.delete(follows).where(or(inArray(follows.followerId, created), inArray(follows.followedId, created)));
    await db.delete(watchlists).where(inArray(watchlists.entityId, created));
    await db.delete(paperPortfolios).where(inArray(paperPortfolios.entityId, created));
    await db.delete(notifications).where(inArray(notifications.entityId, created));
    await db.delete(emailPreferences).where(inArray(emailPreferences.entityId, created));
    await db.delete(notificationPreferences).where(inArray(notificationPreferences.entityId, created));
    await db.delete(brokerLinks).where(inArray(brokerLinks.entityId, created));
    await db.delete(entities).where(inArray(entities.id, created));
  });

  it("takes one open application, naming an unowned Guide by its address", async () => {
    await expect(as(ada).guides.submitApplication({ pitch: "short" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const app = await as(ada).guides.submitApplication({
      pitch: PITCH,
      guideSlug: `https://www.deepmint.ai/guide/${guide.slug}/`,
    });
    expect(app).toMatchObject({ status: "pending", claimedGuideId: guide.id, linkedGuideId: null });
    await expect(as(ada).guides.submitApplication({ pitch: PITCH })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await as(ada).guides.myApplication())?.guide?.slug).toBe(guide.slug);
  });

  it("links the account to the Guide: the account moves, the old record stays", async () => {
    const [app] = (await as(admin, true).guides.adminList({})).filter(
      (a) => a.applicant.id === ada.id,
    );
    expect(app?.guide).toMatchObject({ id: guide.id, taken: false });

    const result = await as(admin, true).guides.adminReview({
      applicationId: app!.id,
      decision: "approve",
      link: true,
    });
    expect(result).toMatchObject({ status: "approved", linked: true, guideSlug: guide.slug });

    expect(await read(guide.id)).toMatchObject({
      clerkUserId: `${tag}-ada`,
      displayName: "Ada Analyst",
      avatarUrl: "https://img.example/ada.png",
      bio: "Ada's bio",
      brokerLinkStatus: "verified",
      snaptradeUserId: `dm-${tag}`,
      slug: guide.slug,
      type: "guide",
    });
    // The old Player keeps the record under her name, with no account.
    expect(await read(ada.id)).toMatchObject({
      clerkUserId: null,
      displayName: "Ada Analyst",
      type: "player",
      brokerLinkStatus: "none",
      snaptradeUserId: null,
    });
    // She signs in as the Guide from now on.
    expect(
      (await ensureEntityForClerkUser({ clerkUserId: `${tag}-ada`, displayName: "x", slug: "x" })).id,
    ).toBe(guide.id);

    const owner = async (table: typeof watchlists | typeof paperPortfolios | typeof notifications | typeof emailPreferences | typeof notificationPreferences | typeof brokerLinks) =>
      (await db.select({ entityId: table.entityId }).from(table).where(inArray(table.entityId, [ada.id, guide.id]))).map((r) => r.entityId);
    for (const table of [watchlists, notifications, emailPreferences, notificationPreferences, brokerLinks]) {
      expect(await owner(table)).toEqual([guide.id]);
    }
    expect(await owner(paperPortfolios)).toEqual([guide.id, guide.id]);
    const [mirror] = await db
      .select()
      .from(signalSimulatePortfolios)
      .where(eq(signalSimulatePortfolios.followedEntityId, guide.id));
    expect(mirror).toMatchObject({ entityId: guide.id, isActive: false });
    // Her follow of the Guide itself is gone; the other one moved.
    const theirFollows = await db
      .select()
      .from(follows)
      .where(inArray(follows.followerId, [ada.id, guide.id]));
    expect(theirFollows.map((f) => [f.followerId, f.followedId])).toEqual([[guide.id, followed.id]]);

    const [stored] = await db.select().from(guideApplications).where(eq(guideApplications.id, app!.id));
    expect(stored).toMatchObject({ status: "approved", linkedGuideId: guide.id, reviewedBy: admin.id });
  });

  it("will not link a Guide that already belongs to an account", async () => {
    await as(bob).guides.submitApplication({ pitch: PITCH, guideSlug: guide.slug }).then(
      () => expect.unreachable(),
      // Bob cannot even name it: it has an owner now.
      (err) => expect(err).toMatchObject({ code: "BAD_REQUEST" }),
    );
  });

  it("leaves an admin's own application to another admin", async () => {
    const own = await as(admin, true).guides.submitApplication({ pitch: PITCH });
    await expect(
      as(admin, true).guides.adminReview({ applicationId: own.id, decision: "approve" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("approves in place, and rejects", async () => {
    const forCyd = await as(cyd).guides.submitApplication({ pitch: PITCH });
    await expect(
      as(admin, true).guides.adminReview({ applicationId: forCyd.id, decision: "approve", link: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await as(admin, true).guides.adminReview({ applicationId: forCyd.id, decision: "approve" });
    expect((await read(cyd.id)).type).toBe("guide");

    const forBob = await as(bob).guides.submitApplication({ pitch: PITCH });
    await as(admin, true).guides.adminReview({
      applicationId: forBob.id,
      decision: "reject",
      note: "Where do you publish?",
    });
    await expect(
      as(admin, true).guides.adminReview({ applicationId: forBob.id, decision: "approve" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await as(bob).guides.myApplication())).toMatchObject({
      status: "rejected",
      reviewNote: "Where do you publish?",
    });
    expect((await read(bob.id)).type).toBe("player");
  });

  it("deleting the account anonymises the Guide and the old record", async () => {
    await anonymiseClerkUser(`${tag}-ada`);
    const [nowGuide, oldRecord] = [await read(guide.id), await read(ada.id)];
    expect(nowGuide).toMatchObject({ displayName: "Deleted user", avatarUrl: null, bio: null });
    expect(nowGuide.deletedAt).toBeInstanceOf(Date);
    expect(oldRecord).toMatchObject({ displayName: "Deleted user", slug: `deleted-${ada.id}` });
    expect(oldRecord.deletedAt).toBeInstanceOf(Date);
    // Her application said who she is: its text is gone.
    const [app] = await db.select().from(guideApplications).where(eq(guideApplications.entityId, ada.id));
    expect(app).toMatchObject({ pitch: "", sourceUrl: null, status: "approved" });
  });

  it("deleting through the old record reaches the linked Guide too", async () => {
    // As when a deletion looked the account up just before a link committed.
    const forDee = await as(dee).guides.submitApplication({ pitch: PITCH, guideSlug: guide2.slug });
    await as(admin, true).guides.adminReview({ applicationId: forDee.id, decision: "approve", link: true });
    await anonymiseEntity(dee.id);
    expect((await read(guide2.id)).deletedAt).toBeInstanceOf(Date);
    expect((await read(dee.id)).deletedAt).toBeInstanceOf(Date);
  });

  it("closes an open application when its applicant is deleted", async () => {
    await as(eve).guides.submitApplication({ pitch: PITCH, sourceUrl: "https://eve.example" });
    await anonymiseClerkUser(`${tag}-eve`);
    const [app] = await db.select().from(guideApplications).where(eq(guideApplications.entityId, eve.id));
    expect(app).toMatchObject({ status: "rejected", pitch: "", sourceUrl: null });
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { Webhook } from "svix";
import { db, eq, like } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { BASE_URL, API_KEY } from "../api-v1/helpers";

/**
 * Live test of the Clerk webhook (no mocks): payloads signed with the real
 * CLERK_WEBHOOK_SECRET are posted to the running server, which writes to its
 * database (DATABASE_URL). Same server prerequisites as the api-v1 suite;
 * skipped without TEST_API_KEY or CLERK_WEBHOOK_SECRET.
 */
const SECRET = process.env.CLERK_WEBHOOK_SECRET ?? "";
const clerkId = `user_zz_w2_${Date.now()}`;

function signed(body: string, secret = SECRET) {
  const msgId = `msg_${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  return {
    "Content-Type": "application/json",
    "svix-id": msgId,
    "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
    "svix-signature": new Webhook(secret).sign(msgId, now, body),
  };
}

describe.skipIf(!API_KEY || !SECRET)("POST /api/webhooks/clerk", () => {
  afterAll(async () => {
    await db.delete(entities).where(like(entities.clerkUserId, `${clerkId}%`));
  });

  const post = (type: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ type, data });
    return fetch(`${BASE_URL}/api/webhooks/clerk`, {
      method: "POST",
      headers: signed(body),
      body,
    });
  };
  const entityOf = async (id: string) =>
    (await db.select().from(entities).where(eq(entities.clerkUserId, id)))[0];

  it("verifies the raw body, so bytes JSON.stringify would change still pass", async () => {
    // Escaped slashes and a float written as 1.0 are valid JSON that a
    // parse-and-re-serialise round trip rewrites.
    const body =
      `{"type":"user.created","data":{"id":"${clerkId}","first_name":"J.P.","last_name":"Morgan",` +
      `"username":null,"image_url":"https:\\/\\/img.clerk.com\\/zz.png","email_addresses":[],` +
      `"external_accounts":[],"score":1.0}}`;
    const res = await fetch(`${BASE_URL}/api/webhooks/clerk`, {
      method: "POST",
      headers: signed(body),
      body,
    });
    expect(res.status).toBe(200);

    const [entity] = await db.select().from(entities).where(eq(entities.clerkUserId, clerkId));
    expect(entity?.displayName).toBe("J.P. Morgan");
    expect(entity?.slug).toMatch(/^j-p-morgan(-|$)/);
    expect(entity?.avatarUrl).toBe("https://img.clerk.com/zz.png");
  });

  describe("user.updated", () => {
    const id = `${clerkId}-updated`;
    const payload = (over: Record<string, unknown>) => ({
      id,
      first_name: "Ada",
      last_name: "Lovelace",
      username: null,
      image_url: "https://img.clerk.com/ada.png",
      ...over,
    });

    it("syncs name and avatar, and keeps the slug and the bio", async () => {
      expect((await post("user.created", payload({}))).status).toBe(200);
      const created = await entityOf(id);
      await db
        .update(entities)
        .set({ bio: "Set in Deepmint" })
        .where(eq(entities.id, created!.id));

      const res = await post(
        "user.updated",
        payload({
          first_name: "Augusta",
          last_name: "King",
          image_url: "https://img.clerk.com/augusta.png",
        }),
      );
      expect(res.status).toBe(200);

      const updated = await entityOf(id);
      expect(updated?.displayName).toBe("Augusta King");
      expect(updated?.avatarUrl).toBe("https://img.clerk.com/augusta.png");
      expect(updated?.slug).toBe(created?.slug);
      expect(updated?.bio).toBe("Set in Deepmint");
    });

    it("a late user.created does not undo it", async () => {
      expect((await post("user.created", payload({}))).status).toBe(200);
      expect((await entityOf(id))?.displayName).toBe("Augusta King");
    });

    it("keeps the old avatar when a new URL does not fit, and answers 200", async () => {
      const res = await post(
        "user.updated",
        payload({
          first_name: "Augusta",
          last_name: "King",
          image_url: `https://img.clerk.com/${"x".repeat(600)}`,
        }),
      );
      expect(res.status).toBe(200);
      expect((await entityOf(id))?.avatarUrl).toBe("https://img.clerk.com/augusta.png");
    });

    it("creates the entity if user.created never arrived", async () => {
      const missed = `${clerkId}-missed`;
      const res = await post("user.updated", payload({ id: missed }));
      expect(res.status).toBe(200);
      expect((await entityOf(missed))?.displayName).toBe("Ada Lovelace");
    });
  });

  it("rejects a payload signed with another secret", async () => {
    const body = `{"type":"user.created","data":{"id":"${clerkId}-x"}}`;
    const other = "whsec_" + Buffer.from("not-the-real-secret-000000000000").toString("base64");
    const res = await fetch(`${BASE_URL}/api/webhooks/clerk`, {
      method: "POST",
      headers: signed(body, other),
      body,
    });
    expect(res.status).toBe(400);
  });
});

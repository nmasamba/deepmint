import { describe, it, expect, afterAll } from "vitest";
import { Webhook } from "svix";
import { db, eq } from "@deepmint/db";
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
    await db.delete(entities).where(eq(entities.clerkUserId, clerkId));
  });

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

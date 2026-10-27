import { headers } from "next/headers";
import { Webhook } from "svix";
import { ensureEntityForClerkUser } from "@deepmint/db/queries/ensureEntityForClerkUser";
import { clerkDisplayName, slugify } from "@deepmint/shared";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    email_addresses: Array<{
      id: string;
      email_address: string;
    }>;
    image_url: string | null;
    external_accounts: Array<{
      provider: string;
      provider_user_id: string;
    }>;
  };
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Missing CLERK_WEBHOOK_SECRET environment variable. Set it in .env.local."
    );
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Verify the exact bytes Svix signed: re-serialising parsed JSON changes
  // escapes and number formats, and the signature then fails.
  const body = await req.text();

  const wh = new Webhook(WEBHOOK_SECRET);

  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "user.created") {
    const { id, first_name, last_name, username } = event.data;

    const displayName = clerkDisplayName({
      firstName: first_name,
      lastName: last_name,
      username,
    });

    // Idempotent: clerk_user_id is UNIQUE, so the previous bare insert threw a
    // duplicate-key error on any Clerk retry or manual Replay. That surfaced as
    // a 500, which Clerk retried, looping. Returning the existing row makes a
    // redelivery a no-op 200.
    const entity = await ensureEntityForClerkUser({
      clerkUserId: id,
      displayName,
      slug: slugify(displayName, "user"),
      avatarUrl: event.data.image_url,
    });

    // eslint-disable-next-line no-console
    console.log("[clerk webhook] entity ensured", {
      clerkUserId: id,
      slug: entity.slug,
    });
  }

  return new Response("OK", { status: 200 });
}

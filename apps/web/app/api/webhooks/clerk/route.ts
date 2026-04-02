import { headers } from "next/headers";
import { Webhook } from "svix";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { slugify } from "@deepmint/shared";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    first_name: string | null;
    last_name: string | null;
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

  const payload = await req.json();
  const body = JSON.stringify(payload);

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
    const { id, first_name, last_name, email_addresses, external_accounts } =
      event.data;

    const displayName =
      [first_name, last_name].filter(Boolean).join(" ") || "User";
    let slug = slugify(displayName);

    // Handle slug collisions by appending random suffix
    const [existing] = await db
      .select()
      .from(entities)
      .where(eq(entities.slug, slug))
      .limit(1);

    if (existing) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    await db.insert(entities).values({
      clerkUserId: id,
      type: "player",
      displayName,
      slug,
      avatarUrl: event.data.image_url,
    });

    // eslint-disable-next-line no-console
    console.log("[clerk webhook] entity created", { clerkUserId: id, slug });
  }

  return new Response("OK", { status: 200 });
}

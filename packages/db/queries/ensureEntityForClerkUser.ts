import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";

/** Max length of entities.slug / display_name (varchar(100)). */
const MAX_LEN = 100;
/** Attempts to resolve a slug collision before giving up. */
const MAX_SLUG_ATTEMPTS = 5;

export interface EnsureEntityInput {
  /** Clerk user id — the stable identity key. */
  clerkUserId: string;
  /** Human-readable name; falls back to "User" when blank. */
  displayName: string;
  /** Desired base slug. Uniqueness is resolved here, so pass the raw slugify() output. */
  slug: string;
  avatarUrl?: string | null;
}

/**
 * Idempotently resolve a Clerk user to their `entities` row, creating it if
 * absent. Returns the existing row unchanged when one is already present.
 *
 * This exists because entity creation must not depend on a single webhook
 * delivery succeeding. `clerk_user_id` is UNIQUE, so the previous
 * select-then-insert in the webhook route threw a duplicate-key error on any
 * Clerk retry or manual replay — surfacing as a 500, which Clerk then retried,
 * looping. Callers can now invoke this freely: on the webhook, on an
 * authenticated request, or both.
 *
 * Concurrency: two simultaneous requests for a new user both miss the initial
 * SELECT and both attempt an INSERT. The loser's insert violates the
 * clerk_user_id unique constraint, so after any failure we re-read by
 * clerkUserId and return the winner's row rather than retrying blindly.
 */
export async function ensureEntityForClerkUser(
  input: EnsureEntityInput,
): Promise<typeof entities.$inferSelect> {
  const existing = await findByClerkUserId(input.clerkUserId);
  if (existing) return existing;

  const displayName = (input.displayName || "").trim().slice(0, MAX_LEN) || "User";
  const baseSlug = (input.slug || "").trim().slice(0, MAX_LEN) || "user";

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    // First attempt uses the clean slug; later attempts add a random suffix.
    // Random rather than an incrementing counter because common display names
    // ("User") would otherwise collide repeatedly on the same -2, -3 sequence.
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug.slice(0, MAX_LEN - 7)}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const [created] = await db
        .insert(entities)
        .values({
          clerkUserId: input.clerkUserId,
          type: "player",
          displayName,
          slug,
          avatarUrl: input.avatarUrl ?? null,
        })
        .returning();
      if (created) return created;
    } catch {
      // Either clerk_user_id raced or the slug is taken. Re-read by
      // clerkUserId to tell them apart: a hit means another writer won and its
      // row is authoritative; a miss means the slug collided, so try another.
      const raced = await findByClerkUserId(input.clerkUserId);
      if (raced) return raced;
    }
  }

  throw new Error(
    `Could not create entity for Clerk user ${input.clerkUserId}: slug "${baseSlug}" unresolvable after ${MAX_SLUG_ATTEMPTS} attempts`,
  );
}

async function findByClerkUserId(
  clerkUserId: string,
): Promise<typeof entities.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(entities)
    .where(eq(entities.clerkUserId, clerkUserId))
    .limit(1);
  return row ?? null;
}

import { db, eq, and, isNull } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";

/**
 * Convert an arbitrary handle/name into a URL-safe, bounded slug.
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || "guide";
}

export interface ResolveGuideInput {
  /** Source handle / author name — used to derive the slug + display name. */
  handle: string;
  displayName?: string;
  /** Public profile/feed URL — the stable identity key for a scraped Guide. */
  sourceUrl?: string;
  styleTags?: string[];
  /** Whether this Guide's content is auto-ingested by the forward cron. */
  allowlisted?: boolean;
}

/**
 * Idempotently resolve a scraped source to a Guide entity, creating one if it
 * does not exist. Identity is keyed on sourceUrl first (the stable key for a
 * scraped analyst), then on the derived slug. This is the missing
 * source-handle → entities resolver for the ingestion pipeline.
 *
 * A slug matches only an ingested Guide (type guide, no Clerk user), so a
 * person who signed up under a firm's name never receives the firm's
 * ratings. When the slug is someone else's, the walk tries -2 to -6.
 *
 * Ingested Guides have clerkUserId null and isVerified false; they become
 * verified only via the broker/Proof-of-Skin flow or by claiming the profile.
 */
export async function resolveOrCreateGuide(
  input: ResolveGuideInput,
): Promise<string> {
  if (input.sourceUrl) {
    const [bySource] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.sourceUrl, input.sourceUrl))
      .limit(1);
    if (bySource) return bySource.id;
  }

  const baseSlug = slugify(input.handle);
  // display_name is varchar(100); a longer name would fail the insert.
  const displayName = (input.displayName ?? input.handle).slice(0, 100);

  const ingestedGuideAt = async (slug: string) => {
    const [found] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(
        and(
          eq(entities.slug, slug),
          eq(entities.type, "guide"),
          isNull(entities.clerkUserId),
        ),
      )
      .limit(1);
    return found?.id;
  };

  for (let n = 1; n <= 6; n++) {
    const slug = n === 1 ? baseSlug : `${baseSlug.slice(0, 98)}-${n}`;
    const existing = await ingestedGuideAt(slug);
    if (existing) return existing;

    const [created] = await db
      .insert(entities)
      .values({
        type: "guide",
        displayName,
        slug,
        sourceUrl: input.sourceUrl ?? null,
        styleTags: input.styleTags ?? [],
        isAllowlisted: input.allowlisted ?? false,
        isVerified: false,
      })
      .onConflictDoNothing({ target: entities.slug })
      .returning({ id: entities.id });
    if (created) return created.id;

    // The slug is taken: by a Guide created concurrently, or by someone else
    // (a signed-up user, a Player), in which case try the next suffix.
    const raced = await ingestedGuideAt(slug);
    if (raced) return raced;
  }
  throw new Error(
    `Could not resolve or create guide for handle: ${input.handle}`,
  );
}

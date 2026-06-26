import { db, eq } from "@deepmint/db";
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
  const [bySlug] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.slug, baseSlug))
    .limit(1);
  if (bySlug) return bySlug.id;

  // Create, resolving rare slug collisions (distinct analysts mapping to the
  // same base slug) by suffixing.
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [created] = await db
        .insert(entities)
        .values({
          type: "guide",
          displayName: input.displayName ?? input.handle,
          slug,
          sourceUrl: input.sourceUrl ?? null,
          styleTags: input.styleTags ?? [],
          isAllowlisted: input.allowlisted ?? false,
          isVerified: false,
        })
        .returning({ id: entities.id });
      return created!.id;
    } catch {
      // Slug already taken — re-check (race) then try a suffixed slug.
      const [again] = await db
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.slug, slug))
        .limit(1);
      if (again && slug === baseSlug) return again.id;
      slug = `${baseSlug}-${attempt + 2}`.slice(0, 100);
    }
  }
  throw new Error(
    `Could not resolve or create guide for handle: ${input.handle}`,
  );
}

import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { publicEntityColumns } from "@deepmint/db/queries/publicEntity";
import { EntityProfileHeader } from "@/components/EntityProfileHeader";
import { EntityProfileTabs } from "@/components/EntityProfileTabs";
import { resolveIsAdmin } from "@/lib/adminRole";
import { isDeletedAccount } from "@/lib/deletedAccount";

interface GuideProfilePageProps {
  params: Promise<{ slug: string }>;
}

export default async function GuideProfilePage({ params }: GuideProfilePageProps) {
  const { slug } = await params;

  // Only public columns reach the client component; the Clerk id and the
  // deletion date are read separately, for the checks below.
  const [row] = await db
    .select({
      ...publicEntityColumns,
      clerkUserId: entities.clerkUserId,
      deletedAt: entities.deletedAt,
    })
    .from(entities)
    .where(eq(entities.slug, slug))
    .limit(1);

  if (!row) {
    notFound();
  }
  const { clerkUserId, deletedAt, ...entity } = row;

  // Redirect if entity type doesn't match URL prefix
  if (entity.type !== "guide") {
    redirect(`/player/${entity.slug}`);
  }

  // No Follow or Mirror on your own profile: the server rejects both.
  const { userId, sessionClaims } = await auth();
  // Profiles are for members; a deleted account is no longer one (D18).
  if (await isDeletedAccount(userId)) notFound();
  const isOwnProfile = !!userId && clerkUserId === userId;
  // An admin may delete a user's account or an agent, not an ingested Guide.
  const isAdmin = await resolveIsAdmin(userId, sessionClaims);
  const canDelete =
    isAdmin && !isOwnProfile && !deletedAt && (!!clerkUserId || entity.isAgent);

  return (
    <div className="mx-auto max-w-4xl">
      <EntityProfileHeader
        entity={entity}
        isOwnProfile={isOwnProfile}
        isDeleted={!!deletedAt}
        canDelete={canDelete}
      />
      <EntityProfileTabs entityType="guide" entityId={entity.id} />
    </div>
  );
}

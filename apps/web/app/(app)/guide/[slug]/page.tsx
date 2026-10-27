import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { publicEntityColumns } from "@deepmint/db/queries/publicEntity";
import { EntityProfileHeader } from "@/components/EntityProfileHeader";
import { EntityProfileTabs } from "@/components/EntityProfileTabs";

interface GuideProfilePageProps {
  params: Promise<{ slug: string }>;
}

export default async function GuideProfilePage({ params }: GuideProfilePageProps) {
  const { slug } = await params;

  // Only public columns reach the client component; the Clerk id is read
  // separately for the own-profile check.
  const [row] = await db
    .select({ ...publicEntityColumns, clerkUserId: entities.clerkUserId })
    .from(entities)
    .where(eq(entities.slug, slug))
    .limit(1);

  if (!row) {
    notFound();
  }
  const { clerkUserId, ...entity } = row;

  // Redirect if entity type doesn't match URL prefix
  if (entity.type !== "guide") {
    redirect(`/player/${entity.slug}`);
  }

  // No Follow or Mirror on your own profile: the server rejects both.
  const { userId } = await auth();
  const isOwnProfile = !!userId && clerkUserId === userId;

  return (
    <div className="mx-auto max-w-4xl">
      <EntityProfileHeader entity={entity} hideFollow={isOwnProfile} />
      <EntityProfileTabs entityType="guide" entityId={entity.id} />
    </div>
  );
}

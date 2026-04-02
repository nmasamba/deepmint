import { notFound, redirect } from "next/navigation";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { EntityProfileHeader } from "@/components/EntityProfileHeader";
import { EntityProfileTabs } from "@/components/EntityProfileTabs";

interface PlayerProfilePageProps {
  params: Promise<{ slug: string }>;
}

export default async function PlayerProfilePage({ params }: PlayerProfilePageProps) {
  const { slug } = await params;

  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.slug, slug))
    .limit(1);

  if (!entity) {
    notFound();
  }

  // Redirect if entity type doesn't match URL prefix
  if (entity.type !== "player") {
    redirect(`/guide/${entity.slug}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <EntityProfileHeader entity={entity} />
      <EntityProfileTabs entityType="player" entityId={entity.id} />
    </div>
  );
}

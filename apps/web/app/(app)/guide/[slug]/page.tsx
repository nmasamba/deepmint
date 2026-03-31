import { notFound, redirect } from "next/navigation";
import { db } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { eq } from "drizzle-orm";
import { EntityProfileHeader } from "@/components/EntityProfileHeader";
import { EntityProfileTabs } from "@/components/EntityProfileTabs";

interface GuideProfilePageProps {
  params: Promise<{ slug: string }>;
}

export default async function GuideProfilePage({ params }: GuideProfilePageProps) {
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
  if (entity.type !== "guide") {
    redirect(`/player/${entity.slug}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <EntityProfileHeader entity={entity} />
      <EntityProfileTabs entityType="guide" />
    </div>
  );
}

import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";
import { createCaller, createContext } from "@deepmint/api";
import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";
import { ClaimCard } from "@/components/claims/ClaimCard";
import { ClaimNotes } from "@/components/claims/ClaimNotes";
import { ClaimProvenance } from "@/components/claims/ClaimProvenance";
import { ClaimAuditProof } from "@/components/claims/ClaimAuditProof";
import { resolveIsAdmin } from "@/lib/adminRole";

interface ClaimPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { id } = await params;

  // claims.detail decides who sees a claim that is not active. A deleted
  // account views as signed out (D18).
  const { userId: sessionUserId, sessionClaims } = await auth();
  const [found] = sessionUserId
    ? await db.select().from(entities).where(eq(entities.clerkUserId, sessionUserId)).limit(1)
    : [];
  const deleted = !!found?.deletedAt;
  const userId = deleted ? null : sessionUserId;
  const entity = deleted ? undefined : found;
  const isAdmin = await resolveIsAdmin(userId, sessionClaims);
  const caller = createCaller(createContext({ userId, entity: entity ?? null, isAdmin }));

  const detail = await caller.claims.detail({ id }).catch((err: unknown) => {
    if (err instanceof TRPCError && (err.code === "NOT_FOUND" || err.code === "BAD_REQUEST")) {
      return null;
    }
    throw err;
  });
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ClaimCard
        claim={detail.claim}
        entity={detail.entity}
        instrument={detail.instrument}
        outcomes={detail.outcomes}
        notesCount={detail.notesCount}
        exitDate={detail.exitDate}
        exitClosed={detail.exitClosed}
        source={detail.source}
        linkToDetail={false}
      />
      <ClaimProvenance claim={detail.claim} source={detail.source} outcomes={detail.outcomes} />
      <ClaimAuditProof
        claim={{
          id: detail.claim.id,
          direction: detail.claim.direction,
          horizonDays: detail.claim.horizonDays,
          createdAt: detail.claim.createdAt.toISOString(),
        }}
        showRootsLink={!!userId}
      />
      <ClaimNotes
        claimId={detail.claim.id}
        notes={detail.notes}
        canAdd={entity?.id === detail.claim.entityId}
      />
    </div>
  );
}

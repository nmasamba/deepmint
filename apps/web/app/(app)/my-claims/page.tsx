"use client";

import { trpc } from "@/lib/trpc";
import { SubmitClaimForm } from "@/components/claims/SubmitClaimForm";
import { ClaimsTimeline } from "@/components/claims/ClaimsTimeline";

export default function MyClaimsPage() {
  const { data: entity } = trpc.entity.me.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">My Claims</h1>
          <p className="mt-1 text-text-secondary">
            Your immutable prediction history.
          </p>
        </div>
        <SubmitClaimForm />
      </div>

      {entity ? (
        <ClaimsTimeline entityId={entity.id} showEntity={false} />
      ) : (
        <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
          <p className="text-text-secondary">Sign in to see your claims.</p>
        </div>
      )}
    </div>
  );
}

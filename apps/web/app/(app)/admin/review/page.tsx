"use client";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@deepmint/shared";
import { Check, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";

export default function AdminReviewPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.claims.pendingReview.useQuery({ limit: 50 });

  const reviewMutation = trpc.claims.reviewClaim.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.status === "active" ? "Claim approved" : "Claim rejected",
      );
      utils.claims.pendingReview.invalidate();
    },
    onError: (error) => {
      toast.error("Review failed", { description: error.message });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-text-primary">Claim Review</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Claim Review</h1>
        <p className="mt-1 text-text-secondary">
          {items.length} claim{items.length !== 1 ? "s" : ""} pending review
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
          <p className="text-text-secondary">No claims pending review.</p>
        </div>
      ) : (
        items.map((item) => {
          const DirectionIcon =
            item.claim.direction === "long"
              ? TrendingUp
              : item.claim.direction === "short"
                ? TrendingDown
                : Minus;
          const directionColor =
            item.claim.direction === "long"
              ? "text-green-500"
              : item.claim.direction === "short"
                ? "text-red-500"
                : "text-gray-400";

          return (
            <div
              key={item.claim.id}
              className="rounded-lg border border-border bg-bg-secondary p-6 space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text-primary">
                    {item.entity.displayName}
                  </span>
                  <Badge variant="outline" className="capitalize text-text-secondary border-border">
                    {item.entity.type}
                  </Badge>
                </div>
                <span className="font-mono text-sm font-bold text-accent">
                  {item.instrument.ticker}
                </span>
              </div>

              {/* Claim details */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={directionColor}>
                  <DirectionIcon className="mr-1 h-3 w-3" />
                  {item.claim.direction.toUpperCase()}
                </Badge>
                <Badge variant="outline" className="border-border text-text-secondary">
                  {item.claim.horizonDays}d
                </Badge>
                {item.claim.targetPriceCents && (
                  <Badge variant="outline" className="border-border font-mono text-text-secondary">
                    Target: {formatCurrency(item.claim.targetPriceCents)}
                  </Badge>
                )}
                {item.claim.confidence !== null && (
                  <Badge variant="outline" className="border-border text-text-secondary">
                    {item.claim.confidence}% conf
                  </Badge>
                )}
              </div>

              {/* Rationale */}
              {item.claim.rationale && (
                <div className="rounded border border-border/50 bg-bg-primary p-3">
                  <p className="text-xs font-medium text-text-secondary mb-1">
                    Extracted Rationale:
                  </p>
                  <p className="text-sm text-text-primary">
                    {item.claim.rationale}
                  </p>
                </div>
              )}

              {/* Source event text */}
              {item.eventText && (
                <div className="rounded border border-border/50 bg-bg-primary p-3">
                  <p className="text-xs font-medium text-text-secondary mb-1">
                    Source Text:
                  </p>
                  <p className="text-sm text-text-secondary line-clamp-4">
                    {item.eventText}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() =>
                    reviewMutation.mutate({
                      claimId: item.claim.id,
                      action: "approve",
                    })
                  }
                  disabled={reviewMutation.isPending}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                  onClick={() =>
                    reviewMutation.mutate({
                      claimId: item.claim.id,
                      action: "reject",
                    })
                  }
                  disabled={reviewMutation.isPending}
                >
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

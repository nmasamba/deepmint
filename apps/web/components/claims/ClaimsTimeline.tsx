"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { ClaimCard } from "./ClaimCard";
import { Skeleton } from "@/components/ui/skeleton";

interface ClaimsTimelineProps {
  entityId?: string;
  instrumentId?: string;
  showEntity?: boolean;
}

export function ClaimsTimeline({
  entityId,
  instrumentId,
  showEntity = true,
}: ClaimsTimelineProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = trpc.claims.list.useInfiniteQuery(
    {
      entityId,
      instrumentId,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allItems = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-bg-secondary p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
        <p className="text-text-secondary">No claims yet.</p>
        <p className="mt-1 text-sm text-text-secondary/60">
          Claims will appear here once submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allItems.map((item) => (
        <ClaimCard
          key={item.claim.id}
          claim={item.claim}
          entity={item.entity}
          instrument={item.instrument}
          showEntity={showEntity}
        />
      ))}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}
    </div>
  );
}

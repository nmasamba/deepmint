"use client";

import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap } from "lucide-react";
import Link from "next/link";

export function TrendingInfluencers() {
  const { data, isLoading } = trpc.influence.topInfluencers.useQuery({
    limit: 5,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">
            Trending Influencers
          </h3>
        </div>
        <p className="text-xs text-text-muted">
          Influence data will appear as claims are scored.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">
          Trending Influencers
        </h3>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <Link
            key={item.entity.id}
            href={`/guide/${item.entity.slug}`}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-tertiary"
          >
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={item.entity.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-bg-tertiary text-[10px] text-text-secondary">
                {item.entity.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-text-primary truncate block">
                {item.entity.displayName}
              </span>
            </div>
            <span className="font-mono text-xs text-accent">
              {item.influenceEvents30d}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

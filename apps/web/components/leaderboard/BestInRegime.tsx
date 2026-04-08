"use client";

import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RegimeBadge } from "./RegimeBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown } from "lucide-react";
import Link from "next/link";

export function BestInRegime() {
  const { data, isLoading } = trpc.leaderboard.bestInCurrentConditions.useQuery({
    limit: 5,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="flex gap-3 overflow-x-auto">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-36 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.entities.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="mb-4 flex items-center gap-2">
        <Crown className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">
          Best in Current Conditions
        </h2>
        <RegimeBadge regime={data.regime} size="sm" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {data.entities.map((item) => (
          <Link
            key={item.entity.id}
            href={`/${item.entity.type}/${item.entity.slug}`}
            className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-bg-primary p-3 transition-colors hover:border-accent/30 hover:bg-bg-tertiary"
            style={{ minWidth: 120 }}
          >
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarImage src={item.entity.avatarUrl ?? undefined} />
                <AvatarFallback className="bg-bg-tertiary text-xs text-text-secondary">
                  {item.entity.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {item.rank <= 3 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg-primary">
                  {item.rank}
                </span>
              )}
            </div>
            <span className="max-w-[100px] truncate text-xs font-medium text-text-primary">
              {item.entity.displayName}
            </span>
            <span className="font-mono text-xs text-accent">
              EIV {item.eivScore.toFixed(1)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

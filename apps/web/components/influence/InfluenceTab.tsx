"use client";

import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, Zap } from "lucide-react";

interface InfluenceTabProps {
  entityId: string;
}

export function InfluenceTab({ entityId }: InfluenceTabProps) {
  const { data, isLoading } = trpc.influence.byGuide.useQuery({ entityId });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  if (!data || data.influenceEvents30d === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
        <Users className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-2 text-sm text-text-secondary">
          No influence data yet.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Influence is detected when followers act on the same instruments
          within 48 hours of this Guide's claims.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
            <Users className="h-4 w-4" />
            Followers Acting
          </div>
          <div className="text-2xl font-mono font-semibold text-text-primary">
            {data.followerCount}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
            <Zap className="h-4 w-4" />
            Events (30d)
          </div>
          <div className="text-2xl font-mono font-semibold text-accent">
            {data.influenceEvents30d}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
            <Clock className="h-4 w-4" />
            Avg Response
          </div>
          <div className="text-2xl font-mono font-semibold text-text-primary">
            {data.avgLagHours ? `${data.avgLagHours.toFixed(1)}h` : "—"}
          </div>
        </div>
      </div>

      {/* Top instruments */}
      {data.topInstruments.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">
            Top Influenced Instruments
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.topInstruments.map((ticker) => (
              <span
                key={ticker}
                className="rounded-md bg-bg-tertiary px-3 py-1 font-mono text-sm text-text-primary"
              >
                {ticker}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

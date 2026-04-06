"use client";

import { trpc } from "@/lib/trpc";
import { ConsensusSignalBadge } from "@/components/ConsensusSignalBadge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export function Mag7Grid() {
  const { data, isLoading } = trpc.consensus.mag7.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-text-secondary text-sm">
        No consensus data available yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {data.map(({ instrument, signal }) => (
        <Link
          key={instrument.id}
          href={`/ticker/${instrument.ticker}`}
          className="rounded-lg border border-border bg-bg-secondary p-4 hover:bg-bg-tertiary transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-semibold text-text-primary">
              {instrument.ticker}
            </span>
            <span className="text-xs text-text-secondary truncate max-w-[100px]">
              {instrument.name}
            </span>
          </div>

          {signal ? (
            <div className="mt-2">
              <ConsensusSignalBadge
                direction={signal.direction}
                convictionStrength={parseFloat(signal.convictionStrength)}
                size="sm"
              />
              <div className="mt-2 flex gap-3 text-xs text-text-secondary">
                <span>{signal.activeClaims} claims</span>
                <span>
                  {signal.longCount}L / {signal.shortCount}S
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-text-secondary">
              No signals yet
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

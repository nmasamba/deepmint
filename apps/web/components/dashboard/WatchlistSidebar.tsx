"use client";

import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Eye } from "lucide-react";
import Link from "next/link";

export function WatchlistSidebar() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.social.myWatchlist.useQuery();

  const removeMutation = trpc.social.removeFromWatchlist.useMutation({
    onSuccess: () => {
      utils.social.myWatchlist.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Eye className="h-4 w-4" />
          Watchlist
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Eye className="h-4 w-4" />
          Watchlist
        </div>
        <p className="text-sm text-text-secondary/60">
          No instruments watched yet. Use the search or visit a ticker page to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
        <Eye className="h-4 w-4" />
        Watchlist
      </div>
      <div className="space-y-2">
        {data.map(({ watchlist, instrument }: { watchlist: { id: string }; instrument: { id: string; ticker: string; name: string; sector: string | null } }) => (
          <div
            key={watchlist.id}
            className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-bg-tertiary"
          >
            <Link
              href={`/ticker/${instrument.ticker}`}
              className="flex-1"
            >
              <span className="font-mono text-sm font-bold text-text-primary">
                {instrument.ticker}
              </span>
              <span className="ml-2 text-xs text-text-secondary truncate">
                {instrument.name}
              </span>
            </Link>
            <button
              onClick={() =>
                removeMutation.mutate({ instrumentId: instrument.id })
              }
              disabled={removeMutation.isPending}
              className="ml-2 rounded p-1 text-text-secondary/40 hover:bg-bg-primary hover:text-red-400"
              aria-label={`Remove ${instrument.ticker} from watchlist`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface WatchButtonProps {
  instrumentId: string;
  size?: "sm" | "default";
}

export function WatchButton({ instrumentId, size = "sm" }: WatchButtonProps) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.social.isWatching.useQuery({ instrumentId });

  const addMutation = trpc.social.addToWatchlist.useMutation({
    onSuccess: () => {
      utils.social.isWatching.invalidate({ instrumentId });
      utils.social.myWatchlist.invalidate();
    },
  });

  const removeMutation = trpc.social.removeFromWatchlist.useMutation({
    onSuccess: () => {
      utils.social.isWatching.invalidate({ instrumentId });
      utils.social.myWatchlist.invalidate();
    },
  });

  const isMutating = addMutation.isPending || removeMutation.isPending;
  const isWatching = data?.isWatching ?? false;

  if (isLoading) {
    return (
      <Button variant="outline" size={size} disabled className="border-border text-text-secondary">
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        Loading
      </Button>
    );
  }

  if (isWatching) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled={isMutating}
        className="border-border text-text-secondary hover:border-red-500 hover:text-red-400"
        onClick={() => removeMutation.mutate({ instrumentId })}
      >
        {isMutating ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <EyeOff className="mr-1.5 h-4 w-4" />
        )}
        Unwatch
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size={size}
      disabled={isMutating}
      className="border-accent text-accent hover:bg-accent/10"
      onClick={() => addMutation.mutate({ instrumentId })}
    >
      {isMutating ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Eye className="mr-1.5 h-4 w-4" />
      )}
      Watch
    </Button>
  );
}

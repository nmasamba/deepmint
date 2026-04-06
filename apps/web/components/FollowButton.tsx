"use client";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";

interface FollowButtonProps {
  targetEntityId: string;
}

export function FollowButton({ targetEntityId }: FollowButtonProps) {
  const utils = trpc.useUtils();

  const { data, isLoading: checkLoading } = trpc.social.isFollowing.useQuery(
    { targetEntityId },
  );

  const followMutation = trpc.social.follow.useMutation({
    onSuccess: () => {
      utils.social.isFollowing.invalidate({ targetEntityId });
      utils.social.followerCount.invalidate({ entityId: targetEntityId });
    },
  });

  const unfollowMutation = trpc.social.unfollow.useMutation({
    onSuccess: () => {
      utils.social.isFollowing.invalidate({ targetEntityId });
      utils.social.followerCount.invalidate({ entityId: targetEntityId });
    },
  });

  const isMutating = followMutation.isPending || unfollowMutation.isPending;
  const isFollowing = data?.isFollowing ?? false;

  if (checkLoading) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="border-accent text-accent"
      >
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        Loading
      </Button>
    );
  }

  if (isFollowing) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={isMutating}
        className="border-border text-text-secondary hover:border-red-500 hover:text-red-400 hover:bg-red-500/10"
        onClick={() => unfollowMutation.mutate({ targetEntityId })}
      >
        {isMutating ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <UserMinus className="mr-1.5 h-4 w-4" />
        )}
        Unfollow
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isMutating}
      className="border-accent text-accent hover:bg-accent/10"
      onClick={() => followMutation.mutate({ targetEntityId })}
    >
      {isMutating ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <UserPlus className="mr-1.5 h-4 w-4" />
      )}
      Follow
    </Button>
  );
}

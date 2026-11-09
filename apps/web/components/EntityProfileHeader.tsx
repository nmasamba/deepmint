"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, ShieldCheck, Calendar, Pencil, Trash2 } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { MirrorSignalsButton } from "@/components/signal-simulate/MirrorSignalsButton";
import { trpc } from "@/lib/trpc";

interface EntityProfileHeaderProps {
  entity: {
    id: string;
    displayName: string;
    slug: string;
    type: "player" | "guide";
    bio: string | null;
    avatarUrl: string | null;
    styleTags: string[] | null;
    isAgent: boolean;
    brokerLinkStatus: string | null;
    createdAt: string | Date;
  };
  /** The viewer's own profile: "Edit profile" instead of Follow and Mirror. */
  isOwnProfile?: boolean;
  /** A deleted account (D18): its record stays, with nothing to follow. */
  isDeleted?: boolean;
  /** An admin may delete this account: a user's or an agent's, not yet deleted. */
  canDelete?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function EntityProfileHeader({
  entity,
  isOwnProfile,
  isDeleted,
  canDelete,
}: EntityProfileHeaderProps) {
  const router = useRouter();
  const deleteAccount = trpc.entity.adminDelete.useMutation({
    onSuccess: (result) => {
      toast.success("Account deleted");
      router.replace(`/${entity.type}/${result.slug}`);
    },
    onError: (err) => toast.error("Delete failed", { description: err.message }),
  });
  const handleDelete = () => {
    if (
      !confirm(
        `Delete ${entity.displayName}'s account? Their name, bio and avatar are removed, their API keys revoked and broker links closed. Their claims and scores stay, as "Deleted user". This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteAccount.mutate({ entityId: entity.id });
  };

  // Verified means broker-verified, and nothing else (D7).
  const isVerified = entity.brokerLinkStatus === "verified";
  const styleTags = entity.styleTags ?? [];

  const { data: followerData } = trpc.social.followerCount.useQuery(
    { entityId: entity.id },
  );

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      {/* Avatar */}
      <Avatar className="h-20 w-20 shrink-0 border-2 border-border">
        <AvatarImage src={entity.avatarUrl ?? undefined} alt={entity.displayName} />
        <AvatarFallback className="bg-bg-tertiary text-lg text-text-primary">
          {getInitials(entity.displayName)}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-text-primary">
            {entity.displayName}
          </h1>

          {/* Type badge */}
          <Badge
            variant="outline"
            className={
              entity.type === "guide"
                ? "border-accent text-accent"
                : "border-blue-500 text-blue-400"
            }
          >
            {entity.type === "guide" ? "Guide" : "Player"}
          </Badge>

          {/* Agent badge */}
          {entity.isAgent && (
            <Badge variant="outline" className="border-border text-text-secondary">
              <Bot className="mr-1 h-3 w-3" />
              AI agent
            </Badge>
          )}

          {/* Verification badge */}
          {isVerified && (
            <div className="flex items-center gap-1 text-accent">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-medium">Verified</span>
            </div>
          )}
        </div>

        {/* Bio */}
        {entity.bio && (
          <p className="max-w-2xl text-sm text-text-secondary">{entity.bio}</p>
        )}

        {/* Style tags */}
        {styleTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {styleTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="bg-bg-tertiary text-text-muted"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            <span>Joined {formatDate(entity.createdAt)}</span>
          </div>
          <span>&middot;</span>
          <span>
            {followerData?.count ?? 0} follower{followerData?.count !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Follow + Mirror buttons, or the way to edit your own profile */}
        {isDeleted ? (
          <p className="text-sm text-text-secondary">
            This account was deleted. Its claims and scores stay on the record.
          </p>
        ) : isOwnProfile ? (
          <Link
            href="/settings#profile"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit profile
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <FollowButton targetEntityId={entity.id} />
            <MirrorSignalsButton targetEntityId={entity.id} />
          </div>
        )}

        {canDelete && !isDeleted && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={deleteAccount.isPending}
            className="border-red-500/30 text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            {deleteAccount.isPending ? "Deleting…" : "Delete account (admin)"}
          </Button>
        )}
      </div>
    </div>
  );
}

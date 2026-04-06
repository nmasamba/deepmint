"use client";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShieldCheck, Calendar } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
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
    isVerified: boolean | null;
    brokerLinkStatus: string | null;
    createdAt: string | Date;
  };
  /** Hide the follow button (e.g. on own profile) */
  hideFollow?: boolean;
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

export function EntityProfileHeader({ entity, hideFollow }: EntityProfileHeaderProps) {
  const isVerified =
    entity.isVerified || entity.brokerLinkStatus === "verified";
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

        {/* Follow button */}
        {!hideFollow && <FollowButton targetEntityId={entity.id} />}
      </div>
    </div>
  );
}

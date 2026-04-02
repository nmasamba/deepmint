"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Clock,
} from "lucide-react";
import { formatCurrency, formatBps } from "@deepmint/shared";

interface ClaimOutcome {
  id: string;
  horizon: string;
  returnBps: number;
  directionCorrect: boolean;
  targetHit: boolean | null;
}

interface ClaimCardProps {
  claim: {
    id: string;
    direction: "long" | "short" | "neutral";
    horizonDays: number;
    targetPriceCents: number | null;
    confidence: number | null;
    rationale: string | null;
    rationaleTags: string[] | null;
    entryPriceCents: number | null;
    createdAt: Date;
  };
  entity: {
    id: string;
    displayName: string;
    slug: string;
    type: "player" | "guide";
    avatarUrl: string | null;
  };
  instrument: {
    id: string;
    ticker: string;
    name: string;
  };
  outcomes?: ClaimOutcome[];
  notesCount?: number;
  showEntity?: boolean;
}

const HORIZON_LABELS: Record<number, string> = {
  1: "1D",
  7: "1W",
  30: "1M",
  90: "3M",
  180: "6M",
  365: "1Y",
};

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function maturesIn(createdAt: Date, horizonDays: number): string {
  const maturityDate = new Date(createdAt.getTime() + horizonDays * 86400000);
  const now = new Date();
  const diffDays = Math.ceil((maturityDate.getTime() - now.getTime()) / 86400000);
  if (diffDays <= 0) return "Matured";
  if (diffDays === 1) return "Matures tomorrow";
  if (diffDays < 30) return `Matures in ${diffDays}d`;
  const months = Math.floor(diffDays / 30);
  return `Matures in ${months}mo`;
}

export function ClaimCard({
  claim,
  entity,
  instrument,
  outcomes = [],
  notesCount = 0,
  showEntity = true,
}: ClaimCardProps) {
  const [expanded, setExpanded] = useState(false);

  const directionColor =
    claim.direction === "long"
      ? "text-green-500 border-green-500/30 bg-green-500/10"
      : claim.direction === "short"
        ? "text-red-500 border-red-500/30 bg-red-500/10"
        : "text-gray-400 border-gray-400/30 bg-gray-400/10";

  const DirectionIcon =
    claim.direction === "long"
      ? TrendingUp
      : claim.direction === "short"
        ? TrendingDown
        : Minus;

  const profilePath = `/${entity.type}/${entity.slug}`;

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {showEntity && (
            <Link href={profilePath}>
              <Avatar className="h-8 w-8">
                <AvatarImage src={entity.avatarUrl ?? undefined} />
                <AvatarFallback className="bg-bg-tertiary text-xs text-text-secondary">
                  {entity.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          )}
          <div>
            {showEntity && (
              <Link
                href={profilePath}
                className="text-sm font-medium text-text-primary hover:text-accent"
              >
                {entity.displayName}
              </Link>
            )}
            <div className="flex items-center gap-2">
              <Link
                href={`/ticker/${instrument.ticker}`}
                className="font-mono text-sm font-bold text-accent hover:underline"
              >
                {instrument.ticker}
              </Link>
              <span className="text-xs text-text-secondary">{instrument.name}</span>
            </div>
          </div>
        </div>

        <span className="shrink-0 text-xs text-text-secondary">
          {relativeTime(claim.createdAt)}
        </span>
      </div>

      {/* Badges row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={directionColor}>
          <DirectionIcon className="mr-1 h-3 w-3" />
          {claim.direction.toUpperCase()}
        </Badge>
        <Badge variant="outline" className="border-border text-text-secondary">
          {HORIZON_LABELS[claim.horizonDays] ?? `${claim.horizonDays}d`}
        </Badge>
        {claim.targetPriceCents && (
          <Badge variant="outline" className="border-border font-mono text-text-secondary">
            Target: {formatCurrency(claim.targetPriceCents)}
          </Badge>
        )}
        {claim.confidence !== null && (
          <Badge variant="outline" className="border-border text-text-secondary">
            {claim.confidence}% conf
          </Badge>
        )}
        {claim.entryPriceCents && (
          <span className="font-mono text-xs text-text-secondary">
            Entry: {formatCurrency(claim.entryPriceCents)}
          </span>
        )}
      </div>

      {/* Rationale */}
      {claim.rationale && (
        <div className="mt-3">
          <p className={`text-sm text-text-secondary ${!expanded ? "line-clamp-2" : ""}`}>
            {claim.rationale}
          </p>
          {claim.rationale.length > 150 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 flex items-center gap-1 text-xs text-accent hover:underline"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Show more <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Rationale tags */}
      {claim.rationaleTags && claim.rationaleTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {claim.rationaleTags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="border-border/50 text-[10px] capitalize text-text-secondary"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Outcomes */}
      <div className="mt-3 flex items-center gap-3 border-t border-border/50 pt-3">
        {outcomes.length > 0 ? (
          outcomes.map((outcome) => (
            <div key={outcome.id} className="flex items-center gap-1 text-xs">
              {outcome.directionCorrect ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <X className="h-3 w-3 text-red-500" />
              )}
              <span className="text-text-secondary">{outcome.horizon}:</span>
              <span
                className={`font-mono ${outcome.returnBps >= 0 ? "text-green-500" : "text-red-500"}`}
              >
                {formatBps(outcome.returnBps)}
              </span>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Clock className="h-3 w-3" />
            {maturesIn(claim.createdAt, claim.horizonDays)}
          </div>
        )}

        {notesCount > 0 && (
          <div className="ml-auto flex items-center gap-1 text-xs text-text-secondary">
            <MessageSquare className="h-3 w-3" />
            {notesCount}
          </div>
        )}
      </div>
    </div>
  );
}

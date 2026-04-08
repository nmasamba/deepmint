"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pause, TrendingUp, TrendingDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";

interface SignalSimulateCardProps {
  sim: {
    id: string;
    paperPortfolioId: string;
    isActive: boolean;
    createdAt: Date;
    followedEntity: {
      id: string;
      displayName: string;
      slug: string;
      type: "player" | "guide";
      avatarUrl: string | null;
    };
    portfolio: {
      name: string;
      startingBalanceCents: number;
    };
    tradeCount: number;
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function SignalSimulateCard({ sim, isSelected, onSelect }: SignalSimulateCardProps) {
  const utils = trpc.useUtils();
  const deactivate = trpc.signalSimulate.deactivate.useMutation({
    onSuccess: () => {
      utils.signalSimulate.list.invalidate();
    },
  });

  const profileHref =
    sim.followedEntity.type === "guide"
      ? `/guide/${sim.followedEntity.slug}`
      : `/player/${sim.followedEntity.slug}`;

  return (
    <div
      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
        isSelected
          ? "border-accent bg-accent/5"
          : "border-border bg-bg-secondary hover:bg-bg-tertiary"
      }`}
      onClick={() => onSelect(sim.id)}
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage
            src={sim.followedEntity.avatarUrl ?? undefined}
            alt={sim.followedEntity.displayName}
          />
          <AvatarFallback className="bg-bg-tertiary text-xs text-text-primary">
            {sim.followedEntity.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <Link
            href={profileHref}
            className="text-sm font-medium text-text-primary hover:text-accent"
            onClick={(e) => e.stopPropagation()}
          >
            {sim.followedEntity.displayName}
          </Link>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Badge
              variant="outline"
              className={
                sim.followedEntity.type === "guide"
                  ? "border-accent/50 text-accent text-[10px] px-1 py-0"
                  : "border-blue-500/50 text-blue-400 text-[10px] px-1 py-0"
              }
            >
              {sim.followedEntity.type}
            </Badge>
            <span>{sim.tradeCount} trades</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-text-muted hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            deactivate.mutate({ id: sim.id });
          }}
          disabled={deactivate.isPending}
          title="Stop mirroring"
        >
          <Pause className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

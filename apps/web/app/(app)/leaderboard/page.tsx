"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Trophy, TrendingUp, Target, BarChart3, Users } from "lucide-react";
import { RegimeBadge } from "@/components/leaderboard/RegimeBadge";
import { BestInRegime } from "@/components/leaderboard/BestInRegime";

const METRICS = [
  { value: "hit_rate", label: "Hit Rate", icon: Target },
  { value: "sharpe", label: "Sharpe Ratio", icon: TrendingUp },
  { value: "eiv_overall", label: "EIV", icon: BarChart3 },
  { value: "avg_return_bps", label: "Avg Return", icon: TrendingUp },
  { value: "influence_events_30d", label: "Most Influential", icon: Users },
] as const;

const REGIME_FILTERS = [
  { value: "", label: "All Regimes" },
  { value: "bull", label: "Bull" },
  { value: "bear", label: "Bear" },
  { value: "high_vol", label: "High Vol" },
  { value: "low_vol", label: "Low Vol" },
  { value: "rotation", label: "Rotation" },
] as const;

function formatScore(metric: string, value: number): string {
  if (metric === "hit_rate") return `${(value * 100).toFixed(1)}%`;
  if (metric === "avg_return_bps") return `${value.toFixed(0)} bps`;
  if (metric === "eiv_overall") return value.toFixed(1);
  return value.toFixed(2);
}

export default function LeaderboardPage() {
  const [entityType, setEntityType] = useState<"player" | "guide" | undefined>(
    undefined
  );
  const [metric, setMetric] = useState("hit_rate");
  const [regimeFilter, setRegimeFilter] = useState("");

  const { data: currentRegime } = trpc.regime.current.useQuery();

  const { data, isLoading } = trpc.leaderboard.top.useQuery({
    metric,
    entityType,
    regimeTag: regimeFilter || undefined,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-bold text-text-primary">Leaderboard</h1>
        {currentRegime && (
          <RegimeBadge regime={currentRegime.regime} />
        )}
      </div>

      {/* Best in Current Conditions */}
      <BestInRegime />

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Entity type filter */}
        <Tabs
          value={entityType ?? "all"}
          onValueChange={(v) =>
            setEntityType(v === "all" ? undefined : (v as "player" | "guide"))
          }
        >
          <TabsList className="bg-bg-secondary border border-border">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="player"
              className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
            >
              Players
            </TabsTrigger>
            <TabsTrigger
              value="guide"
              className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
            >
              Guides
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Metric filter */}
        <div className="flex gap-2">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => setMetric(m.value)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  metric === m.value
                    ? "bg-accent/10 text-accent border border-accent/30"
                    : "bg-bg-secondary text-text-secondary border border-border hover:bg-bg-tertiary"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Regime filter */}
        <div className="flex gap-2">
          {REGIME_FILTERS.map((r) => (
            <button
              key={r.value}
              onClick={() => setRegimeFilter(r.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                regimeFilter === r.value
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-bg-secondary text-text-secondary border border-border hover:bg-bg-tertiary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard table */}
      <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[3rem_1fr_6rem_5rem] sm:grid-cols-[3rem_1fr_8rem_6rem_5rem] gap-4 px-4 py-3 border-b border-border text-xs text-text-secondary font-medium uppercase tracking-wider">
          <span>Rank</span>
          <span>Entity</span>
          <span className="hidden sm:block">Type</span>
          <span className="text-right">Score</span>
          <span className="text-right">Horizon</span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="px-4 py-12 text-center text-text-secondary">
            No scores yet. AI will rank analysts once predictions are resolved against real outcomes.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.map((row) => (
              <Link
                key={`${row.entity.id}-${row.horizon}`}
                href={`/${row.entity.type}/${row.entity.slug}`}
                className="grid grid-cols-[3rem_1fr_6rem_5rem] sm:grid-cols-[3rem_1fr_8rem_6rem_5rem] gap-4 px-4 py-3 items-center hover:bg-bg-tertiary transition-colors"
              >
                {/* Rank */}
                <span
                  className={`font-mono text-sm ${
                    row.rank <= 3
                      ? "text-accent font-bold"
                      : "text-text-secondary"
                  }`}
                >
                  #{row.rank}
                </span>

                {/* Entity */}
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={row.entity.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-bg-tertiary text-text-secondary text-xs">
                      {row.entity.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-text-primary font-medium truncate">
                    {row.entity.displayName}
                  </span>
                </div>

                {/* Type */}
                <div className="hidden sm:block">
                  <Badge
                    variant="outline"
                    className={
                      row.entity.type === "guide"
                        ? "bg-accent/10 text-accent border-accent/30 text-xs"
                        : "bg-bg-tertiary text-text-secondary border-border text-xs"
                    }
                  >
                    {row.entity.type}
                  </Badge>
                </div>

                {/* Score */}
                <span className="text-right font-mono text-sm text-text-primary">
                  {formatScore(metric, row.score)}
                </span>

                {/* Horizon */}
                <span className="text-right text-xs text-text-secondary">
                  {row.horizon ?? "all"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Trophy, TrendingUp, Target, BarChart3, Users, ShieldCheck } from "lucide-react";
import { MIN_RANKED_OUTCOMES } from "@deepmint/shared";
import { RegimeBadge } from "@/components/leaderboard/RegimeBadge";
import { BestInRegime } from "@/components/leaderboard/BestInRegime";

const METRICS = [
  { value: "hit_rate", label: "Hit Rate", icon: Target },
  { value: "sharpe", label: "Sharpe Ratio", icon: TrendingUp },
  { value: "eiv_overall", label: "EIV", icon: BarChart3 },
  { value: "avg_return_bps", label: "Avg Return", icon: TrendingUp },
  { value: "influence_events_30d", label: "Most Influential", icon: Users },
] as const;

function formatScore(metric: string, value: number): string {
  if (metric === "hit_rate") return `${(value * 100).toFixed(1)}%`;
  if (metric === "avg_return_bps") return `${value.toFixed(0)} bps`;
  if (metric === "eiv_overall") return value.toFixed(1);
  if (metric === "influence_events_30d") return value.toFixed(0);
  return value.toFixed(2);
}

export default function LeaderboardPage() {
  const [entityType, setEntityType] = useState<"player" | "guide" | undefined>(
    undefined
  );
  const [metric, setMetric] = useState("hit_rate");

  const { data: currentRegime } = trpc.regime.current.useQuery();

  // Influence is aggregated per Guide in influence_scores, not in scores, so
  // that chip reads its own procedure (the same one as the dashboard's
  // Trending Influencers).
  const isInfluence = metric === "influence_events_30d";
  const scoresQuery = trpc.leaderboard.top.useQuery(
    {
      metric,
      entityType,
      limit: 50,
    },
    { enabled: !isInfluence },
  );
  const influenceQuery = trpc.influence.topInfluencers.useQuery(
    { entityType, limit: 50 },
    { enabled: isInfluence },
  );
  const data = isInfluence
    ? influenceQuery.data?.map((row) => ({
        rank: row.rank,
        entity: { ...row.entity, brokerLinkStatus: null },
        score: row.influenceEvents30d,
        horizon: "30d",
        sampleSize: null,
        isSignificant: false,
      }))
    : scoresQuery.data;
  const isLoading = isInfluence ? influenceQuery.isLoading : scoresQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-bold text-text-primary">Leaderboard</h1>
        {currentRegime && (
          <>
            <RegimeBadge regime={currentRegime.regime} />
            <span
              className="text-xs text-text-muted"
              title={
                currentRegime.defaultedFields.length > 0
                  ? `Unavailable, so defaulted: ${currentRegime.defaultedFields.join(", ")}`
                  : undefined
              }
            >
              as of {currentRegime.asOfDate}
              {currentRegime.defaultedFields.length > 0 && " · partial data"}
            </span>
          </>
        )}
      </div>

      {/* Best in Current Conditions */}
      <BestInRegime />

      {/* Filters */}
      <div className="space-y-3">
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

        {/* Metric filter — horizontal scroll on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => setMetric(m.value)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
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
            {isInfluence
              ? "No influence recorded in the last 30 days."
              : `No one has ${MIN_RANKED_OUTCOMES} scored claims yet. Rankings appear once claims are resolved against real market prices.`}
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
                  {row.entity.type === "player" &&
                    row.entity.brokerLinkStatus === "verified" && (
                      <ShieldCheck
                        className="h-4 w-4 shrink-0 text-accent"
                        aria-label="Broker verified"
                      />
                    )}
                  {row.isSignificant && (
                    <Badge
                      variant="outline"
                      className="hidden sm:inline-flex shrink-0 border-accent/30 text-accent text-xs"
                      title="Hit rate above 50% at p < 0.05, on at least 15 outcomes"
                    >
                      Significant
                    </Badge>
                  )}
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

                {/* Score, with the sample behind it */}
                <span className="text-right">
                  <span className="block font-mono text-sm text-text-primary">
                    {formatScore(metric, row.score)}
                  </span>
                  {row.sampleSize !== null && (
                    <span className="block text-xs text-text-secondary">
                      n={row.sampleSize}
                    </span>
                  )}
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

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClaimsTimeline } from "@/components/claims/ClaimsTimeline";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Shield,
  Zap,
  Users,
} from "lucide-react";
import { InfluenceTab } from "@/components/influence/InfluenceTab";

interface EntityProfileTabsProps {
  entityType: "player" | "guide";
  entityId: string;
}

function ScoreCard({
  label,
  value,
  format = "number",
  icon: Icon,
}: {
  label: string;
  value: number | null;
  format?: "percent" | "bps" | "number" | "score";
  icon: React.ElementType;
}) {
  const formatted =
    value === null
      ? "—"
      : format === "percent"
        ? `${(value * 100).toFixed(1)}%`
        : format === "bps"
          ? `${value.toFixed(0)} bps`
          : format === "score"
            ? value.toFixed(1)
            : value.toFixed(2);

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-xl font-mono font-semibold text-text-primary">
        {formatted}
      </div>
    </div>
  );
}

function OverviewTab({
  entityType,
  entityId,
}: {
  entityType: "player" | "guide";
  entityId: string;
}) {
  const { data: scoresData, isLoading } = trpc.scores.byEntity.useQuery({
    entityId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const getScore = (metric: string): number | null => {
    const score = scoresData?.find((s) => s.metric === metric);
    return score ? parseFloat(score.value) : null;
  };

  const eiv = getScore("eiv_overall");

  return (
    <div className="space-y-6">
      {/* EIV Card */}
      <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-6">
        <div className="flex items-center gap-2 text-accent text-sm mb-2">
          <Zap className="h-4 w-4" />
          Earned Information Value (EIV)
        </div>
        <div className="text-3xl font-mono font-bold text-text-primary">
          {eiv !== null ? eiv.toFixed(1) : "—"}
          <span className="text-lg text-text-secondary ml-2">/ 100</span>
        </div>
        <p className="text-xs text-text-secondary mt-1">
          {eiv !== null && eiv >= 60
            ? "Strong Edge"
            : eiv !== null && eiv >= 30
              ? "Moderate Edge"
              : eiv !== null && eiv > 0
                ? "Weak Edge"
                : "No data yet"}
        </p>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 gap-4">
        {entityType === "guide" ? (
          <>
            <ScoreCard
              label="Hit Rate"
              value={getScore("hit_rate")}
              format="percent"
              icon={Target}
            />
            <ScoreCard
              label="Avg Return"
              value={getScore("avg_return_bps")}
              format="bps"
              icon={TrendingUp}
            />
            <ScoreCard
              label="Z-Score"
              value={getScore("z_score")}
              icon={BarChart3}
            />
            <ScoreCard
              label="Brier Score"
              value={getScore("calibration_brier")}
              icon={Target}
            />
          </>
        ) : (
          <>
            <ScoreCard
              label="Sharpe Ratio"
              value={getScore("sharpe")}
              icon={TrendingUp}
            />
            <ScoreCard
              label="Calmar Ratio"
              value={getScore("calmar")}
              icon={TrendingUp}
            />
            <ScoreCard
              label="Max Drawdown"
              value={getScore("max_drawdown")}
              format="percent"
              icon={TrendingDown}
            />
            <ScoreCard
              label="Consistency"
              value={getScore("consistency")}
              format="score"
              icon={Shield}
            />
          </>
        )}
      </div>
    </div>
  );
}

function StatsTab({
  entityType,
  entityId,
}: {
  entityType: "player" | "guide";
  entityId: string;
}) {
  const { data: scoresData, isLoading } = trpc.scores.byEntity.useQuery({
    entityId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }

  if (!scoresData || scoresData.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        <p className="text-text-secondary">
          No scoring data available yet. Scores appear after claims are resolved.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
      <div className="grid grid-cols-[1fr_8rem_6rem] gap-4 px-4 py-3 border-b border-border text-xs text-text-secondary font-medium uppercase tracking-wider">
        <span>Metric</span>
        <span className="text-right">Value</span>
        <span className="text-right">Horizon</span>
      </div>
      <div className="divide-y divide-border">
        {scoresData.map((score) => (
          <div
            key={score.id}
            className="grid grid-cols-[1fr_8rem_6rem] gap-4 px-4 py-3 items-center"
          >
            <span className="text-text-primary text-sm">
              {score.metric.replace(/_/g, " ")}
              {score.regimeTag && (
                <Badge
                  variant="outline"
                  className="ml-2 text-xs bg-bg-tertiary text-text-secondary border-border"
                >
                  {score.regimeTag}
                </Badge>
              )}
            </span>
            <span className="text-right font-mono text-sm text-text-primary">
              {parseFloat(score.value).toFixed(4)}
            </span>
            <span className="text-right text-xs text-text-secondary">
              {score.horizon ?? "all"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EntityProfileTabs({
  entityType,
  entityId,
}: EntityProfileTabsProps) {
  return (
    <Tabs defaultValue="overview" className="mt-8">
      <TabsList className="bg-bg-secondary border border-border">
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="claims"
          className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
        >
          Claims
        </TabsTrigger>
        <TabsTrigger
          value="stats"
          className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
        >
          Stats
        </TabsTrigger>
        {entityType === "guide" && (
          <TabsTrigger
            value="influence"
            className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
          >
            Influence
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <OverviewTab entityType={entityType} entityId={entityId} />
      </TabsContent>

      <TabsContent value="claims" className="mt-6">
        <ClaimsTimeline entityId={entityId} showEntity={false} />
      </TabsContent>

      <TabsContent value="stats" className="mt-6">
        <StatsTab entityType={entityType} entityId={entityId} />
      </TabsContent>

      {entityType === "guide" && (
        <TabsContent value="influence" className="mt-6">
          <InfluenceTab entityId={entityId} />
        </TabsContent>
      )}
    </Tabs>
  );
}

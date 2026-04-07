"use client";

import { ConsensusBreakdown } from "@/components/ticker/ConsensusBreakdown";
import { TopEntitiesPanel } from "@/components/ticker/TopEntitiesPanel";
import { WatchButton } from "@/components/WatchButton";
import { trpc } from "@/lib/trpc";

interface TickerClientSectionProps {
  instrumentId: string;
  consensus: {
    longCount: number;
    shortCount: number;
    neutralCount: number;
    weightedBullishScore: string;
    weightedBearishScore: string;
    weightedNeutralScore: string;
    avgTargetPriceCents: number | null;
    targetDispersionBps: number | null;
    activeClaims: number;
  } | null;
  priceCents: number;
  ticker: string;
}

export function TickerClientSection({
  instrumentId,
  consensus,
  priceCents,
  ticker,
}: TickerClientSectionProps) {
  const { data } = trpc.ticker.overview.useQuery({ ticker });

  interface EntityWithMetric {
    entity: {
      id: string;
      displayName: string;
      slug: string;
      type: "player" | "guide";
      avatarUrl: string | null;
      isVerified: boolean | null;
      brokerLinkStatus: string | null;
    };
    eiv?: string;
    sharpe?: string;
  }

  // Use server-provided data, enriched with client data for top entities
  const topGuides =
    data && data.isMag7
      ? (data.topGuides as EntityWithMetric[]).map((g) => ({
          entity: g.entity,
          metricValue: Number(g.eiv).toFixed(1),
          metricLabel: "EIV",
        }))
      : [];

  const topPlayers =
    data && data.isMag7
      ? (data.topPlayers as EntityWithMetric[]).map((p) => ({
          entity: p.entity,
          metricValue: Number(p.sharpe).toFixed(2),
          metricLabel: "Sharpe",
        }))
      : [];

  return (
    <>
      {/* Consensus Breakdown */}
      {consensus && (
        <ConsensusBreakdown
          longCount={consensus.longCount}
          shortCount={consensus.shortCount}
          neutralCount={consensus.neutralCount}
          weightedBullish={Number(consensus.weightedBullishScore)}
          weightedBearish={Number(consensus.weightedBearishScore)}
          weightedNeutral={Number(consensus.weightedNeutralScore)}
          avgTargetPriceCents={consensus.avgTargetPriceCents}
          currentPriceCents={priceCents}
          targetDispersionBps={consensus.targetDispersionBps}
          activeClaims={consensus.activeClaims}
        />
      )}

      {/* Top entities panels */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TopEntitiesPanel title="Top Guides" entities={topGuides} />
        <TopEntitiesPanel title="Top Players" entities={topPlayers} />
      </div>

      {/* Watch button */}
      <WatchButton instrumentId={instrumentId} />
    </>
  );
}

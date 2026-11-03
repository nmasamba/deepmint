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
  priceCents: number | null;
  ticker: string;
}

export function TickerClientSection({
  instrumentId,
  consensus,
  priceCents,
  ticker,
}: TickerClientSectionProps) {
  const { data, isLoading, isError } = trpc.ticker.overview.useQuery({ ticker });

  interface TopRow {
    entity: {
      id: string;
      displayName: string;
      slug: string;
      type: "player" | "guide";
      avatarUrl: string | null;
      isVerified: boolean | null;
      brokerLinkStatus: string | null;
    };
    outcomes: number;
    hitRate: number;
  }

  // Hit rate on this ticker, with the sample it is based on
  const toRows = (rows: TopRow[]) =>
    rows.map((r) => ({
      entity: r.entity,
      metricValue: `${Math.round(r.hitRate * 100)}%`,
      metricLabel: `hit · n=${r.outcomes}`,
    }));

  const topGuides = data && data.isMag7 ? toRows(data.topGuides) : [];
  const topPlayers = data && data.isMag7 ? toRows(data.topPlayers) : [];
  const panelState = { isLoading, isError };

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
        <TopEntitiesPanel title="Top Guides" entities={topGuides} {...panelState} />
        <TopEntitiesPanel title="Top Players" entities={topPlayers} {...panelState} />
      </div>

      {/* Watch button */}
      <WatchButton instrumentId={instrumentId} />
    </>
  );
}

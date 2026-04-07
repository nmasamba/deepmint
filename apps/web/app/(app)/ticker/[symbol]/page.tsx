import { notFound } from "next/navigation";
import { db, eq, desc } from "@deepmint/db";
import { instruments, consensusSignals } from "@deepmint/db/schema";
import { MAG7_TICKERS } from "@deepmint/shared";
import { getCurrentPrice } from "@deepmint/shared";
import { TickerClaimsSection } from "./TickerClaimsSection";
import { TickerClientSection } from "./TickerClientSection";

interface TickerPageProps {
  params: Promise<{ symbol: string }>;
}

export default async function TickerPage({ params }: TickerPageProps) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  // Non-Mag-7 guard
  if (!(MAG7_TICKERS as readonly string[]).includes(ticker)) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <h1 className="font-mono text-3xl font-bold text-text-primary">
          {ticker}
        </h1>
        <p className="mt-4 text-lg text-text-secondary">Coming soon</p>
        <p className="mt-2 text-sm text-text-secondary/60">
          Deepmint currently tracks Mag 7 instruments only. More tickers are on the way.
        </p>
      </div>
    );
  }

  // Fetch instrument
  const [instrument] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.ticker, ticker))
    .limit(1);

  if (!instrument) {
    notFound();
  }

  // Parallel SSR fetches
  const [consensus, priceCents] = await Promise.all([
    db
      .select()
      .from(consensusSignals)
      .where(eq(consensusSignals.instrumentId, instrument.id))
      .orderBy(desc(consensusSignals.asOfDate))
      .limit(1)
      .then((rows: Array<typeof consensusSignals.$inferSelect>) => rows[0] ?? null),
    getCurrentPrice(ticker),
  ]);

  const consensusColor =
    consensus?.direction === "bullish"
      ? "text-green-500"
      : consensus?.direction === "bearish"
        ? "text-red-500"
        : "text-gray-400";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-3xl font-bold text-text-primary">
              {instrument.ticker}
            </h1>
            {consensus && (
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${consensusColor} ${
                  consensus.direction === "bullish"
                    ? "bg-green-500/10"
                    : consensus.direction === "bearish"
                      ? "bg-red-500/10"
                      : "bg-gray-500/10"
                }`}
              >
                {consensus.direction}
              </span>
            )}
          </div>
          <p className="mt-1 text-text-secondary">{instrument.name}</p>
          {instrument.sector && (
            <p className="text-sm text-text-secondary/60">{instrument.sector}</p>
          )}
        </div>

        {/* Price */}
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-text-primary">
            ${(priceCents / 100).toFixed(2)}
          </p>
          {consensus && (
            <p className="mt-1 text-xs text-text-secondary">
              Based on {consensus.activeClaims} active claim{consensus.activeClaims !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Consensus Signal Badge — large */}
      {consensus && (
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-text-secondary">
                Consensus Signal
              </p>
              <p
                className={`text-2xl font-bold uppercase ${consensusColor}`}
              >
                {consensus.direction}
              </p>
              <p className="mt-1 text-xs text-text-secondary/60">
                Weighted by analyst accuracy
              </p>
            </div>
            {/* Conviction strength meter */}
            <div className="w-full max-w-xs">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Conviction</span>
                <span className="font-mono">
                  {Math.round(Number(consensus.convictionStrength) * 100)}%
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-bg-primary">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(Number(consensus.convictionStrength) * 100)}%`,
                    backgroundColor:
                      consensus.direction === "bullish"
                        ? "#22C55E"
                        : consensus.direction === "bearish"
                          ? "#EF4444"
                          : "#64748B",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client-side sections: breakdown, top entities, watch button */}
      <TickerClientSection
        instrumentId={instrument.id}
        consensus={
          consensus
            ? {
                longCount: consensus.longCount,
                shortCount: consensus.shortCount,
                neutralCount: consensus.neutralCount,
                weightedBullishScore: consensus.weightedBullishScore,
                weightedBearishScore: consensus.weightedBearishScore,
                weightedNeutralScore: consensus.weightedNeutralScore,
                avgTargetPriceCents: consensus.avgTargetPriceCents,
                targetDispersionBps: consensus.targetDispersionBps,
                activeClaims: consensus.activeClaims,
              }
            : null
        }
        priceCents={priceCents}
        ticker={ticker}
      />

      {/* Claims for this instrument */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          Recent Claims
        </h2>
        <TickerClaimsSection instrumentId={instrument.id} />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { db, eq, desc } from "@deepmint/db";
import { instruments, consensusSignals } from "@deepmint/db/schema";
import { TickerClaimsSection } from "./TickerClaimsSection";

interface TickerPageProps {
  params: Promise<{ symbol: string }>;
}

export default async function TickerPage({ params }: TickerPageProps) {
  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  // Fetch instrument
  const [instrument] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.ticker, ticker))
    .limit(1);

  if (!instrument) {
    notFound();
  }

  // Fetch latest consensus signal
  const [consensus] = await db
    .select()
    .from(consensusSignals)
    .where(eq(consensusSignals.instrumentId, instrument.id))
    .orderBy(desc(consensusSignals.asOfDate))
    .limit(1);

  const consensusColor =
    consensus?.direction === "bullish"
      ? "text-green-500"
      : consensus?.direction === "bearish"
        ? "text-red-500"
        : "text-gray-400";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Ticker header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-3xl font-bold text-text-primary">
            {instrument.ticker}
          </h1>
          {consensus && (
            <span className={`text-sm font-medium capitalize ${consensusColor}`}>
              {consensus.direction}
            </span>
          )}
        </div>
        <p className="mt-1 text-text-secondary">{instrument.name}</p>
        {instrument.sector && (
          <p className="text-sm text-text-secondary/60">{instrument.sector}</p>
        )}
      </div>

      {/* Consensus details */}
      {consensus && (
        <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-bg-secondary p-4">
          <div className="text-center">
            <p className="text-xs text-text-secondary">Long</p>
            <p className="font-mono text-lg font-bold text-green-500">
              {consensus.longCount}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-secondary">Short</p>
            <p className="font-mono text-lg font-bold text-red-500">
              {consensus.shortCount}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-secondary">Neutral</p>
            <p className="font-mono text-lg font-bold text-gray-400">
              {consensus.neutralCount}
            </p>
          </div>
        </div>
      )}

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

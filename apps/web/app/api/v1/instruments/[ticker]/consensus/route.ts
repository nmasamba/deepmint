import { NextRequest } from "next/server";
import { db, eq, desc } from "@deepmint/db";
import { instruments, consensusSignals } from "@deepmint/db/schema";
import { authenticateRequest } from "../../../lib/auth";
import { jsonSuccess, jsonError, corsPreflight } from "../../../lib/response";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/v1/instruments/:ticker/consensus
 *
 * Returns the latest consensus signal for an instrument.
 * Weighted direction scores only — raw individual claims are not exposed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const auth = await authenticateRequest(req, "consensus:read");
  if (!auth.ok) return auth.response;

  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const [instrument] = await db
    .select({
      id: instruments.id,
      ticker: instruments.ticker,
      name: instruments.name,
      exchange: instruments.exchange,
      assetClass: instruments.assetClass,
      sector: instruments.sector,
    })
    .from(instruments)
    .where(eq(instruments.ticker, upperTicker))
    .limit(1);

  if (!instrument) {
    return jsonError(
      "NOT_FOUND",
      `Instrument ${upperTicker} not found`,
      404,
      { rateLimit: auth.rateLimit },
    );
  }

  const [signal] = await db
    .select()
    .from(consensusSignals)
    .where(eq(consensusSignals.instrumentId, instrument.id))
    .orderBy(desc(consensusSignals.asOfDate))
    .limit(1);

  const publicInstrument = {
    ticker: instrument.ticker,
    name: instrument.name,
    exchange: instrument.exchange,
    assetClass: instrument.assetClass,
    sector: instrument.sector,
  };

  if (!signal) {
    return jsonSuccess(
      {
        instrument: publicInstrument,
        consensus: null,
      },
      { rateLimit: auth.rateLimit },
    );
  }

  return jsonSuccess(
    {
      instrument: publicInstrument,
      consensus: {
        direction: signal.direction,
        longCount: signal.longCount,
        shortCount: signal.shortCount,
        neutralCount: signal.neutralCount,
        weightedBullishScore: parseFloat(signal.weightedBullishScore),
        weightedBearishScore: parseFloat(signal.weightedBearishScore),
        weightedNeutralScore: parseFloat(signal.weightedNeutralScore),
        convictionStrength: parseFloat(signal.convictionStrength),
        avgTargetPriceCents: signal.avgTargetPriceCents,
        targetDispersionBps: signal.targetDispersionBps,
        activeClaims: signal.activeClaims,
        asOfDate: signal.asOfDate,
      },
    },
    { rateLimit: auth.rateLimit },
  );
}

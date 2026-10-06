import { db, desc } from "@deepmint/db";
import { marketRegimes } from "@deepmint/db/schema";
import { fromRegimeSnapshotValues, type MarketRegime } from "@deepmint/scoring";

/**
 * The latest stored market-regime snapshot, or null before the first one has
 * been computed. Interactive reads must use this, never getRegimeIndicators:
 * computing a regime takes ~25 throttled Polygon calls (minutes). The
 * market-regime-snapshot worker writes one row per weekday.
 */
export async function getLatestMarketRegime() {
  const [row] = await db
    .select()
    .from(marketRegimes)
    .orderBy(desc(marketRegimes.asOfDate))
    .limit(1);
  if (!row) return null;

  return {
    regime: row.regime as MarketRegime,
    asOfDate: row.asOfDate,
    detectedAt: row.computedAt.toISOString(),
    indicators: fromRegimeSnapshotValues(row),
    defaultedFields: row.defaultedFields,
  };
}

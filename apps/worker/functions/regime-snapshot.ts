import { inngest } from "../inngest";
import { db, eq } from "@deepmint/db";
import { marketRegimes } from "@deepmint/db/schema";
import { detectRegime, toRegimeSnapshotValues } from "@deepmint/scoring";
import { getRegimeIndicators } from "@deepmint/shared";

/**
 * Return the stored market-regime snapshot for `asOfDate` (YYYY-MM-DD),
 * computing and storing it first if it doesn't exist yet.
 *
 * Computing takes ~25 throttled Polygon calls (minutes), which is why it runs
 * here in the background and interactive pages only ever read the row.
 *
 * Throws when every indicator fell back to its default: that is not a market
 * reading, and storing it as one would mislabel the day. A partly-defaulted
 * snapshot is stored with `defaulted_fields` naming what fell back.
 */
export async function ensureRegimeSnapshot(asOfDate: string) {
  const [existing] = await db
    .select()
    .from(marketRegimes)
    .where(eq(marketRegimes.asOfDate, asOfDate))
    .limit(1);
  if (existing) return existing;

  const { defaulted, ...indicators } = await getRegimeIndicators();
  if (defaulted.length === 3) {
    throw new Error(
      `[regime] all indicators unavailable for ${asOfDate}; not storing a snapshot`,
    );
  }

  await db
    .insert(marketRegimes)
    .values({
      asOfDate,
      regime: detectRegime(indicators),
      ...toRegimeSnapshotValues(indicators),
      defaultedFields: defaulted,
    })
    .onConflictDoNothing({ target: marketRegimes.asOfDate });

  const [row] = await db
    .select()
    .from(marketRegimes)
    .where(eq(marketRegimes.asOfDate, asOfDate))
    .limit(1);
  return row!;
}

/**
 * Daily market-regime snapshot: 21:30 UTC on weekdays, after the US close.
 * Runs on its own clock so the regime stays current even on days when no claim
 * matures (scoring, which also uses the regime, runs only after a markout).
 */
export const regimeSnapshotFunction = inngest.createFunction(
  {
    id: "market-regime-snapshot",
    retries: 2,
    triggers: [{ cron: "30 21 * * 1-5" }],
  },
  async ({ step }) => {
    const snapshot = await step.run("snapshot", () =>
      ensureRegimeSnapshot(new Date().toISOString().slice(0, 10)),
    );
    console.log(
      `[regime] ${snapshot.asOfDate}: ${snapshot.regime}` +
        (snapshot.defaultedFields.length
          ? ` (defaulted: ${snapshot.defaultedFields.join(", ")})`
          : ""),
    );
    return { asOfDate: snapshot.asOfDate, regime: snapshot.regime };
  },
);

import { inngest } from "../inngest";
import { db, eq, isNull } from "@deepmint/db";
import {
  instruments,
  paperEquitySnapshots,
  paperPortfolios,
  paperTrades,
} from "@deepmint/db/schema";
import { MAG7_TICKERS, getLatestCloses } from "@deepmint/shared";
import { easternDateTime } from "@deepmint/scoring";
import { valuePortfolio } from "@deepmint/api/lib/paperAccounting";

/**
 * Paper equity snapshot: 07:00 US Eastern, Tuesday to Saturday, valuing the
 * session that closed the day before (D19 option 2). At that hour the latest
 * close is that session's, final and the same on every run, and no other
 * Polygon job is running (they fill the evening, from markout at 17:00 to
 * consensus at 18:30). Values every paper portfolio with one getLatestCloses
 * over the tickers held open anywhere (at most the Mag 7, so at most 7
 * throttled calls), and stores one row per portfolio per session. A rerun, or
 * a run after a market holiday, finds that session stored and writes nothing.
 *
 * A close that cannot be fetched makes the run retry; on its last attempt the
 * portfolios holding that ticker are skipped rather than valued wrongly.
 * Without POLYGON_API_KEY nothing is written.
 */
const RETRIES = 2;

export const paperEquitySnapshotFunction = inngest.createFunction(
  {
    id: "paper-equity-snapshot",
    retries: RETRIES,
    triggers: [{ cron: "TZ=America/New_York 0 7 * * 2-6" }],
  },
  async ({ step, attempt }) => {
    const tickers = await step.run("open-tickers", async () => {
      const rows = await db
        .selectDistinct({ ticker: instruments.ticker })
        .from(paperTrades)
        .innerJoin(instruments, eq(paperTrades.instrumentId, instruments.id))
        .where(isNull(paperTrades.closedAt));
      return rows.map((r) => r.ticker);
    });

    // The Polygon calls, in their own step: up to 7 at 12.5 s apart. A Mag-7
    // ticker is always asked for, so a run with no open positions still knows
    // which session it is valuing.
    const closes = await step.run("closes", async () => {
      if (!process.env.POLYGON_API_KEY) return null;
      const wanted = [...new Set([...tickers, MAG7_TICKERS[0]])];
      const map = await getLatestCloses(wanted);
      const missing = wanted.filter((t) => !map.has(t.toUpperCase()));
      // The session can only be valued now, so a gap would be for good:
      // retry, and on the last attempt value what can be valued.
      if (missing.length > 0 && attempt < RETRIES) {
        throw new Error(`[paper-equity] no close for ${missing.join(", ")}`);
      }
      return Object.fromEntries(map);
    });
    if (!closes || Object.keys(closes).length === 0) {
      return { skipped: true, reason: closes ? "no closes" : "POLYGON_API_KEY not set" };
    }

    return step.run("snapshot", async () => {
      const asOfDate = Object.values(closes)
        .map((c) => c.sessionDate)
        .sort()
        .at(-1)!;

      const portfolios = await db.select().from(paperPortfolios);
      const trades = await db
        .select({ trade: paperTrades, ticker: instruments.ticker })
        .from(paperTrades)
        .innerJoin(instruments, eq(paperTrades.instrumentId, instruments.id));
      const byPortfolio = new Map<string, Array<(typeof trades)[number]>>();
      for (const row of trades) {
        const list = byPortfolio.get(row.trade.portfolioId) ?? [];
        list.push(row);
        byPortfolio.set(row.trade.portfolioId, list);
      }

      const rows: Array<typeof paperEquitySnapshots.$inferInsert> = [];
      let unpriced = 0;
      for (const portfolio of portfolios) {
        // Opened after that session: it has no equity at its close.
        if (easternDateTime(portfolio.createdAt).date > asOfDate) continue;
        const held = (byPortfolio.get(portfolio.id) ?? []).map((r) => ({
          ...r.trade,
          ticker: r.ticker.toUpperCase(),
        }));
        if (held.some((t) => t.closedAt === null && !closes[t.ticker])) {
          unpriced++;
          continue;
        }
        const valuation = valuePortfolio(
          portfolio.startingBalanceCents,
          held,
          (t) => closes[t.ticker]!.closeCents,
        );
        rows.push({
          portfolioId: portfolio.id,
          asOfDate,
          equityCents: valuation.totalEquityCents,
        });
      }

      const written =
        rows.length === 0
          ? []
          : await db
              .insert(paperEquitySnapshots)
              .values(rows)
              .onConflictDoNothing({
                target: [paperEquitySnapshots.portfolioId, paperEquitySnapshots.asOfDate],
              })
              .returning({ id: paperEquitySnapshots.id });

      console.log(
        `[paper-equity] ${asOfDate}: ${written.length} of ${rows.length} written, ${unpriced} unpriced`,
      );
      return {
        skipped: false,
        asOfDate,
        portfolios: portfolios.length,
        written: written.length,
        alreadyStored: rows.length - written.length,
        unpriced,
      };
    });
  },
);


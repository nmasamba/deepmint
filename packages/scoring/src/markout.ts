/**
 * Markout: pricing a matured claim against end-of-day bars.
 *
 * Pure functions (no I/O). The worker fetches one range of daily bars and
 * passes it in, so every rule here is unit-testable with known inputs.
 */

export interface MarkoutBar {
  date: string; // YYYY-MM-DD (US trading session)
  highCents: number;
  lowCents: number;
  closeCents: number;
}

export interface MarkoutInput {
  direction: "long" | "short" | "neutral";
  horizonDays: number;
  /**
   * The claim's stored entry price. Null means the claim was made without a
   * dated price, so its entry is the first close at or after it was made.
   */
  entryPriceCents: number | null;
  targetPriceCents: number | null;
  createdAt: Date;
}

export interface MarkoutResult {
  entryPriceCents: number;
  exitPriceCents: number;
  returnBps: number;
  directionCorrect: boolean;
  targetHit: boolean | null;
  entryDate: string;
  exitDate: string;
}

const MARKET_CLOSE_MINUTES = 16 * 60; // 16:00 US Eastern
// A session's daily bar is treated as final from 16:30 ET on its own date.
const BAR_FINAL_MINUTES = 16 * 60 + 30;

const easternFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** US Eastern calendar date and minutes past midnight of an instant. */
export function easternDateTime(at: Date): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    easternFormat.formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function nextWeekdayOnOrAfter(date: string): string {
  let d = date;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/**
 * The trading date whose 16:00 ET close is the first at or after `at`.
 * Before the close on a weekday that is the same day; at or after the close,
 * or at a weekend, it is the next weekday. A market holiday resolves to the
 * next session that has a bar (see computeMarkoutFromBars).
 */
export function firstCloseDateAtOrAfter(at: Date): string {
  const { date, minutes } = easternDateTime(at);
  if (!isWeekend(date) && minutes < MARKET_CLOSE_MINUTES) return date;
  return nextWeekdayOnOrAfter(addDays(date, 1));
}

/**
 * The earliest date a claim's exit can be priced: entry date + horizon for a
 * claim without a stored entry, created_at + horizon (weekend-rolled) for one
 * with. Markout skips the price fetch until this session has closed.
 */
export function markoutDueDate(input: MarkoutInput): string {
  return input.entryPriceCents === null
    ? addDays(firstCloseDateAtOrAfter(input.createdAt), input.horizonDays)
    : nextWeekdayOnOrAfter(
        addDays(input.createdAt.toISOString().slice(0, 10), input.horizonDays),
      );
}

/** True once `date`'s session has closed and its daily bar is final. */
export function isSessionFinal(date: string, now: Date): boolean {
  const t = easternDateTime(now);
  return date < t.date || (date === t.date && t.minutes >= BAR_FINAL_MINUTES);
}

/** The bar range a claim's markout needs: [from, to]. */
export function markoutWindow(input: MarkoutInput): { from: string; to: string } {
  const from =
    input.entryPriceCents === null
      ? firstCloseDateAtOrAfter(input.createdAt)
      : input.createdAt.toISOString().slice(0, 10);
  // Room for the horizon plus holidays and weekends at both ends.
  return { from, to: addDays(from, input.horizonDays + 14) };
}

/**
 * Compute a claim's outcome from daily bars, or null if a bar it needs has
 * not closed yet (the caller retries on its next run).
 *
 * - Stored entry: exit is the first session on or after created_at +
 *   horizon_days (weekends and holidays roll forward); the target window starts
 *   on the creation date. This is the rule for claims priced when they were
 *   made.
 * - No stored entry: entry is the close of the first session at or after the
 *   claim was made, so the scored move starts after the claim. Exit is the
 *   first session on or after the entry date + horizon_days, and the target
 *   window starts the day after entry.
 *
 * returnBps is position P&L (negated for shorts). directionCorrect follows the
 * raw price move; a neutral claim is right within ±2%.
 */
export function computeMarkoutFromBars(
  input: MarkoutInput,
  bars: MarkoutBar[],
  now: Date,
): MarkoutResult | null {
  const final = bars
    .filter((b) => isSessionFinal(b.date, now))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const firstOnOrAfter = (date: string) => final.find((b) => b.date >= date);

  let entryPriceCents: number;
  let entryDate: string;
  let exitTarget: string;
  let windowStartsAfter: string; // target window: bars with date > this

  if (input.entryPriceCents === null) {
    const entryBar = firstOnOrAfter(firstCloseDateAtOrAfter(input.createdAt));
    if (!entryBar) return null;
    entryPriceCents = entryBar.closeCents;
    entryDate = entryBar.date;
    exitTarget = addDays(entryBar.date, input.horizonDays);
    windowStartsAfter = entryBar.date;
  } else {
    entryPriceCents = input.entryPriceCents;
    entryDate = input.createdAt.toISOString().slice(0, 10);
    exitTarget = nextWeekdayOnOrAfter(addDays(entryDate, input.horizonDays));
    windowStartsAfter = addDays(entryDate, -1);
  }
  if (entryPriceCents <= 0) return null;

  const exitBar = firstOnOrAfter(exitTarget);
  if (!exitBar || exitBar.date <= entryDate) return null;
  const exitPriceCents = exitBar.closeCents;

  const priceReturnBps = Math.round(
    ((exitPriceCents - entryPriceCents) / entryPriceCents) * 10000,
  );
  const directionCorrect =
    input.direction === "long"
      ? priceReturnBps > 0
      : input.direction === "short"
        ? priceReturnBps < 0
        : Math.abs(priceReturnBps) <= 200;
  const returnBps = input.direction === "short" ? -priceReturnBps : priceReturnBps;

  let targetHit: boolean | null = null;
  if (input.targetPriceCents !== null && input.direction !== "neutral") {
    const window = final.filter(
      (b) => b.date > windowStartsAfter && b.date <= exitBar.date,
    );
    targetHit =
      input.direction === "long"
        ? window.some((b) => b.highCents >= input.targetPriceCents!)
        : window.some((b) => b.lowCents <= input.targetPriceCents!);
  }

  return {
    entryPriceCents,
    exitPriceCents,
    returnBps,
    directionCorrect,
    targetHit,
    entryDate,
    exitDate: exitBar.date,
  };
}

import { describe, it, expect } from "vitest";
import {
  sharpeRatio,
  calmarRatio,
  cvar5,
  maxDrawdown,
  consistencyScore,
  dailyBookReturns,
  maeAndMfe,
  playerRiskMetrics,
  RISK_FREE_ANNUAL,
  type BookClaim,
  type BookDay,
} from "../player";
import { computeMarkoutFromBars, type MarkoutBar } from "../markout";

describe("sharpeRatio", () => {
  it("returns 0 for empty array", () => {
    expect(sharpeRatio([])).toBe(0);
  });

  it("returns 0 for single value", () => {
    expect(sharpeRatio([0.01])).toBe(0);
  });

  it("returns 0 for zero std deviation", () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });

  it("computes annualised Sharpe for positive returns", () => {
    // Mean=0.001, std≈0.001414, Sharpe ≈ (0.001/0.001414)*√252 ≈ 11.22
    const returns = [0.002, 0.001, 0, 0.001, 0.001];
    const result = sharpeRatio(returns);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(30); // sanity check
  });

  it("returns negative Sharpe for negative returns", () => {
    const returns = [-0.01, -0.02, -0.015, -0.01, -0.02];
    expect(sharpeRatio(returns)).toBeLessThan(0);
  });
});

describe("calmarRatio", () => {
  it("returns 0 when maxDD is 0", () => {
    expect(calmarRatio(0.1, 0)).toBe(0);
  });

  it("computes ratio correctly", () => {
    expect(calmarRatio(0.2, 0.1)).toBeCloseTo(2.0);
  });

  it("handles negative annualised return", () => {
    expect(calmarRatio(-0.1, 0.2)).toBeCloseTo(-0.5);
  });
});

describe("cvar5", () => {
  it("returns 0 for empty array", () => {
    expect(cvar5([])).toBe(0);
  });

  it("returns worst returns for small sample", () => {
    const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05];
    // 5% of 8 = ceil(0.4) = 1, so just the worst return
    expect(cvar5(returns)).toBeCloseTo(-0.05);
  });

  it("averages tail for larger sample", () => {
    // 20 values, 5% = 1 value
    const returns = Array.from({ length: 20 }, (_, i) => (i - 10) * 0.01);
    const result = cvar5(returns);
    expect(result).toBeLessThan(0);
  });
});

describe("maxDrawdown", () => {
  it("returns 0 for empty array", () => {
    expect(maxDrawdown([])).toBe(0);
  });

  it("returns 0 for monotonically increasing curve", () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0);
  });

  it("computes drawdown correctly", () => {
    // Peak=120, trough=90, DD=30/120=25%
    const curve = [100, 110, 120, 90, 100, 95];
    expect(maxDrawdown(curve)).toBeCloseTo(0.25);
  });

  it("finds the largest drawdown", () => {
    const curve = [100, 80, 90, 50, 70]; // DD1=20%, DD2=100→50=50% from peak 100
    expect(maxDrawdown(curve)).toBeCloseTo(0.5);
  });
});

describe("consistencyScore", () => {
  it("returns 5 for insufficient data", () => {
    const returns = Array(30).fill(0.01);
    expect(consistencyScore(returns)).toBe(5);
  });

  it("returns high score for consistent returns", () => {
    // Slight variation to avoid zero stddev in sharpeRatio
    const returns = Array.from({ length: 200 }, (_, i) => 0.001 + (i % 2 === 0 ? 0.0001 : -0.0001));
    const score = consistencyScore(returns);
    expect(score).toBeGreaterThan(5); // Consistent returns → high consistency
    expect(score).toBeLessThanOrEqual(10);
  });
});

describe("maeAndMfe", () => {
  it("computes correctly for buy trade", () => {
    const result = maeAndMfe({
      entryPrice: 100,
      exitPrice: 110,
      highPrice: 115,
      lowPrice: 95,
      side: "buy",
    });
    expect(result.mae).toBeCloseTo(0.05); // (100-95)/100
    expect(result.mfe).toBeCloseTo(0.15); // (115-100)/100
  });

  it("computes correctly for sell trade", () => {
    const result = maeAndMfe({
      entryPrice: 100,
      exitPrice: 90,
      highPrice: 105,
      lowPrice: 88,
      side: "sell",
    });
    expect(result.mae).toBeCloseTo(0.05); // (105-100)/100
    expect(result.mfe).toBeCloseTo(0.12); // (100-88)/100
  });
});

describe("dailyBookReturns", () => {
  const NOW = new Date("2026-12-31T23:00:00Z");
  // Weekdays in October 2026, starting Monday the 5th.
  const bar = (date: string, closeCents: number): MarkoutBar => ({
    date,
    closeCents,
    highCents: closeCents,
    lowCents: closeCents,
  });
  const bars = (start: string, closes: number[]): MarkoutBar[] => {
    const out: MarkoutBar[] = [];
    let d = new Date(`${start}T12:00:00Z`);
    for (const close of closes) {
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
        d = new Date(d.getTime() + 86400000);
      }
      out.push(bar(d.toISOString().slice(0, 10), close));
      d = new Date(d.getTime() + 86400000);
    }
    return out;
  };
  const claim = (over: Partial<BookClaim>): BookClaim => ({
    ticker: "AAPL",
    direction: "long",
    horizonDays: 7,
    entryPriceCents: null,
    targetPriceCents: null,
    // Before Monday's close, so entry is Monday's close and exit next Monday's.
    createdAt: new Date("2026-10-05T14:00:00Z"),
    ...over,
  });
  const compounded = (days: BookDay[]) =>
    days.reduce((value, day) => value * (1 + day.returnFrac), 1) - 1;
  const closes = [10000, 10300, 9900, 10500, 10100, 10800];
  const book = { AAPL: bars("2026-10-05", closes) };

  it("has no days without a position", () => {
    expect(dailyBookReturns([], book, NOW)).toEqual([]);
    expect(dailyBookReturns([claim({ ticker: "MSFT" })], book, NOW)).toEqual([]);
  });

  it("compounds a one-claim long book to the claim's outcome return", () => {
    const c = claim({});
    const days = dailyBookReturns([c], book, NOW);
    const outcome = computeMarkoutFromBars(c, book.AAPL!, NOW)!;
    expect(outcome.returnBps).toBe(800);
    expect(compounded(days) * 10000).toBeCloseTo(outcome.returnBps, 6);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-12",
    ]);
  });

  it("compounds a one-claim short book to its outcome return along any path", () => {
    const c = claim({ direction: "short" });
    const days = dailyBookReturns([c], book, NOW);
    const outcome = computeMarkoutFromBars(c, book.AAPL!, NOW)!;
    expect(outcome.returnBps).toBe(-800);
    expect(compounded(days) * 10000).toBeCloseTo(outcome.returnBps, 6);
  });

  it("uses a stored entry and markout's exit date", () => {
    const c = claim({ entryPriceCents: 9500, createdAt: new Date("2026-10-05T14:00:00Z") });
    const days = dailyBookReturns([c], book, NOW);
    const outcome = computeMarkoutFromBars(c, book.AAPL!, NOW)!;
    expect(days.at(-1)?.date).toBe(outcome.exitDate);
    expect(compounded(days) * 10000).toBeCloseTo((10800 / 9500 - 1) * 10000, 6);
  });

  it("rolls an exit on a holiday to the next session, as markout does", () => {
    // No bar on Monday the 12th: the exit is Tuesday the 13th.
    const holiday = bars("2026-10-05", closes).filter((b) => b.date !== "2026-10-12");
    holiday.push(bar("2026-10-13", 11000));
    const days = dailyBookReturns([claim({})], { AAPL: holiday }, NOW);
    expect(days.at(-1)?.date).toBe("2026-10-13");
    expect(compounded(days)).toBeCloseTo(0.1, 10);
  });

  it("leaves out a claim whose exit has no final bar yet", () => {
    const early = new Date("2026-10-09T23:00:00Z");
    expect(dailyBookReturns([claim({})], book, early)).toEqual([]);
  });

  it("gives a neutral claim no position", () => {
    expect(dailyBookReturns([claim({ direction: "neutral" })], book, NOW)).toEqual([]);
    expect(
      dailyBookReturns([claim({}), claim({ direction: "neutral" })], book, NOW),
    ).toEqual(dailyBookReturns([claim({})], book, NOW));
  });

  it("averages the positions open over a session", () => {
    const two = {
      AAPL: bars("2026-10-05", [10000, 10200, 10200, 10200, 10200, 10200]),
      MSFT: bars("2026-10-05", [20000, 19600, 19600, 19600, 19600, 19600]),
    };
    const days = dailyBookReturns(
      [claim({}), claim({ ticker: "MSFT" })],
      two,
      NOW,
    );
    expect(days[0]?.returnFrac).toBeCloseTo((0.02 - 0.02) / 2, 10);
    const hedged = dailyBookReturns(
      [claim({}), claim({ ticker: "MSFT", direction: "short" })],
      two,
      NOW,
    );
    expect(hedged[0]?.returnFrac).toBeCloseTo(0.02, 10);
  });

  it("counts a session with nothing open as cash", () => {
    const long = {
      AAPL: bars("2026-10-05", Array.from({ length: 20 }, (_, i) => 10000 + i * 10)),
    };
    const days = dailyBookReturns(
      [
        claim({ horizonDays: 1 }),
        claim({ horizonDays: 1, createdAt: new Date("2026-10-14T14:00:00Z") }),
      ],
      long,
      NOW,
    );
    // Open Oct 6, flat Oct 7 to 14, open Oct 15.
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);
    expect(days.slice(1, 7).every((d) => d.returnFrac === 0)).toBe(true);
    expect(days[0]?.returnFrac).toBeGreaterThan(0);
    expect(days[7]?.returnFrac).toBeGreaterThan(0);
  });

  it("does not depend on the order of the claims", () => {
    const a = claim({});
    const b = claim({ direction: "short", horizonDays: 1 });
    expect(dailyBookReturns([a, b], book, NOW)).toEqual(
      dailyBookReturns([b, a], book, NOW),
    );
  });

  it("stops a short that has lost everything", () => {
    const up = { AAPL: bars("2026-10-05", [10000, 21000, 25000, 25000, 25000, 25000]) };
    const days = dailyBookReturns([claim({ direction: "short" })], up, NOW);
    expect(days[0]?.returnFrac).toBe(-1);
    expect(days.slice(1).every((d) => d.returnFrac === 0)).toBe(true);
  });

  it("does not bring a short back once it has lost everything", () => {
    const back = { AAPL: bars("2026-10-05", [10000, 21000, 19000, 18000, 17000, 16000]) };
    const days = dailyBookReturns([claim({ direction: "short" })], back, NOW);
    expect(days.map((d) => d.returnFrac)).toEqual([-1, 0, 0, 0, 0]);
    expect(compounded(days)).toBe(-1);
  });

  it("keeps a halted stock at its last mark", () => {
    const halted = bars("2026-10-05", closes).filter((b) => b.date !== "2026-10-07");
    const flat = bars("2026-10-05", closes.map(() => 10000));
    const days = dailyBookReturns(
      [claim({}), claim({ ticker: "MSFT" })],
      { AAPL: halted, MSFT: flat },
      NOW,
    );
    expect(days.find((d) => d.date === "2026-10-07")?.returnFrac).toBe(0);
    expect(days.every((d) => Number.isFinite(d.returnFrac))).toBe(true);
  });
});

describe("sharpeRatio, net of the risk-free rate", () => {
  const returns = [0.002, 0.001, 0, 0.001, 0.001];

  it("takes the daily risk-free rate off the mean", () => {
    const gross = sharpeRatio(returns);
    const net = sharpeRatio(returns, RISK_FREE_ANNUAL);
    const std = Math.sqrt(0.0000005);
    expect(gross - net).toBeCloseTo(((RISK_FREE_ANNUAL / 252) / std) * Math.sqrt(252), 6);
  });

  it("is negative for a book that earns less than the risk-free rate", () => {
    expect(sharpeRatio([0.0001, -0.0001, 0.0001, -0.0001], RISK_FREE_ANNUAL)).toBeLessThan(0);
  });
});

describe("playerRiskMetrics", () => {
  it("compounds the drawdown", () => {
    // +10% then -20% then -10%: 1.1, 0.88, 0.792, so 28% off the peak, not 30%.
    const { maxDrawdown: md } = playerRiskMetrics([0.1, -0.2, -0.1]);
    expect(md).toBeCloseTo(0.28, 10);
  });

  it("annualises a book by compounding over its sessions", () => {
    // 252 sessions of a fixed daily return: the year's return is the total.
    const days = Array.from({ length: 252 }, (_, i) => (i === 100 ? -0.05 : 0.001));
    const total = days.reduce((value, r) => value * (1 + r), 1) - 1;
    const metrics = playerRiskMetrics(days);
    expect(metrics.calmar).toBeCloseTo(total / metrics.maxDrawdown, 8);
  });

  it("scores a long-horizon claim on its daily moves, not as one huge day", () => {
    // Three one-year claims of about +10% in turn: 0.04% a day with noise.
    const year = Array.from({ length: 756 }, (_, i) => (i % 2 === 0 ? 0.0104 : -0.0096));
    const { sharpe } = playerRiskMetrics(year);
    expect(sharpe).toBeGreaterThan(-1);
    expect(sharpe).toBeLessThan(2);
  });

  it("keeps every value finite on a book that lost everything", () => {
    for (const value of Object.values(playerRiskMetrics([-1, 0, 0]))) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("gives a book with no drawdown a Calmar of 0, as calmarRatio does", () => {
    expect(playerRiskMetrics([0.01, 0.02]).calmar).toBe(0);
  });
});

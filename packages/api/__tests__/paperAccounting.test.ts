import { describe, it, expect } from "vitest";
import {
  availableCashCents,
  positionValueCents,
  realizedPnlCents,
  valuePortfolio,
  type PaperTradeLike,
} from "../lib/paperAccounting";

const START = 10_000_000; // $100,000

function trade(p: Partial<PaperTradeLike> & Pick<PaperTradeLike, "side">): PaperTradeLike {
  return { quantity: "10", entryPriceCents: 10_000, exitPriceCents: null, closedAt: null, ...p };
}

describe("paper accounting (collateral model)", () => {
  it("a flat $1,000 short leaves equity at the starting balance", () => {
    const v = valuePortfolio(START, [trade({ side: "sell" })], () => 10_000);
    expect(v.availableCashCents).toBe(START - 100_000);
    expect(v.openPositionValueCents).toBe(100_000);
    expect(v.totalEquityCents).toBe(START);
    expect(v.totalReturnBps).toBe(0);
  });

  it("a short gains when the price falls and loses when it rises", () => {
    const short = trade({ side: "sell" });
    expect(valuePortfolio(START, [short], () => 9_000).totalEquityCents).toBe(START + 10_000);
    expect(valuePortfolio(START, [short], () => 11_000).totalEquityCents).toBe(START - 10_000);
    expect(positionValueCents(short, 9_000)).toBe(110_000);
  });

  it("a long is worth its market value", () => {
    const v = valuePortfolio(START, [trade({ side: "buy" })], () => 12_000);
    expect(v.openPositionValueCents).toBe(120_000);
    expect(v.unrealizedPnlCents).toBe(20_000);
    expect(v.totalReturnBps).toBe(20); // +$200 on $100,000
  });

  it("closing returns the position's value to cash", () => {
    const closedShort = trade({ side: "sell", exitPriceCents: 9_000, closedAt: new Date() });
    const closedLong = trade({ side: "buy", exitPriceCents: 9_000, closedAt: "2026-10-01T00:00:00Z" });
    expect(availableCashCents(START, [closedShort])).toBe(START + 10_000);
    expect(availableCashCents(START, [closedLong])).toBe(START - 10_000);
    expect(realizedPnlCents([closedShort, closedLong])).toBe(0);
    const v = valuePortfolio(START, [closedShort, closedLong], () => {
      throw new Error("closed trades are not marked");
    });
    expect(v.totalEquityCents).toBe(START);
    expect(v.closedTradeCount).toBe(2);
    expect(v.openTradeCount).toBe(0);
  });

  it("opening a short uses cash, so it cannot fund more buys", () => {
    const cash = availableCashCents(START, [trade({ side: "sell", quantity: "500" })]);
    expect(cash).toBe(START - 5_000_000);
  });

  it("handles fractional quantities in whole cents", () => {
    const t = trade({ side: "buy", quantity: "0.333", entryPriceCents: 10_001 });
    expect(Number.isInteger(availableCashCents(START, [t]))).toBe(true);
    expect(Number.isInteger(positionValueCents(t, 10_500))).toBe(true);
  });
});

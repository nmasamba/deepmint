import { describe, it, expect } from "vitest";
import {
  computeMarkoutFromBars,
  firstCloseDateAtOrAfter,
  isSessionFinal,
  markoutDueDate,
  markoutWindow,
  type MarkoutBar,
  type MarkoutInput,
} from "../markout";

const bar = (date: string, closeCents: number, highCents = closeCents, lowCents = closeCents): MarkoutBar => ({
  date,
  closeCents,
  highCents,
  lowCents,
});

const claim = (over: Partial<MarkoutInput>): MarkoutInput => ({
  direction: "long",
  horizonDays: 1,
  entryPriceCents: null,
  targetPriceCents: null,
  createdAt: new Date("2026-10-06T19:00:00Z"), // Tue 15:00 EDT
  ...over,
});

const LATER = new Date("2026-12-31T23:00:00Z");

describe("firstCloseDateAtOrAfter", () => {
  it("is the same day before the 16:00 ET close", () => {
    expect(firstCloseDateAtOrAfter(new Date("2026-10-06T19:00:00Z"))).toBe("2026-10-06"); // 15:00 EDT
    expect(firstCloseDateAtOrAfter(new Date("2026-10-06T13:00:00Z"))).toBe("2026-10-06"); // 09:00, pre-market
  });

  it("is the next weekday at or after the close", () => {
    expect(firstCloseDateAtOrAfter(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-07"); // 16:00 EDT
    expect(firstCloseDateAtOrAfter(new Date("2026-10-07T02:00:00Z"))).toBe("2026-10-07"); // 22:00 EDT on the 6th
  });

  it("skips weekends", () => {
    expect(firstCloseDateAtOrAfter(new Date("2026-10-09T21:00:00Z"))).toBe("2026-10-12"); // Fri 17:00 EDT
    expect(firstCloseDateAtOrAfter(new Date("2026-10-10T14:00:00Z"))).toBe("2026-10-12"); // Saturday
  });

  it("follows daylight saving time", () => {
    // 20:30 UTC is 16:30 EDT in October (after the close) but 15:30 EST in November.
    expect(firstCloseDateAtOrAfter(new Date("2026-10-05T20:30:00Z"))).toBe("2026-10-06");
    expect(firstCloseDateAtOrAfter(new Date("2026-11-02T20:30:00Z"))).toBe("2026-11-02");
  });
});

describe("computeMarkoutFromBars: claims without a stored entry", () => {
  const bars = [
    bar("2026-10-05", 10000), // previous close: must never be the entry
    bar("2026-10-06", 11000, 11600),
    bar("2026-10-07", 12100, 12500),
  ];

  it("enters at the first close after the claim, not the previous close", () => {
    const r = computeMarkoutFromBars(claim({}), bars, LATER)!;
    expect(r.entryPriceCents).toBe(11000);
    expect(r.entryDate).toBe("2026-10-06");
    expect(r.exitPriceCents).toBe(12100);
    expect(r.exitDate).toBe("2026-10-07");
    // 10%: the old previous-close rule would have scored 21% (2100 bps),
    // most of it a move already visible when the claim was made.
    expect(r.returnBps).toBe(1000);
    expect(r.directionCorrect).toBe(true);
  });

  it("enters at the next day's close when made after the close", () => {
    const r = computeMarkoutFromBars(
      claim({ createdAt: new Date("2026-10-06T20:30:00Z"), horizonDays: 1 }),
      [...bars, bar("2026-10-08", 13310)],
      LATER,
    )!;
    expect(r.entryDate).toBe("2026-10-07");
    expect(r.entryPriceCents).toBe(12100);
    expect(r.exitDate).toBe("2026-10-08");
    expect(r.returnBps).toBe(1000);
  });

  it("does not count the entry day's high toward the target", () => {
    const r = computeMarkoutFromBars(
      claim({ targetPriceCents: 11500 }),
      [bar("2026-10-06", 11000, 11600), bar("2026-10-07", 11200, 11400)],
      LATER,
    )!;
    expect(r.targetHit).toBe(false);
  });

  it("rolls a holiday exit forward to the next session", () => {
    const r = computeMarkoutFromBars(
      claim({ createdAt: new Date("2026-11-25T15:00:00Z") }), // Wed 10:00 EST
      [bar("2026-11-24", 9000), bar("2026-11-25", 10000), bar("2026-11-27", 10500)], // no bar on Thanksgiving
      LATER,
    )!;
    expect(r.entryDate).toBe("2026-11-25");
    expect(r.exitDate).toBe("2026-11-27");
    expect(r.returnBps).toBe(500);
  });

  it("waits until the exit session has closed", () => {
    const before = new Date("2026-10-07T20:00:00Z"); // 16:00 EDT on the exit date
    const after = new Date("2026-10-07T20:30:00Z"); // 16:30 EDT
    expect(computeMarkoutFromBars(claim({}), bars, before)).toBeNull();
    expect(computeMarkoutFromBars(claim({}), bars, after)?.exitDate).toBe("2026-10-07");
  });

  it("returns null when the entry session has no bar yet", () => {
    expect(computeMarkoutFromBars(claim({}), [bar("2026-10-05", 10000)], LATER)).toBeNull();
    expect(computeMarkoutFromBars(claim({}), [], LATER)).toBeNull();
  });

  it("scores a short as position P&L", () => {
    const r = computeMarkoutFromBars(
      claim({ direction: "short" }),
      [bar("2026-10-06", 11000), bar("2026-10-07", 9900)],
      LATER,
    )!;
    expect(r.returnBps).toBe(1000);
    expect(r.directionCorrect).toBe(true);
  });

  it("counts a neutral call as right within ±2%", () => {
    const run = (exit: number) =>
      computeMarkoutFromBars(
        claim({ direction: "neutral" }),
        [bar("2026-10-06", 11000), bar("2026-10-07", exit)],
        LATER,
      )!.directionCorrect;
    expect(run(11150)).toBe(true); // +1.36%
    expect(run(11300)).toBe(false); // +2.73%
  });
});

describe("computeMarkoutFromBars: claims with a stored entry", () => {
  it("keeps the stored entry and the created_at + horizon exit", () => {
    const r = computeMarkoutFromBars(
      claim({ entryPriceCents: 10000, targetPriceCents: 11500 }),
      [bar("2026-10-05", 10000), bar("2026-10-06", 11000, 11600), bar("2026-10-07", 12100)],
      LATER,
    )!;
    expect(r.entryPriceCents).toBe(10000);
    expect(r.exitDate).toBe("2026-10-07");
    expect(r.returnBps).toBe(2100);
    expect(r.targetHit).toBe(true); // window starts on the creation date, as before
  });

  it("rolls a weekend exit to Monday", () => {
    const r = computeMarkoutFromBars(
      claim({ entryPriceCents: 10000, createdAt: new Date("2026-10-09T15:00:00Z") }), // Fri
      [bar("2026-10-09", 10000), bar("2026-10-12", 10300)],
      LATER,
    )!;
    expect(r.exitDate).toBe("2026-10-12");
    expect(r.returnBps).toBe(300);
  });
});

describe("markoutWindow", () => {
  it("starts at the entry session for claims without a stored entry", () => {
    expect(markoutWindow(claim({ horizonDays: 30 }))).toEqual({ from: "2026-10-06", to: "2026-11-19" });
  });

  it("starts at the creation date for claims with a stored entry", () => {
    expect(
      markoutWindow(claim({ entryPriceCents: 10000, createdAt: new Date("2026-10-06T21:00:00Z"), horizonDays: 7 })),
    ).toEqual({ from: "2026-10-06", to: "2026-10-27" });
  });
});

describe("markoutDueDate and isSessionFinal", () => {
  it("is entry date + horizon for a claim without a stored entry", () => {
    // Made Tue 16:40 EDT: entry is Wed 10-07, so a 7-day claim is due 10-14, not 10-13.
    expect(markoutDueDate(claim({ createdAt: new Date("2026-10-06T20:40:00Z"), horizonDays: 7 }))).toBe("2026-10-14");
    // Saturday 1-day claim: entry Monday, due Tuesday.
    expect(markoutDueDate(claim({ createdAt: new Date("2026-10-10T14:00:00Z") }))).toBe("2026-10-13");
  });

  it("is created_at + horizon, weekend-rolled, for a stored entry", () => {
    expect(markoutDueDate(claim({ entryPriceCents: 10000, createdAt: new Date("2026-10-09T15:00:00Z") }))).toBe("2026-10-12");
  });

  it("treats a session as final from 16:30 ET on its date", () => {
    expect(isSessionFinal("2026-10-07", new Date("2026-10-07T20:00:00Z"))).toBe(false); // 16:00 EDT
    expect(isSessionFinal("2026-10-07", new Date("2026-10-07T20:30:00Z"))).toBe(true); // 16:30 EDT
    expect(isSessionFinal("2026-10-06", new Date("2026-10-07T12:00:00Z"))).toBe(true);
    expect(isSessionFinal("2026-11-02", new Date("2026-11-02T21:00:00Z"))).toBe(false); // 16:00 EST
  });
});

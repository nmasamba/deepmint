import { describe, it, expect } from "vitest";
import {
  HOLD_REASON_TEXT,
  claimHoldReasons,
  isUnattributedRating,
} from "../claimEvidence";

const CARRIER = "carrier-entity";
const FIRM = "firm-entity";

const evidenced = {
  eventId: "event-1",
  entityId: FIRM,
  sourceKind: "wall_street_rating",
  horizonDays: 90,
  horizonStated: "within 90 days",
  sourceExcerpt: "We see AAPL at $250 within 90 days.",
};
const ratingLane = {
  carrierEntityId: CARRIER,
  publisher: "Example Wire",
  earlierCopyRejected: false,
};

describe("isUnattributedRating", () => {
  it("is a rating still on the entity that carried it", () => {
    expect(
      isUnattributedRating({ sourceKind: "wall_street_rating", entityId: CARRIER }, CARRIER),
    ).toBe(true);
  });

  it("is not a rating credited to a firm", () => {
    expect(
      isUnattributedRating({ sourceKind: "wall_street_rating", entityId: FIRM }, CARRIER),
    ).toBe(false);
  });

  it("is not a Guide's own claim, a self-logged one, or one with no event", () => {
    expect(isUnattributedRating({ sourceKind: "analyst_feed", entityId: CARRIER }, CARRIER)).toBe(false);
    expect(isUnattributedRating({ sourceKind: null, entityId: CARRIER }, CARRIER)).toBe(false);
    expect(isUnattributedRating({ sourceKind: "wall_street_rating", entityId: CARRIER }, null)).toBe(false);
  });
});

describe("claimHoldReasons", () => {
  it("names an unattributed rating", () => {
    expect(
      claimHoldReasons({ ...evidenced, entityId: CARRIER }, ratingLane),
    ).toEqual(["unattributed_rating"]);
  });

  it("names a firm found in a Guide's own post", () => {
    expect(
      claimHoldReasons(evidenced, { ...ratingLane, publisher: null }),
    ).toEqual(["firm_in_guide_post"]);
  });

  it("does not treat a firm credited in the ratings lane as a move", () => {
    expect(claimHoldReasons(evidenced, ratingLane)).toEqual([
      "low_extraction_confidence",
    ]);
  });

  it("names a missing quote", () => {
    expect(
      claimHoldReasons({ ...evidenced, sourceExcerpt: null }, ratingLane),
    ).toEqual(["no_verified_quote"]);
  });

  it("names a horizon the quote does not state", () => {
    expect(
      claimHoldReasons({ ...evidenced, horizonDays: 30 }, ratingLane),
    ).toEqual(["horizon_not_verified"]);
    expect(
      claimHoldReasons({ ...evidenced, horizonStated: null }, ratingLane),
    ).toEqual(["horizon_not_verified"]);
    expect(
      claimHoldReasons(
        { ...evidenced, horizonStated: "within 180 days", horizonDays: 180 },
        ratingLane,
      ),
    ).toEqual(["horizon_not_verified"]);
  });

  it("names a rejected copy instead of blaming the model", () => {
    expect(
      claimHoldReasons(evidenced, { ...ratingLane, earlierCopyRejected: true }),
    ).toEqual(["earlier_copy_rejected"]);
  });

  it("lists every reason that applies", () => {
    expect(
      claimHoldReasons(
        { ...evidenced, entityId: CARRIER, sourceExcerpt: null },
        { ...ratingLane, earlierCopyRejected: true },
      ),
    ).toEqual(["unattributed_rating", "no_verified_quote", "earlier_copy_rejected"]);
  });

  it("gives a claim that never went through extraction no reason", () => {
    expect(claimHoldReasons({ ...evidenced, eventId: null }, ratingLane)).toEqual([]);
  });

  it("has words for every reason", () => {
    for (const text of Object.values(HOLD_REASON_TEXT)) {
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

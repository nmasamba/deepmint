import { describe, it, expect } from "vitest";
import { dedupeAction } from "../extractor";

describe("dedupeAction", () => {
  it("inserts a call with no earlier copy at its routed status", () => {
    expect(dedupeAction([], "active")).toEqual({ action: "insert", status: "active", supersedePending: false });
    expect(dedupeAction([], "pending_review")).toEqual({ action: "insert", status: "pending_review", supersedePending: false });
  });

  it("skips any copy of a call that is already active", () => {
    expect(dedupeAction(["active"], "active")).toEqual({ action: "skip" });
    expect(dedupeAction(["rejected", "active"], "active")).toEqual({ action: "skip" });
    expect(dedupeAction(["active"], "pending_review")).toEqual({ action: "skip" });
  });

  it("lets an active claim replace pending copies", () => {
    expect(dedupeAction(["pending_review"], "active")).toEqual({ action: "insert", status: "active", supersedePending: true });
    expect(dedupeAction(["rejected", "pending_review"], "active")).toEqual({ action: "insert", status: "active", supersedePending: true });
  });

  it("sends an active claim to review when an admin rejected a copy", () => {
    expect(dedupeAction(["rejected"], "active")).toEqual({ action: "insert", status: "pending_review", supersedePending: false });
  });

  it("adds nothing when a held claim repeats a pending or rejected copy", () => {
    expect(dedupeAction(["pending_review"], "pending_review")).toEqual({ action: "skip" });
    expect(dedupeAction(["rejected"], "pending_review")).toEqual({ action: "skip" });
  });
});

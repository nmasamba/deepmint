import { describe, it, expect } from "vitest";
import { slugify } from "../sources/resolver";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Ben Thompson")).toBe("ben-thompson");
    expect(slugify("Stratechery Daily Update")).toBe(
      "stratechery-daily-update",
    );
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("@FinTwit_Guru!!!")).toBe("fintwit-guru");
    expect(slugify("A.B.C")).toBe("a-b-c");
  });

  it("trims leading/trailing separators", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("falls back to 'guide' for empty/symbol-only input", () => {
    expect(slugify("")).toBe("guide");
    expect(slugify("!!!")).toBe("guide");
  });

  it("bounds length to 100 chars", () => {
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(100);
  });
});

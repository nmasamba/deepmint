import { describe, it, expect } from "vitest";
import { eivLabel } from "../eiv";

describe("eivLabel", () => {
  it("labels strong edge for EIV >= 60", () => {
    expect(eivLabel(65)).toBe("Strong Edge");
    expect(eivLabel(60)).toBe("Strong Edge");
  });

  it("labels moderate edge for EIV 30-59", () => {
    expect(eivLabel(45)).toBe("Moderate Edge");
    expect(eivLabel(30)).toBe("Moderate Edge");
  });

  it("labels weak edge for any positive EIV below 30", () => {
    expect(eivLabel(29.9)).toBe("Weak Edge");
    expect(eivLabel(0.1)).toBe("Weak Edge");
  });

  it("labels no edge for 0", () => {
    expect(eivLabel(0)).toBe("No Edge");
  });
});

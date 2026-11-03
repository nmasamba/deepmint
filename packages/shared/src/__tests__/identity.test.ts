import { describe, it, expect } from "vitest";
import { clerkDisplayName } from "../utils";

describe("clerkDisplayName", () => {
  it("joins first and last name", () => {
    expect(clerkDisplayName({ firstName: "Ada", lastName: "Lovelace", username: "ada" })).toBe("Ada Lovelace");
    expect(clerkDisplayName({ firstName: "Ada", lastName: null })).toBe("Ada");
    expect(clerkDisplayName({ firstName: null, lastName: "Lovelace" })).toBe("Lovelace");
  });

  it("falls back to the username, then to User", () => {
    expect(clerkDisplayName({ firstName: null, lastName: null, username: "ada" })).toBe("ada");
    expect(clerkDisplayName({ firstName: "", lastName: "", username: null })).toBe("User");
    expect(clerkDisplayName({})).toBe("User");
  });
});

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { generateKey } from "../lib/generateKey";

describe("generateKey", () => {
  it("produces plaintext in dm_live_<32 hex> format", () => {
    const { plaintext } = generateKey();
    expect(plaintext).toMatch(/^dm_live_[0-9a-f]{32}$/);
  });

  it("produces a 64-char hex SHA-256 hash", () => {
    const { hash } = generateKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prefix is the first 16 chars of plaintext", () => {
    const { plaintext, prefix } = generateKey();
    expect(prefix).toBe(plaintext.slice(0, 16));
    expect(prefix).toHaveLength(16);
  });

  it("hash is deterministic — recomputing SHA-256 matches", () => {
    const { plaintext, hash } = generateKey();
    const recomputed = createHash("sha256").update(plaintext).digest("hex");
    expect(hash).toBe(recomputed);
  });

  it("each call produces a unique key", () => {
    const a = generateKey();
    const b = generateKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { computeClaimLeafHash, buildMerkleTree } from "../merkle";

describe("computeClaimLeafHash", () => {
  const baseClaim = {
    id: "claim-001",
    entityId: "entity-001",
    instrumentId: "instr-001",
    direction: "long",
    horizonDays: 30,
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
  };

  it("produces a deterministic SHA-256 hash", () => {
    const hash1 = computeClaimLeafHash(baseClaim);
    const hash2 = computeClaimLeafHash(baseClaim);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different claims", () => {
    const hash1 = computeClaimLeafHash(baseClaim);
    const hash2 = computeClaimLeafHash({ ...baseClaim, id: "claim-002" });
    expect(hash1).not.toBe(hash2);
  });

  it("is sensitive to direction changes", () => {
    const hashLong = computeClaimLeafHash(baseClaim);
    const hashShort = computeClaimLeafHash({ ...baseClaim, direction: "short" });
    expect(hashLong).not.toBe(hashShort);
  });

  it("is sensitive to horizon changes", () => {
    const hash30 = computeClaimLeafHash(baseClaim);
    const hash90 = computeClaimLeafHash({ ...baseClaim, horizonDays: 90 });
    expect(hash30).not.toBe(hash90);
  });

  it("is sensitive to timestamp changes", () => {
    const hash1 = computeClaimLeafHash(baseClaim);
    const hash2 = computeClaimLeafHash({
      ...baseClaim,
      createdAt: new Date("2026-01-16T12:00:00.000Z"),
    });
    expect(hash1).not.toBe(hash2);
  });
});

describe("buildMerkleTree", () => {
  function sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  it("returns empty hash for empty leaves array", () => {
    const result = buildMerkleTree([]);
    expect(result.root).toBe(sha256(""));
    expect(result.layers).toHaveLength(1);
  });

  it("returns the leaf itself for a single leaf", () => {
    const leaf = sha256("test-leaf");
    const result = buildMerkleTree([leaf]);
    // Single leaf: while loop doesn't execute (length=1), root IS the leaf
    expect(result.root).toBe(leaf);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0]).toEqual([leaf]);
  });

  it("correctly hashes two leaves", () => {
    const leaf1 = sha256("leaf-1");
    const leaf2 = sha256("leaf-2");
    const result = buildMerkleTree([leaf1, leaf2]);
    const expectedRoot = sha256(leaf1 + leaf2);
    expect(result.root).toBe(expectedRoot);
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0]).toEqual([leaf1, leaf2]);
    expect(result.layers[1]).toEqual([expectedRoot]);
  });

  it("handles four leaves with correct tree structure", () => {
    const leaves = ["a", "b", "c", "d"].map((x) => sha256(x));
    const result = buildMerkleTree(leaves);

    // Layer 0: [a, b, c, d]
    expect(result.layers[0]).toEqual(leaves);

    // Layer 1: [hash(a+b), hash(c+d)]
    const ab = sha256(leaves[0]! + leaves[1]!);
    const cd = sha256(leaves[2]! + leaves[3]!);
    expect(result.layers[1]).toEqual([ab, cd]);

    // Layer 2 (root): hash(hash(a+b) + hash(c+d))
    const root = sha256(ab + cd);
    expect(result.layers[2]).toEqual([root]);
    expect(result.root).toBe(root);
  });

  it("handles odd number of leaves by duplicating the last", () => {
    const leaves = ["x", "y", "z"].map((x) => sha256(x));
    const result = buildMerkleTree(leaves);

    // Layer 1: hash(x+y), hash(z+z)
    const xy = sha256(leaves[0]! + leaves[1]!);
    const zz = sha256(leaves[2]! + leaves[2]!);
    expect(result.layers[1]).toEqual([xy, zz]);

    const root = sha256(xy + zz);
    expect(result.root).toBe(root);
  });

  it("is deterministic — same input always same output", () => {
    const leaves = ["alpha", "beta", "gamma"].map((x) => sha256(x));
    const result1 = buildMerkleTree(leaves);
    const result2 = buildMerkleTree(leaves);
    expect(result1.root).toBe(result2.root);
    expect(result1.layers).toEqual(result2.layers);
  });
});

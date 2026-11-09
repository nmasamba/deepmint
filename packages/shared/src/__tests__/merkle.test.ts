import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  computeClaimLeafHash,
  computeClaimLeafHashV2,
  claimLeafPayloadV1,
  claimLeafPayloadV2,
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
} from "../merkle";

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

describe("computeClaimLeafHash, version 1", () => {
  it("never changes, because stored roots are checked with it", () => {
    expect(
      computeClaimLeafHash({
        id: "claim-001",
        entityId: "entity-001",
        instrumentId: "instr-001",
        direction: "long",
        horizonDays: 30,
        createdAt: new Date("2026-01-15T12:00:00.000Z"),
      }),
    ).toBe(
      createHash("sha256")
        .update("claim-001|entity-001|instr-001|long|30|2026-01-15T12:00:00.000Z")
        .digest("hex"),
    );
  });
});

describe("computeClaimLeafHashV2", () => {
  const claim = {
    id: "claim-001",
    eventId: "event-001",
    entityId: "entity-001",
    instrumentId: "instr-001",
    direction: "long",
    targetPriceCents: 25000,
    horizonDays: 30,
    confidence: 80,
    rationale: "Strong iPhone cycle",
    rationaleTags: ["earnings", "catalyst"],
    entryPriceCents: 21000,
    sourceKind: "wall_street_rating",
    ratingGrade: "buy",
    ratingAction: "upgrade",
    analystName: "A. Analyst",
    horizonStated: "within 30 days",
    sourceExcerpt: "We see AAPL at $250 within 30 days.",
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
    recordedAt: new Date("2026-01-17T09:30:00.000Z"),
  };

  it("is deterministic", () => {
    expect(computeClaimLeafHashV2(claim)).toBe(
      computeClaimLeafHashV2({ ...claim }),
    );
    expect(computeClaimLeafHashV2(claim)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["id", "claim-002"],
    ["eventId", null],
    ["entityId", "entity-002"],
    ["instrumentId", "instr-002"],
    ["direction", "short"],
    ["targetPriceCents", 25001],
    ["horizonDays", 90],
    ["confidence", 81],
    ["rationale", "Weak iPhone cycle"],
    ["rationaleTags", ["catalyst", "earnings"]],
    ["entryPriceCents", 21001],
    ["sourceKind", "analyst_feed"],
    ["ratingGrade", "hold"],
    ["ratingAction", "downgrade"],
    ["analystName", "B. Analyst"],
    ["horizonStated", "within 90 days"],
    ["sourceExcerpt", "We see AAPL at $250 within 90 days."],
    ["createdAt", new Date("2026-01-15T12:00:00.001Z")],
    ["recordedAt", new Date("2026-01-17T09:30:00.001Z")],
    ["recordedAt", null],
  ])("changes when %s changes", (field, value) => {
    expect(computeClaimLeafHashV2({ ...claim, [field]: value })).not.toBe(
      computeClaimLeafHashV2(claim),
    );
  });

  it("ignores the review decision, which can land after the root", () => {
    const pending = { ...claim, status: "pending_review" };
    const approved = { ...claim, status: "active" };
    expect(computeClaimLeafHashV2(pending)).toBe(
      computeClaimLeafHashV2(approved),
    );
  });

  it("keeps fields apart, whatever the free text holds", () => {
    const one = { ...claim, rationale: 'a","b', analystName: "c" };
    const two = { ...claim, rationale: "a", analystName: 'b","c' };
    expect(computeClaimLeafHashV2(one)).not.toBe(computeClaimLeafHashV2(two));
    const pipes = { ...claim, rationale: "a|b", analystName: "c" };
    const moved = { ...claim, rationale: "a", analystName: "b|c" };
    expect(computeClaimLeafHashV2(pipes)).not.toBe(
      computeClaimLeafHashV2(moved),
    );
  });

  it("tells a null from an empty value", () => {
    expect(computeClaimLeafHashV2({ ...claim, rationale: null })).not.toBe(
      computeClaimLeafHashV2({ ...claim, rationale: "" }),
    );
    expect(computeClaimLeafHashV2({ ...claim, rationaleTags: null })).not.toBe(
      computeClaimLeafHashV2({ ...claim, rationaleTags: [] }),
    );
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

describe("leaf payloads", () => {
  function sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  it("are exactly what each version hashes", () => {
    const v1 = {
      id: "claim-001",
      entityId: "entity-001",
      instrumentId: "instr-001",
      direction: "long",
      horizonDays: 30,
      createdAt: new Date("2026-01-15T12:00:00.000Z"),
    };
    expect(claimLeafPayloadV1(v1)).toBe(
      "claim-001|entity-001|instr-001|long|30|2026-01-15T12:00:00.000Z",
    );
    expect(sha256(claimLeafPayloadV1(v1))).toBe(computeClaimLeafHash(v1));

    const v2 = {
      ...v1,
      eventId: null,
      targetPriceCents: 25000,
      confidence: null,
      rationale: 'says "buy" | twice',
      rationaleTags: ["earnings"],
      entryPriceCents: null,
      sourceKind: "self_logged",
      ratingGrade: null,
      ratingAction: null,
      analystName: null,
      horizonStated: null,
      sourceExcerpt: null,
      recordedAt: new Date("2026-01-15T12:00:01.000Z"),
    };
    const payload = claimLeafPayloadV2(v2);
    expect(JSON.parse(payload)[9]).toEqual(["earnings"]);
    expect(sha256(payload)).toBe(computeClaimLeafHashV2(v2));
  });
});

describe("getMerkleProof and verifyMerkleProof", () => {
  function sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }
  const leavesOf = (n: number) =>
    Array.from({ length: n }, (_, i) => sha256(`leaf-${i}`));

  it("proves every leaf of trees from 1 to 17 leaves, odd layers included", () => {
    for (let n = 1; n <= 17; n++) {
      const leaves = leavesOf(n);
      const { root } = buildMerkleTree(leaves);
      for (let i = 0; i < n; i++) {
        const proof = getMerkleProof(leaves, i);
        expect(verifyMerkleProof(leaves[i]!, proof, root)).toBe(true);
        // One sibling per layer above the leaves.
        expect(proof).toHaveLength(Math.ceil(Math.log2(n)));
      }
    }
  });

  it("pairs the last node of an odd layer with itself", () => {
    const leaves = leavesOf(3);
    expect(getMerkleProof(leaves, 2)[0]).toEqual({ hash: leaves[2], position: "right" });
    expect(getMerkleProof(leaves, 1)[0]).toEqual({ hash: leaves[0], position: "left" });
  });

  it("fails for another leaf, a changed sibling or another root", () => {
    const leaves = leavesOf(6);
    const { root } = buildMerkleTree(leaves);
    const proof = getMerkleProof(leaves, 3);
    expect(verifyMerkleProof(leaves[4]!, proof, root)).toBe(false);
    const tampered = proof.map((step, i) => (i === 1 ? { ...step, hash: sha256("x") } : step));
    expect(verifyMerkleProof(leaves[3]!, tampered, root)).toBe(false);
    expect(verifyMerkleProof(leaves[3]!, proof, sha256("other"))).toBe(false);
  });

  it("refuses an index outside the leaves", () => {
    expect(() => getMerkleProof(leavesOf(2), 2)).toThrow(RangeError);
    expect(() => getMerkleProof([], 0)).toThrow(RangeError);
  });
});

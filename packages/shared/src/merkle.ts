import { createHash } from "crypto";

/** The leaf hash new roots use, stored on each root as `leaf_version`. */
export const MERKLE_LEAF_VERSION = 2;

/**
 * Version 1 of the leaf hash. New roots use computeClaimLeafHashV2; this stays
 * because roots stored with `leaf_version` 1 can only be checked with it.
 * Deterministic: same claim always produces same hash.
 */
export function computeClaimLeafHash(claim: ClaimLeafV1): string {
  return createHash("sha256").update(claimLeafPayloadV1(claim)).digest("hex");
}

/** The fields version 1 of the leaf hash covers. */
export interface ClaimLeafV1 {
  id: string;
  entityId: string;
  instrumentId: string;
  direction: string;
  horizonDays: number;
  createdAt: Date;
}

/**
 * The exact text version 1 hashes. This function uses no Node API, so a
 * browser can rebuild the text and hash it with WebCrypto.
 */
export function claimLeafPayloadV1(claim: ClaimLeafV1): string {
  return `${claim.id}|${claim.entityId}|${claim.instrumentId}|${claim.direction}|${claim.horizonDays}|${claim.createdAt.toISOString()}`;
}

/**
 * Version 2 of the leaf hash: every claim column that can never change, which
 * is all of them but claim_status, as a review may land after the root is
 * stored. The fields are hashed as a JSON array, so free text holding any
 * delimiter cannot make two different claims hash alike.
 */
export function computeClaimLeafHashV2(claim: ClaimLeafV2): string {
  return createHash("sha256").update(claimLeafPayloadV2(claim)).digest("hex");
}

/** The fields version 2 of the leaf hash covers: every claim column but claim_status. */
export interface ClaimLeafV2 {
  id: string;
  eventId: string | null;
  entityId: string;
  instrumentId: string;
  direction: string;
  targetPriceCents: number | null;
  horizonDays: number;
  confidence: number | null;
  rationale: string | null;
  rationaleTags: string[] | null;
  entryPriceCents: number | null;
  sourceKind: string | null;
  ratingGrade: string | null;
  ratingAction: string | null;
  analystName: string | null;
  horizonStated: string | null;
  sourceExcerpt: string | null;
  createdAt: Date;
  recordedAt: Date | null;
}

/**
 * The exact text version 2 hashes. This function uses no Node API, so a
 * browser can rebuild the text and hash it with WebCrypto.
 */
export function claimLeafPayloadV2(claim: ClaimLeafV2): string {
  return JSON.stringify([
    claim.id,
    claim.eventId,
    claim.entityId,
    claim.instrumentId,
    claim.direction,
    claim.targetPriceCents,
    claim.horizonDays,
    claim.confidence,
    claim.rationale,
    claim.rationaleTags,
    claim.entryPriceCents,
    claim.sourceKind,
    claim.ratingGrade,
    claim.ratingAction,
    claim.analystName,
    claim.horizonStated,
    claim.sourceExcerpt,
    claim.createdAt.toISOString(),
    claim.recordedAt ? claim.recordedAt.toISOString() : null,
  ]);
}

/**
 * Build a Merkle tree from an array of leaf hashes.
 * Returns the root hash and all intermediate layers.
 *
 * - If no leaves, returns a hash of empty string.
 * - If odd number of leaves, duplicates the last leaf.
 * - Pairs adjacent leaves and hashes them together recursively.
 */
export function buildMerkleTree(leaves: string[]): {
  root: string;
  layers: string[][];
} {
  if (leaves.length === 0) {
    const emptyRoot = createHash("sha256").update("").digest("hex");
    return { root: emptyRoot, layers: [[emptyRoot]] };
  }

  const layers: string[][] = [leaves];
  let currentLayer = leaves;

  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];

    // If odd, duplicate last leaf
    if (currentLayer.length % 2 !== 0) {
      currentLayer = [...currentLayer, currentLayer[currentLayer.length - 1]!];
    }

    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i]!;
      const right = currentLayer[i + 1]!;
      const combined = createHash("sha256")
        .update(left + right)
        .digest("hex");
      nextLayer.push(combined);
    }

    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return {
    root: currentLayer[0]!,
    layers,
  };
}

/** One step of a Merkle proof: the sibling hash, and which side it sits on. */
export interface MerkleProofStep {
  hash: string;
  position: "left" | "right";
}

/**
 * The proof that leaves[index] is in the tree buildMerkleTree makes from
 * `leaves`: the sibling at each layer, bottom up. Where a layer is odd, the
 * last node is paired with itself, as buildMerkleTree does.
 */
export function getMerkleProof(leaves: string[], index: number): MerkleProofStep[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new RangeError(`No leaf at index ${index} of ${leaves.length}`);
  }
  const { layers } = buildMerkleTree(leaves);
  const proof: MerkleProofStep[] = [];
  let i = index;
  for (const layer of layers.slice(0, -1)) {
    const isRight = i % 2 === 1;
    const sibling = isRight ? layer[i - 1]! : (layer[i + 1] ?? layer[i]!);
    proof.push({ hash: sibling, position: isRight ? "left" : "right" });
    i = Math.floor(i / 2);
  }
  return proof;
}

/** Fold a proof from `leaf` upwards and compare the result with `root`. */
export function verifyMerkleProof(
  leaf: string,
  proof: MerkleProofStep[],
  root: string,
): boolean {
  let node = leaf;
  for (const step of proof) {
    const pair = step.position === "left" ? step.hash + node : node + step.hash;
    node = createHash("sha256").update(pair).digest("hex");
  }
  return node === root;
}

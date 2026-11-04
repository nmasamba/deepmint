import { createHash } from "crypto";

/** The leaf hash new roots use, stored on each root as `leaf_version`. */
export const MERKLE_LEAF_VERSION = 2;

/**
 * Version 1 of the leaf hash. New roots use computeClaimLeafHashV2; this stays
 * because roots stored with `leaf_version` 1 can only be checked with it.
 * Deterministic: same claim always produces same hash.
 */
export function computeClaimLeafHash(claim: {
  id: string;
  entityId: string;
  instrumentId: string;
  direction: string;
  horizonDays: number;
  createdAt: Date;
}): string {
  const payload = `${claim.id}|${claim.entityId}|${claim.instrumentId}|${claim.direction}|${claim.horizonDays}|${claim.createdAt.toISOString()}`;
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Version 2 of the leaf hash: every claim column that can never change, which
 * is all of them but claim_status, as a review may land after the root is
 * stored. The fields are hashed as a JSON array, so free text holding any
 * delimiter cannot make two different claims hash alike.
 */
export function computeClaimLeafHashV2(claim: {
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
}): string {
  const payload = JSON.stringify([
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
  return createHash("sha256").update(payload).digest("hex");
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

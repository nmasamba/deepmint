import { createHash } from "crypto";

/**
 * Compute the leaf hash for a claim in the Merkle audit tree.
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

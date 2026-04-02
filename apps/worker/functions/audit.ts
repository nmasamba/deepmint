import { inngest } from "../inngest";
import { db, and, gte, lt } from "@deepmint/db";
import { claims, auditRoots } from "@deepmint/db/schema";
import { computeClaimLeafHash, buildMerkleTree } from "@deepmint/shared";

/**
 * Merkle Audit worker: runs daily at 22:00 UTC.
 * Computes a Merkle root of all claims created today for immutability proof.
 */
export const auditFunction = inngest.createFunction(
  {
    id: "merkle-audit",
    retries: 2,
    triggers: [{ cron: "0 22 * * *" }],
  },
  async ({ step }) => {
    const result = await step.run("compute-merkle-root", async () => {
      const now = new Date();
      const dayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const todayClaims = await db
        .select()
        .from(claims)
        .where(
          and(
            gte(claims.createdAt, dayStart),
            lt(claims.createdAt, dayEnd),
          ),
        )
        .orderBy(claims.createdAt);

      if (todayClaims.length === 0) {
        console.log("No claims today — skipping Merkle root computation.");
        return { skipped: true, claimCount: 0 };
      }

      const leaves = todayClaims.map((claim) =>
        computeClaimLeafHash({
          id: claim.id,
          entityId: claim.entityId,
          instrumentId: claim.instrumentId,
          direction: claim.direction,
          horizonDays: claim.horizonDays,
          createdAt: claim.createdAt,
        }),
      );

      const { root } = buildMerkleTree(leaves);
      const dateStr = dayStart.toISOString().split("T")[0]!;

      await db.insert(auditRoots).values({
        date: dateStr,
        merkleRoot: root,
        claimCount: todayClaims.length,
      });

      console.log(
        `Merkle root for ${dateStr}: ${root.slice(0, 16)}... (${todayClaims.length} claims)`,
      );

      return {
        skipped: false,
        date: dateStr,
        merkleRoot: root,
        claimCount: todayClaims.length,
      };
    });

    return result;
  },
);

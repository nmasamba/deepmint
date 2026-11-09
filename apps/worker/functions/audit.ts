import { inngest } from "../inngest";
import { db } from "@deepmint/db";
import { auditRoots } from "@deepmint/db/schema";
import { MERKLE_LEAF_VERSION, buildMerkleTree } from "@deepmint/shared";
import { auditWindowClaims, claimLeafHash } from "@deepmint/api/lib/auditWindow";

/**
 * Merkle Audit worker: runs daily at 22:00 UTC. Deliberately UTC, unlike the
 * market-hours crons: its window is a UTC day, not a trading session.
 * Computes a Merkle root of all claims recorded during the previous (completed)
 * UTC day for immutability proof. The window is recorded_at, not created_at: a
 * rating dated days back, a backfilled claim or a retried extraction reaches the
 * ledger after the day of its created_at has been audited. Auditing the
 * in-progress current day would permanently miss claims recorded after this run
 * fires (e.g. 22:00–24:00 UTC).
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
      // Window = the previous, fully-completed UTC day [yesterday 00:00, today 00:00).
      const todayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const dayStart = new Date(todayStart.getTime() - 86400000);

      // The window and order claims.auditProof rebuilds a root from: claims
      // recorded that day (a row from before migration 0012 by its
      // created_at), ordered by that instant and then id.
      const dateStr = dayStart.toISOString().split("T")[0]!;
      const windowClaims = await auditWindowClaims(db, dateStr, MERKLE_LEAF_VERSION);

      if (windowClaims.length === 0) {
        console.log("No claims in the audit window — skipping Merkle root computation.");
        return { skipped: true, claimCount: 0 };
      }

      const leaves = windowClaims.map((claim) =>
        claimLeafHash(claim, MERKLE_LEAF_VERSION),
      );

      const { root } = buildMerkleTree(leaves);

      // A stored root stands: a re-run for its date changes nothing.
      const stored = await db
        .insert(auditRoots)
        .values({
          date: dateStr,
          merkleRoot: root,
          claimCount: windowClaims.length,
          leafVersion: MERKLE_LEAF_VERSION,
        })
        .onConflictDoNothing({ target: auditRoots.date })
        .returning({ id: auditRoots.id });

      if (stored.length === 0) {
        console.log(`Merkle root for ${dateStr} is already stored.`);
        return { skipped: true, date: dateStr, claimCount: windowClaims.length };
      }

      console.log(
        `Merkle root for ${dateStr}: ${root.slice(0, 16)}... (${windowClaims.length} claims)`,
      );

      return {
        skipped: false,
        date: dateStr,
        merkleRoot: root,
        claimCount: windowClaims.length,
      };
    });

    return result;
  },
);

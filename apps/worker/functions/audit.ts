import { inngest } from "../inngest";
import { db, and, or, gte, lt, isNull, sql } from "@deepmint/db";
import { claims, auditRoots } from "@deepmint/db/schema";
import {
  MERKLE_LEAF_VERSION,
  computeClaimLeafHashV2,
  buildMerkleTree,
} from "@deepmint/shared";

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
      const dayEnd = todayStart;

      const windowClaims = await db
        .select()
        .from(claims)
        .where(
          or(
            and(
              gte(claims.recordedAt, dayStart),
              lt(claims.recordedAt, dayEnd),
            ),
            // Rows from before migration 0012 have no recorded_at. created_at
            // puts them in the root they always belonged to, so the day the
            // migration lands leaves no gap.
            and(
              isNull(claims.recordedAt),
              gte(claims.createdAt, dayStart),
              lt(claims.createdAt, dayEnd),
            ),
          ),
        )
        // Rows from one insert share a recorded_at, so id settles the order: a
        // root must be recomputable from the ledger.
        .orderBy(
          sql`coalesce(${claims.recordedAt}, ${claims.createdAt})`,
          claims.id,
        );

      if (windowClaims.length === 0) {
        console.log("No claims in the audit window — skipping Merkle root computation.");
        return { skipped: true, claimCount: 0 };
      }

      const leaves = windowClaims.map((claim) => computeClaimLeafHashV2(claim));

      const { root } = buildMerkleTree(leaves);
      const dateStr = dayStart.toISOString().split("T")[0]!;

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

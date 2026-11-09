import { and, or, gte, lt, isNull, sql } from "@deepmint/db";
import { claims } from "@deepmint/db/schema";
import {
  buildMerkleTree,
  claimLeafPayloadV1,
  claimLeafPayloadV2,
  computeClaimLeafHash,
  computeClaimLeafHashV2,
} from "@deepmint/shared";

/**
 * The window and leaves of a daily Merkle audit root, shared by the
 * merkle-audit worker, which builds roots, and claims.auditProof, which proves a
 * claim against one. Both must build identical leaves in an identical order.
 */

type Db = typeof import("@deepmint/db").db;
export type AuditedClaim = typeof claims.$inferSelect;

const DAY_MS = 86_400_000;

/** [start, end) of a UTC day given as YYYY-MM-DD. */
export function utcDayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

const utcDate = (at: Date) => at.toISOString().slice(0, 10);

/**
 * The day whose version 2 root covers a claim: the UTC day it reached the
 * ledger, or, for a row stored before migration 0012, its own date.
 */
export function auditDateV2(claim: { recordedAt: Date | null; createdAt: Date }): string {
  return utcDate(claim.recordedAt ?? claim.createdAt);
}

/** The day whose version 1 root covers a claim: its own date. */
export function auditDateV1(claim: { createdAt: Date }): string {
  return utcDate(claim.createdAt);
}

/**
 * The claims a root for `date` covers, in leaf order.
 *
 * - Version 2, every root since PR #17: the claims recorded that UTC day, a row
 *   with no recorded_at by its created_at, ordered by that instant and then id,
 *   so a root always recomputes.
 * - Version 1, roots stored before: the claims dated that UTC day, ordered by
 *   created_at alone, so rows with one created_at could have gone in any order
 *   (recomputeRoot tries them). `computedBefore` leaves out rows created or
 *   recorded after the root was computed, which it cannot hold.
 */
export async function auditWindowClaims(
  db: Db,
  date: string,
  leafVersion: number,
  computedBefore?: Date,
): Promise<AuditedClaim[]> {
  const { start, end } = utcDayBounds(date);
  if (leafVersion === 1) {
    const conditions = [gte(claims.createdAt, start), lt(claims.createdAt, end)];
    if (computedBefore) {
      conditions.push(lt(claims.createdAt, computedBefore));
      conditions.push(
        or(isNull(claims.recordedAt), lt(claims.recordedAt, computedBefore))!,
      );
    }
    return db
      .select()
      .from(claims)
      .where(and(...conditions))
      .orderBy(claims.createdAt, claims.id);
  }

  return db
    .select()
    .from(claims)
    .where(
      or(
        and(gte(claims.recordedAt, start), lt(claims.recordedAt, end)),
        // Rows from before migration 0012 have no recorded_at. created_at puts
        // them in the root they always belonged to.
        and(
          isNull(claims.recordedAt),
          gte(claims.createdAt, start),
          lt(claims.createdAt, end),
        ),
      ),
    )
    // Rows from one insert share a recorded_at, so id settles the order.
    .orderBy(sql`coalesce(${claims.recordedAt}, ${claims.createdAt})`, claims.id);
}

/** A claim's leaf hash under the given leaf version. */
export function claimLeafHash(claim: AuditedClaim, leafVersion: number): string {
  return leafVersion === 1 ? computeClaimLeafHash(claim) : computeClaimLeafHashV2(claim);
}

/** The exact text a claim's leaf hashes, which a browser can hash again. */
export function claimLeafPayload(claim: AuditedClaim, leafVersion: number): string {
  return leafVersion === 1 ? claimLeafPayloadV1(claim) : claimLeafPayloadV2(claim);
}

/**
 * The most orderings of tied version 1 rows recomputeRoot tries, and the most
 * leaves it rebuilds across them: claim pages are public, so one request must
 * stay cheap.
 */
const MAX_TIE_ORDERINGS = 5040;
const MAX_TIE_LEAVES = 300_000;

export interface StoredRoot {
  id: string;
  date: string;
  merkleRoot: string;
  claimCount: number;
  leafVersion: number;
  computedAt: Date;
}

/** A root rebuilt from the ledger: its claims' ids and leaf hashes, in leaf order. */
export interface RebuiltRoot {
  claimIds: string[];
  leaves: string[];
}

/**
 * Rebuilt roots by root id, null for one that does not rebuild. A stored root
 * never changes, and neither do the rows it covers (append-only, and later
 * rows fall outside its window), so the answer can be kept. Bounded, oldest
 * dropped first.
 */
const rebuilt = new Map<string, RebuiltRoot | null>();
const MAX_CACHED_ROOTS = 200;

/**
 * Rebuild a stored root from the ledger as it stands. Returns its claims in
 * leaf order when the rebuilt root equals the stored one, or null when it
 * cannot be reproduced: a proof is only shown against a root that rebuilds.
 *
 * A version 1 root was built from rows ordered by created_at alone, so rows
 * with an equal created_at may have gone in another order than the one read
 * back. Each ordering of such ties is tried, within MAX_TIE_ORDERINGS and
 * MAX_TIE_LEAVES; any ordering that rebuilds the stored root is the one it was
 * built from.
 */
export async function recomputeRoot(db: Db, root: StoredRoot): Promise<RebuiltRoot | null> {
  if (rebuilt.has(root.id)) return rebuilt.get(root.id)!;
  const result = await rebuild(db, root);
  if (rebuilt.size >= MAX_CACHED_ROOTS) rebuilt.delete(rebuilt.keys().next().value!);
  rebuilt.set(root.id, result);
  return result;
}

async function rebuild(db: Db, root: StoredRoot): Promise<RebuiltRoot | null> {
  const rows = await auditWindowClaims(
    db,
    root.date,
    root.leafVersion,
    root.leafVersion === 1 ? root.computedAt : undefined,
  );
  if (rows.length !== root.claimCount) return null;

  const leaves = rows.map((row) => claimLeafHash(row, root.leafVersion));
  const ids = rows.map((row) => row.id);
  if (buildMerkleTree(leaves).root === root.merkleRoot) return { claimIds: ids, leaves };
  if (root.leafVersion !== 1) return null;

  // Runs of rows with one created_at, as JS sees it (to the millisecond).
  const runs: number[][] = [];
  let run: number[] = [0];
  for (let i = 1; i <= rows.length; i++) {
    if (i < rows.length && rows[i]!.createdAt.getTime() === rows[i - 1]!.createdAt.getTime()) {
      run.push(i);
    } else {
      if (run.length > 1) runs.push(run);
      run = [i];
    }
  }
  const orderings = runs.reduce((n, r) => n * factorial(r.length), 1);
  if (runs.length === 0 || orderings > MAX_TIE_ORDERINGS || orderings * rows.length > MAX_TIE_LEAVES) {
    return null;
  }

  // An odometer over each run's permutations; rows outside the runs stay put.
  const perms = runs.map((r) => [...permutations(r)]);
  const dial = runs.map(() => 0);
  for (;;) {
    const order = rows.map((_, i) => i);
    runs.forEach((r, k) => r.forEach((pos, j) => (order[pos] = perms[k]![dial[k]!]![j]!)));
    const candidate = order.map((i) => leaves[i]!);
    if (buildMerkleTree(candidate).root === root.merkleRoot) {
      return { claimIds: order.map((i) => ids[i]!), leaves: candidate };
    }
    let k = 0;
    while (k < runs.length && ++dial[k]! === perms[k]!.length) dial[k++] = 0;
    if (k === runs.length) return null;
  }
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

/** Every order of a short list (a tied run: at most 7 long here). */
function* permutations(items: number[]): Generator<number[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i]!, ...tail];
  }
}

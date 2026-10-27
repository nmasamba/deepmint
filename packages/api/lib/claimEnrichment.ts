import { db, inArray, sql } from "@deepmint/db";
import { outcomes, notes } from "@deepmint/db/schema";
import { markoutDueDate, isSessionFinal, type MarkoutInput } from "@deepmint/scoring";

export interface ClaimOutcomeSummary {
  id: string;
  horizon: string;
  returnBps: number;
  directionCorrect: boolean;
  targetHit: boolean | null;
}

/**
 * Add each claim's outcomes and notes count to a page of claim rows, in two
 * queries for the whole page, plus its exit date under the markout rules and
 * whether that session has closed. A claim card can then tell a scored claim
 * from one awaiting its result and from one still running.
 */
export async function enrichClaimRows<
  T extends { claim: MarkoutInput & { id: string } },
>(
  rows: T[],
  now: Date = new Date(),
): Promise<
  Array<
    T & {
      outcomes: ClaimOutcomeSummary[];
      notesCount: number;
      exitDate: string;
      exitClosed: boolean;
    }
  >
> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.claim.id);

  const [outcomeRows, noteRows] = await Promise.all([
    db
      .select({
        id: outcomes.id,
        claimId: outcomes.claimId,
        horizon: outcomes.horizon,
        returnBps: outcomes.returnBps,
        directionCorrect: outcomes.directionCorrect,
        targetHit: outcomes.targetHit,
      })
      .from(outcomes)
      .where(inArray(outcomes.claimId, ids)),
    db
      .select({ claimId: notes.claimId, count: sql<number>`count(*)::int` })
      .from(notes)
      .where(inArray(notes.claimId, ids))
      .groupBy(notes.claimId),
  ]);

  const outcomesByClaim = new Map<string, ClaimOutcomeSummary[]>();
  for (const { claimId, ...outcome } of outcomeRows) {
    const list = outcomesByClaim.get(claimId) ?? [];
    list.push(outcome);
    outcomesByClaim.set(claimId, list);
  }
  const notesByClaim = new Map(noteRows.map((n) => [n.claimId, n.count]));

  return rows.map((row) => {
    const exitDate = markoutDueDate(row.claim);
    return {
      ...row,
      outcomes: outcomesByClaim.get(row.claim.id) ?? [],
      notesCount: notesByClaim.get(row.claim.id) ?? 0,
      exitDate,
      exitClosed: isSessionFinal(exitDate, now),
    };
  });
}

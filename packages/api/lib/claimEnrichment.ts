import { db, inArray, sql } from "@deepmint/db";
import { events, outcomes, notes } from "@deepmint/db/schema";
import { markoutDueDate, isSessionFinal, type MarkoutInput } from "@deepmint/scoring";

export interface ClaimOutcomeSummary {
  id: string;
  horizon: string;
  returnBps: number;
  directionCorrect: boolean;
  targetHit: boolean | null;
}

/** Where an extracted claim came from. The post's raw text is never public. */
export interface ClaimSource {
  sourceUrl: string | null;
  publisher: string | null;
  capturedAt: Date;
  contentHash: string;
}

/**
 * Add each claim's outcomes, notes count and source to a page of claim rows, in
 * three queries for the whole page, plus its exit date under the markout rules
 * and whether that session has closed. A claim card can then tell a scored
 * claim from one awaiting its result and from one still running.
 */
export async function enrichClaimRows<
  T extends { claim: MarkoutInput & { id: string; eventId: string | null } },
>(
  rows: T[],
  now: Date = new Date(),
): Promise<
  Array<
    T & {
      outcomes: ClaimOutcomeSummary[];
      notesCount: number;
      source: ClaimSource | null;
      exitDate: string;
      exitClosed: boolean;
    }
  >
> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.claim.id);
  const eventIds = rows.flatMap((r) => (r.claim.eventId ? [r.claim.eventId] : []));

  const [outcomeRows, noteRows, eventRows] = await Promise.all([
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
    db
      .select({
        id: events.id,
        sourceUrl: events.sourceUrl,
        publisher: events.publisher,
        capturedAt: events.capturedAt,
        contentHash: events.contentHash,
      })
      .from(events)
      .where(inArray(events.id, eventIds)),
  ]);

  const outcomesByClaim = new Map<string, ClaimOutcomeSummary[]>();
  for (const { claimId, ...outcome } of outcomeRows) {
    const list = outcomesByClaim.get(claimId) ?? [];
    list.push(outcome);
    outcomesByClaim.set(claimId, list);
  }
  const notesByClaim = new Map(noteRows.map((n) => [n.claimId, n.count]));
  const sourcesByEvent = new Map<string, ClaimSource>(
    eventRows.map(({ id, ...source }) => [id, source]),
  );

  return rows.map((row) => {
    const exitDate = markoutDueDate(row.claim);
    return {
      ...row,
      outcomes: outcomesByClaim.get(row.claim.id) ?? [],
      notesCount: notesByClaim.get(row.claim.id) ?? 0,
      source: sourcesByEvent.get(row.claim.eventId ?? "") ?? null,
      exitDate,
      exitClosed: isSessionFinal(exitDate, now),
    };
  });
}

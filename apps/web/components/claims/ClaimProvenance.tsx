import { ExternalLink } from "lucide-react";
import { formatBps, formatCurrency } from "@deepmint/shared";

interface ClaimSource {
  sourceUrl: string | null;
  publisher: string | null;
  capturedAt: Date;
  contentHash: string;
}

interface ClaimProvenanceProps {
  claim: {
    status: "pending_review" | "active" | "rejected" | null;
    sourceKind: "wall_street_rating" | "analyst_feed" | "self_logged" | null;
    ratingGrade: string | null;
    ratingAction: string | null;
    analystName: string | null;
    horizonStated: string | null;
    sourceExcerpt: string | null;
    createdAt: Date;
  };
  source: ClaimSource | null;
  outcomes: Array<{
    id: string;
    horizon: string;
    entryPriceCents: number;
    exitPriceCents: number;
    returnBps: number;
    directionCorrect: boolean;
    targetHit: boolean | null;
    computedAt: Date;
  }>;
}

/** Short label for where a claim came from, for the card's chip. */
export function sourceLabel(source: Pick<ClaimSource, "publisher"> | null): string {
  if (!source) return "Self-logged";
  return source.publisher ? `via ${source.publisher}` : "Guide's feed";
}

function laneLabel(
  sourceKind: ClaimProvenanceProps["claim"]["sourceKind"],
  source: ClaimSource | null,
): string {
  // Older rows have no source_kind; the event tells the lanes apart.
  if (sourceKind === "wall_street_rating" || (!sourceKind && source?.publisher)) {
    return "Wall Street rating, reported in the press";
  }
  if (sourceKind === "analyst_feed" || (!sourceKind && source)) {
    return "The Guide's own published post";
  }
  return "Logged in Deepmint by its author";
}

function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

/** Where a claim came from, and how it was scored. Never the post's full text. */
export function ClaimProvenance({ claim, source, outcomes }: ClaimProvenanceProps) {
  // Feed-supplied: only a web address becomes a link.
  const sourceUrl = source?.sourceUrl ?? null;
  const linkable = !!sourceUrl && /^https?:\/\//i.test(sourceUrl);

  return (
    <>
      <section className="rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">Source</h2>
        <dl className="space-y-3">
          {claim.status !== "active" && (
            <Row label="Status">
              {claim.status === "rejected" ? "Rejected in review" : "Held for review"}
            </Row>
          )}
          <Row label="Recorded as">{laneLabel(claim.sourceKind, source)}</Row>
          <Row label="Dated">{formatUtc(claim.createdAt)}</Row>
          {source?.publisher && <Row label="Publisher">{source.publisher}</Row>}
          {sourceUrl && (
            <Row label="Source">
              {linkable ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex max-w-full items-center gap-1 text-accent hover:underline"
                >
                  <span className="truncate">{sourceUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="break-all">{sourceUrl}</span>
              )}
            </Row>
          )}
          {source && <Row label="Published">{formatUtc(source.capturedAt)}</Row>}
          {claim.analystName && <Row label="Analyst">{claim.analystName}</Row>}
          {claim.ratingGrade && (
            <Row label="Rating">
              <span className="capitalize">
                {claim.ratingGrade.replace("_", " ")}
                {claim.ratingAction ? ` (${claim.ratingAction})` : ""}
              </span>
            </Row>
          )}
          {claim.horizonStated && <Row label="Stated horizon">“{claim.horizonStated}”</Row>}
          {claim.sourceExcerpt && (
            <Row label="Verified quote">
              <blockquote className="border-l-2 border-border pl-3 text-text-secondary">
                {claim.sourceExcerpt}
              </blockquote>
            </Row>
          )}
          {source && (
            <Row label="Content hash">
              <code className="font-mono text-xs break-all text-text-secondary">
                {source.contentHash}
              </code>
            </Row>
          )}
        </dl>
      </section>

      {outcomes.length > 0 && (
        <section className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Result</h2>
          <div className="space-y-4">
            {outcomes.map((outcome) => (
              <dl key={outcome.id} className="space-y-3">
                <Row label="Horizon">{outcome.horizon.toUpperCase()}</Row>
                <Row label="Entry close">
                  <span className="font-mono">{formatCurrency(outcome.entryPriceCents)}</span>
                </Row>
                <Row label="Exit close">
                  <span className="font-mono">{formatCurrency(outcome.exitPriceCents)}</span>
                </Row>
                <Row label="Return">
                  <span
                    className={`font-mono ${outcome.returnBps >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {formatBps(outcome.returnBps)}
                  </span>
                </Row>
                <Row label="Direction">{outcome.directionCorrect ? "Correct" : "Incorrect"}</Row>
                {outcome.targetHit !== null && (
                  <Row label="Target">{outcome.targetHit ? "Hit" : "Not hit"}</Row>
                )}
                <Row label="Scored">{formatUtc(outcome.computedAt)}</Row>
              </dl>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

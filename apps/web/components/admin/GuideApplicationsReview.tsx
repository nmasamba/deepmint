"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Decision {
  applicationId: string;
  decision: "approve" | "reject";
  /** Approve by making the ingested Guide they named their account. */
  link: boolean;
  name: string;
  guideName?: string;
}

/** Admin: Guide applications waiting for a decision (D16 option 2). */
export function GuideApplicationsReview() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.guides.adminList.useQuery({ status: "pending" });
  const [decision, setDecision] = useState<Decision | null>(null);
  // Shown to the applicant in Settings when the application is rejected.
  const [note, setNote] = useState("");

  const review = trpc.guides.adminReview.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.status === "rejected"
          ? "Application rejected"
          : result.linked
            ? "Approved: the Guide is now their account"
            : "Approved: now a Guide",
      );
      utils.guides.adminList.invalidate();
    },
    onError: (err) => toast.error("Review failed", { description: err.message }),
    onSettled: () => {
      setDecision(null);
      setNote("");
    },
  });

  const items = data ?? [];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-primary">
        Guide applications{items.length > 0 ? ` (${items.length})` : ""}
      </h2>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p className="text-sm text-red-400">Could not load applications: {error.message}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">No Guide applications waiting.</p>
      ) : (
        items.map((app) => (
          <div
            key={app.id}
            className="space-y-3 rounded-lg border border-border bg-bg-secondary p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${app.applicant.type}/${app.applicant.slug}`}
                className="font-medium text-text-primary hover:text-accent"
              >
                {app.applicant.displayName}
              </Link>
              <Badge variant="outline" className="border-border capitalize text-text-secondary">
                {app.applicant.type}
              </Badge>
              <span className="text-xs text-text-secondary">
                {app.claimCount} claim{app.claimCount === 1 ? "" : "s"} · applied{" "}
                {new Date(app.createdAt).toISOString().slice(0, 10)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{app.pitch}</p>
            {app.sourceUrl && (
              <a
                href={app.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex max-w-full items-center gap-1 text-sm text-accent hover:underline"
              >
                <span className="truncate">{app.sourceUrl}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )}
            {app.guide && (
              <p className="text-sm text-text-secondary">
                Says they are the ingested Guide{" "}
                <Link href={`/guide/${app.guide.slug}`} className="text-accent hover:underline">
                  {app.guide.displayName}
                </Link>
                {app.guide.sourceUrl ? ` (${app.guide.sourceUrl})` : ""}
                {app.guide.taken
                  ? ", which already belongs to an account."
                  : app.guide.firm
                    ? ", which holds a firm's ratings and cannot become one person's account."
                    : "."}
              </p>
            )}
            <div className="flex flex-wrap gap-3 pt-1">
              {app.guide && !app.guide.taken && !app.guide.firm && (
                <Button
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={review.isPending}
                  onClick={() =>
                    setDecision({
                      applicationId: app.id,
                      decision: "approve",
                      link: true,
                      name: app.applicant.displayName,
                      guideName: app.guide!.displayName,
                    })
                  }
                >
                  Approve and link to {app.guide.displayName}
                </Button>
              )}
              <Button
                size="sm"
                variant={app.guide && !app.guide.taken && !app.guide.firm ? "outline" : "default"}
                className={
                  app.guide && !app.guide.taken && !app.guide.firm
                    ? "border-green-600/40 text-green-500 hover:bg-green-600/10"
                    : "bg-green-600 text-white hover:bg-green-700"
                }
                disabled={review.isPending}
                onClick={() =>
                  setDecision({
                    applicationId: app.id,
                    decision: "approve",
                    link: false,
                    name: app.applicant.displayName,
                  })
                }
              >
                Approve as a Guide
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                disabled={review.isPending}
                onClick={() =>
                  setDecision({
                    applicationId: app.id,
                    decision: "reject",
                    link: false,
                    name: app.applicant.displayName,
                  })
                }
              >
                Reject
              </Button>
            </div>
          </div>
        ))
      )}

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.decision === "reject"
                ? "Reject the application?"
                : decision?.link
                  ? `Link ${decision?.name} to ${decision?.guideName}?`
                  : "Make them a Guide?"}
            </DialogTitle>
            <DialogDescription>
              {decision?.decision === "reject"
                ? `${decision?.name} stays a Player and can apply again.`
                : decision?.link
                  ? `From now on ${decision?.name} signs in as the Guide ${decision?.guideName}, which keeps its ratings and gets their new claims. Their portfolios, watchlist, follows, notifications, settings and broker link move with them. Their claims so far stay on their old Player profile, under their name, with no account.`
                  : `${decision?.name} becomes a Guide: scored with Guide metrics, listed with Guides and weighted 1.2× in consensus, with their claims so far.`}{" "}
              This is final.
            </DialogDescription>
          </DialogHeader>
          {decision?.decision === "reject" && (
            <Textarea
              aria-label="Note to the applicant"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Optional: why, shown to them in Settings"
              className="bg-bg-primary border-border"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              className={
                decision?.decision === "approve"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              }
              disabled={review.isPending}
              onClick={() =>
                decision &&
                review.mutate({
                  applicationId: decision.applicationId,
                  decision: decision.decision,
                  link: decision.link,
                  note: decision.decision === "reject" && note.trim() ? note.trim() : undefined,
                })
              }
            >
              {decision?.decision === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

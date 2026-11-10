"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Power } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface GuideRow {
  id: string;
  displayName: string;
  slug: string;
  sourceUrl: string | null;
  isAllowlisted: boolean | null;
}

/** The ingest reads a Guide only with both set, and the seed sets just the flag. */
function isFeedOn(guide: GuideRow): boolean {
  return !!guide.isAllowlisted && !!guide.sourceUrl;
}

function GuideFeedRow({ guide }: { guide: GuideRow }) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState(guide.sourceUrl ?? "");
  const enabled = isFeedOn(guide);
  const trimmed = url.trim();

  const setFeed = trpc.entity.adminSetFeed.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.isAllowlisted
          ? `${guide.displayName}: feed on, read at the next daily ingest`
          : `${guide.displayName}: feed off`,
      );
      utils.entity.adminGuides.invalidate();
    },
    onError: (err) => toast.error("Could not save the feed", { description: err.message }),
  });

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">
            {guide.displayName}
          </p>
          <p className="truncate font-mono text-xs text-text-muted">{guide.slug}</p>
        </div>
        <Badge
          variant="outline"
          className={enabled ? "border-accent text-accent" : "border-border text-text-secondary"}
        >
          {enabled ? "Feed on" : "Feed off"}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={`Feed URL for ${guide.displayName}`}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/feed"
          className="bg-bg-primary"
        />
        <Button
          variant="outline"
          className="border-border text-text-secondary"
          disabled={setFeed.isPending || trimmed === (guide.sourceUrl ?? "")}
          onClick={() =>
            setFeed.mutate({
              entityId: guide.id,
              sourceUrl: trimmed || null,
              enabled: enabled && trimmed !== "",
            })
          }
        >
          Save URL
        </Button>
        <Button
          variant="outline"
          className={
            enabled
              ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
              : "border-accent/30 text-accent hover:bg-accent/10"
          }
          disabled={setFeed.isPending || (!enabled && !trimmed)}
          onClick={() =>
            setFeed.mutate({
              entityId: guide.id,
              sourceUrl: trimmed || null,
              enabled: !enabled,
            })
          }
        >
          <Power className="mr-1 h-4 w-4" />
          {enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>
    </div>
  );
}

export default function AdminGuidesPage() {
  const { data: guides, isLoading, error } = trpc.entity.adminGuides.useQuery();
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const shown = (guides ?? []).filter(
    (g) =>
      !needle ||
      g.displayName.toLowerCase().includes(needle) ||
      g.slug.includes(needle),
  );
  const onCount = (guides ?? []).filter(isFeedOn).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Guides</h1>
        <p className="mt-1 text-text-secondary">
          The daily ingest reads the RSS or Atom feed of each Guide switched on
          here{guides ? `: ${onCount} of ${guides.length}` : ""}.
        </p>
        <p className="mt-2 text-sm text-warning">
          Each read takes only posts published in the last 7 days; older
          history is a backfill&apos;s job, so end a backfill&apos;s archive 7
          days before switching its feed on. A post with no date is taken once,
          however old. A post&apos;s claims are dated and scored from the day it
          is stored, and cannot be removed afterwards.
        </p>
      </div>

      <Input
        aria-label="Filter Guides"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter by name or slug"
        className="bg-bg-primary"
      />

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-bg-secondary p-8 text-center">
          <p className="text-red-400">Could not load the Guides: {error.message}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
          <p className="text-text-secondary">No Guides found.</p>
        </div>
      ) : (
        shown.map((guide) => (
          <GuideFeedRow key={`${guide.id}:${guide.sourceUrl ?? ""}`} guide={guide} />
        ))
      )}
    </div>
  );
}

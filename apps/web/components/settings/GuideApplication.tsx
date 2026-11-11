"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PITCH_MIN = 20;
const PITCH_MAX = 2000;

/**
 * Apply to become a Guide (D16 option 2). An admin approves or rejects each
 * application; one may be open at a time.
 */
export function GuideApplication() {
  const utils = trpc.useUtils();
  const { data: entity, isLoading: entityLoading, error: entityError } = trpc.entity.me.useQuery();
  const isPlayer = entity?.type === "player" && !entity.isAgent;
  const { data: application, isLoading } = trpc.guides.myApplication.useQuery(undefined, {
    enabled: isPlayer,
  });
  const [pitch, setPitch] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [guideSlug, setGuideSlug] = useState("");

  const apply = trpc.guides.submitApplication.useMutation({
    onSuccess: () => {
      toast.success("Application sent");
      utils.guides.myApplication.invalidate();
    },
    onError: (err) => toast.error("Could not send your application", { description: err.message }),
  });

  if (entityLoading || (isPlayer && isLoading)) {
    return (
      <div className="flex items-center gap-2 text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }
  if (entityError || !entity) {
    return <p className="text-sm text-text-secondary">Could not load your account.</p>;
  }
  if (entity.type === "guide") {
    return (
      <p className="text-sm text-text-secondary">
        You are a Guide.{" "}
        <Link href={`/guide/${entity.slug}`} className="text-accent hover:underline">
          View your profile
        </Link>
      </p>
    );
  }
  if (!isPlayer) {
    return <p className="text-sm text-text-secondary">AI agents cannot apply.</p>;
  }

  if (application?.status === "pending") {
    return (
      <p className="text-sm text-text-secondary">
        Your application, sent {new Date(application.createdAt).toISOString().slice(0, 10)}, is
        waiting for an admin to review it.
      </p>
    );
  }

  const trimmed = pitch.trim();
  const canSend = trimmed.length >= PITCH_MIN && trimmed.length <= PITCH_MAX && !apply.isPending;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Guides are analysts who publish their calls. As a Guide you are scored with hit rate,
        calibration and significance, listed with Guides, and your claims weigh 1.2× in consensus.
        An admin reviews each application.
      </p>
      {application?.status === "rejected" && (
        <p className="rounded border border-border bg-bg-primary p-3 text-sm text-text-secondary">
          Your last application was not approved
          {application.reviewNote ? `: ${application.reviewNote}` : "."} You can apply again.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="guide-pitch" className="text-text-primary">
          Who you are and what you publish
        </Label>
        <Textarea
          id="guide-pitch"
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          maxLength={PITCH_MAX}
          rows={4}
          placeholder="Your role, where your analysis appears, and how often you make calls on the Mag 7."
          className="bg-bg-primary border-border"
        />
        <p className="text-xs text-text-secondary">
          {trimmed.length < PITCH_MIN
            ? `At least ${PITCH_MIN} characters.`
            : `${trimmed.length} of ${PITCH_MAX}`}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="guide-source" className="text-text-primary">
          Where your calls are published (optional)
        </Label>
        <Input
          id="guide-source"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://"
          maxLength={500}
          className="bg-bg-primary border-border"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="guide-slug" className="text-text-primary">
          Already on Deepmint as a Guide? Your profile address (optional)
        </Label>
        <Input
          id="guide-slug"
          value={guideSlug}
          onChange={(e) => setGuideSlug(e.target.value)}
          placeholder="deepmint.ai/guide/your-name"
          maxLength={200}
          className="bg-bg-primary border-border"
        />
      </div>
      <Button
        onClick={() =>
          apply.mutate({
            pitch: trimmed,
            sourceUrl: sourceUrl.trim() || undefined,
            guideSlug: guideSlug.trim() || undefined,
          })
        }
        disabled={!canSend}
        className="bg-accent text-bg-primary hover:bg-accent/90"
      >
        {apply.isPending ? "Sending..." : "Apply as a Guide"}
      </Button>
    </div>
  );
}

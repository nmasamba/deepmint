"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  PROFILE_BIO_MAX,
  PROFILE_STYLE_TAG_MAX,
  PROFILE_STYLE_TAGS_MAX,
} from "@deepmint/shared";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** "value, tech, value" as the tags to save: trimmed, each once. */
function parseTags(text: string): string[] {
  return [...new Set(text.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

/** Bio and style tags, which Deepmint owns. Name and photo come from Clerk. */
export function ProfileForm() {
  const utils = trpc.useUtils();
  const { data: entity, isLoading } = trpc.entity.me.useQuery();
  const [bio, setBio] = useState("");
  const [tagText, setTagText] = useState("");

  useEffect(() => {
    if (!entity) return;
    setBio(entity.bio ?? "");
    setTagText((entity.styleTags ?? []).join(", "));
  }, [entity]);

  const updateMutation = trpc.entity.update.useMutation({
    onSuccess: () => {
      toast.success("Profile saved");
      utils.entity.me.invalidate();
    },
    onError: (error) => {
      toast.error("Could not save your profile", { description: error.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading profile...
      </div>
    );
  }

  const tags = parseTags(tagText);
  const tagProblem =
    tags.length > PROFILE_STYLE_TAGS_MAX
      ? `Use at most ${PROFILE_STYLE_TAGS_MAX} tags.`
      : tags.some((tag) => tag.length > PROFILE_STYLE_TAG_MAX)
        ? `Keep each tag to ${PROFILE_STYLE_TAG_MAX} characters.`
        : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        updateMutation.mutate({ bio, styleTags: tags });
      }}
    >
      <p className="text-sm text-text-secondary">
        Your name and photo come from your account: change them in the account
        menu at the top of the page, and your profile follows. Your profile
        address stays the same.
      </p>

      <div className="space-y-2">
        <Label htmlFor="profile-bio">Bio</Label>
        <Textarea
          id="profile-bio"
          value={bio}
          maxLength={PROFILE_BIO_MAX}
          onChange={(event) => setBio(event.target.value)}
          placeholder="What you follow and how you invest"
        />
        <p className="text-xs text-text-muted">
          {bio.length} of {PROFILE_BIO_MAX} characters
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-tags">Style tags</Label>
        <Input
          id="profile-tags"
          value={tagText}
          onChange={(event) => setTagText(event.target.value)}
          placeholder="value, tech, macro"
        />
        <p className={tagProblem ? "text-xs text-warning" : "text-xs text-text-muted"}>
          {tagProblem ?? `Separate tags with commas, up to ${PROFILE_STYLE_TAGS_MAX}.`}
        </p>
      </div>

      <Button
        type="submit"
        size="sm"
        className="bg-accent text-bg-primary"
        disabled={updateMutation.isPending || tagProblem !== null}
      >
        {updateMutation.isPending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}

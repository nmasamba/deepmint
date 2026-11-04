"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_NOTE_LENGTH = 5000;

interface ClaimNotesProps {
  claimId: string;
  notes: Array<{ id: string; noteText: string; createdAt: Date }>;
  /** The claim's owner may add notes. */
  canAdd: boolean;
}

/** Notes on a claim, oldest first. Notes are how an append-only claim is corrected. */
export function ClaimNotes({ claimId, notes, canAdd }: ClaimNotesProps) {
  const router = useRouter();
  const [noteText, setNoteText] = useState("");

  const addNote = trpc.claims.addNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  if (notes.length === 0 && !canAdd) return null;

  return (
    <section className="rounded-lg border border-border bg-bg-secondary p-4">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">Notes</h2>

      {notes.length > 0 ? (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id}>
              <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                {note.noteText}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {note.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-secondary">No notes yet.</p>
      )}

      {canAdd && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            addNote.mutate({ claimId, noteText: noteText.trim() });
          }}
        >
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            placeholder="Add context or a correction..."
            aria-label="Add a note"
            className="bg-bg-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-text-secondary">
              A note is permanent: it cannot be edited or deleted, and the claim itself does not change.
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={!noteText.trim() || addNote.isPending}
              className="shrink-0 bg-accent text-bg-primary hover:bg-accent/90"
            >
              Add note
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

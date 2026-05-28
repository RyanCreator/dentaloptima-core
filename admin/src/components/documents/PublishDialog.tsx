import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  // The dialog hands back the entered summary (or null if blank).
  onPublish: (changeSummary: string | null) => Promise<void> | void;
}

// Asks for an optional change summary before saving a PUBLISHED doc.
// The summary becomes part of the new admin_document_version row so the
// Versions tab tells a story instead of just "edited at 14:32".
//
// Summary is optional — the dialog still confirms even when empty —
// because most edits don't warrant a sentence but we want to nudge for
// one on substantive changes.
export function PublishDialog({ open, onOpenChange, documentTitle, onPublish }: PublishDialogProps) {
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset state when the dialog reopens — otherwise the previous edit's
  // summary lingers.
  useEffect(() => {
    if (open) setSummary("");
  }, [open]);

  async function handlePublish() {
    setBusy(true);
    try {
      await onPublish(summary.trim() || null);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish "{documentTitle || "Untitled"}"</DialogTitle>
          <DialogDescription>
            This saves the doc and adds a new version snapshot to the change log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="publish-summary">
            What changed? <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="publish-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Added pricing table for hygiene plans; clarified onboarding step 3."
            className="min-h-[100px]"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Future-you (and teammates) will read this on the Versions tab.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={busy}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

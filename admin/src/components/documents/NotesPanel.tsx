import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Trash2, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import {
  useAdminDocumentNotes,
  createAdminDocumentNote,
  updateAdminDocumentNote,
  deleteAdminDocumentNote,
  type AdminDocumentNote,
} from "@/hooks/useAdminDocuments";

// Internal-only thread of notes pinned to a doc. Notes stay separate
// from the doc body so they don't leak when a doc is shared/printed.
//
// Any admin can edit/delete any note — the RLS policies allow it and
// we're a small team. If that becomes too loose later we can clamp to
// "by author only" via a created_by check.
export function NotesPanel({ documentId }: { documentId: string }) {
  const { notes, loading, reload } = useAdminDocumentNotes(documentId);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await createAdminDocumentNote(documentId, body);
      setDraft("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post note");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* New-note composer */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note. Markdown is supported — useful for links and short lists."
          className="min-h-[88px]"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Notes are internal-only. They never appear in the printed PDF or in the doc body.
          </p>
          <Button size="sm" onClick={handlePost} disabled={posting || !draft.trim()}>
            {posting ? "Posting…" : "Post note"}
          </Button>
        </div>
      </div>

      {/* Thread */}
      {loading && notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading notes…</p>
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm">No notes yet — be the first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onChange }: { note: AdminDocumentNote; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body_markdown);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const edited = note.updated_at !== note.created_at;

  async function handleSave() {
    const body = draft.trim();
    if (!body) {
      toast.error("Note can't be empty");
      return;
    }
    if (body === note.body_markdown) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await updateAdminDocumentNote(note.id, body);
      setEditing(false);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteAdminDocumentNote(note.id);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs text-muted-foreground truncate">
          <span className="font-medium text-foreground">{note.author_email ?? "Unknown admin"}</span>
          {" · "}
          <span title={new Date(note.created_at).toLocaleString()}>
            {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
          </span>
          {edited && <span className="italic ml-1">(edited)</span>}
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setDraft(note.body_markdown);
                setEditing(true);
              }}
              aria-label="Edit note"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete note"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[80px]"
            autoFocus
          />
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="markdown-preview text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body_markdown}</ReactMarkdown>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this note?"
        description="The note will be permanently removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

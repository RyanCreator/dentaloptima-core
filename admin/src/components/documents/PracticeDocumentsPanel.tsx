import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Eye, FileText, Search, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  useAssignableDocumentsForPractice,
  getDocumentForAssignment,
  assignDocumentToPractice,
  unassignDocument,
  type AssignableDocument,
} from "@/hooks/useDocumentAssignments";
import { cn } from "@/lib/utils";

interface PracticeDocumentsPanelProps {
  practiceId: string;
  practiceName: string;
}

// Bulk tick-list UI for assigning documents to a single practice.
// Inverse of the per-doc Assignments tab: when an operator is onboarding
// a practice, they want to scan the doc library once and tick what
// applies, rather than open each doc separately.
//
// The toggle is the action — flipping it on calls assign, flipping off
// calls unassign. No "Save" button — saves are atomic per row, like
// the practice_member is_active toggle elsewhere in the admin.
export function PracticeDocumentsPanel({ practiceId, practiceName }: PracticeDocumentsPanelProps) {
  const { documents, loading, reload } = useAssignableDocumentsForPractice(practiceId);
  const [search, setSearch] = useState("");
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.title.toLowerCase().includes(q));
  }, [documents, search]);

  const assignedCount = documents.filter((d) => d.assignment !== null).length;

  async function handleToggle(doc: AssignableDocument, next: boolean) {
    if (busyDocId) return;
    setBusyDocId(doc.id);
    try {
      if (next) {
        const latest = await getDocumentForAssignment(doc.id);
        if (!latest) throw new Error("Could not load document");
        await assignDocumentToPractice({
          practiceId,
          sourceDocumentId: doc.id,
          sourceVersionId: latest.latest_version_id,
          title: latest.title,
          bodyMarkdown: latest.body_markdown,
          kind: latest.kind,
        });
        toast.success(`Assigned "${latest.title}" to ${practiceName}`);
      } else {
        if (!doc.assignment) return;
        await unassignDocument(doc.assignment.id);
        toast.success(`Removed "${doc.title}" from ${practiceName}`);
      }
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyDocId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-medium">Documents</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tick documents to share them with this practice.
            {documents.length > 0 && (
              <>
                {" "}
                <span className="tabular-nums">
                  {assignedCount} of {documents.length}
                </span>{" "}
                assigned.
              </>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading && documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm font-medium">No client-facing documents in the library yet.</p>
          <p className="text-sm mt-1">
            <Link to="/documents" className="text-primary hover:underline">
              Go to Documents
            </Link>{" "}
            to author some.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents match "{search}".</p>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filtered.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              busy={busyDocId === doc.id}
              onToggle={(next) => handleToggle(doc, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({
  doc,
  busy,
  onToggle,
}: {
  doc: AssignableDocument;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const isAssigned = doc.assignment !== null;

  return (
    <div className="flex items-start gap-3 p-4">
      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("font-medium truncate", !isAssigned && "text-muted-foreground")}>
            {doc.title}
          </span>
          {doc.status === "DRAFT" && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              Draft
            </span>
          )}
          {isAssigned && doc.assignment?.acknowledged_at && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              <Check className="h-3 w-3" />
              Acked
            </span>
          )}
          {isAssigned && doc.assignment?.viewed_at && !doc.assignment.acknowledged_at && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              <Eye className="h-3 w-3" />
              Viewed
            </span>
          )}
          {isAssigned && !doc.assignment?.viewed_at && !doc.assignment?.acknowledged_at && (
            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              Unread
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {doc.status === "PUBLISHED" ? "Published" : "Draft"} ·{" "}
          <Link
            to={`/documents/${doc.id}`}
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      </div>
      <Switch
        checked={isAssigned}
        onCheckedChange={(v) => onToggle(v)}
        disabled={busy}
        aria-label={isAssigned ? `Unassign ${doc.title}` : `Assign ${doc.title}`}
      />
    </div>
  );
}

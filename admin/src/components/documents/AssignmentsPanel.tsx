import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Building2,
  Check,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTenants } from "@/hooks/useTenants";
import {
  useDocumentAssignments,
  useAssignedPracticeIds,
  assignDocumentToPractice,
  unassignDocument,
  type PracticeDocumentAssignment,
} from "@/hooks/useDocumentAssignments";
import { getLatestVersionId } from "@/hooks/useAdminDocuments";
import { cn } from "@/lib/utils";

interface AssignmentsPanelProps {
  documentId: string;
  documentStatus: "DRAFT" | "PUBLISHED";
  // Live values from the editor — these are what will be frozen onto
  // the practice copy. We use the editor state rather than re-fetching
  // so unsaved edits don't surprise the operator (we won't push body
  // they haven't saved).
  documentTitle: string;
  documentBody: string;
  documentKind: "CLIENT_FACING" | "INTERNAL";
}

export function AssignmentsPanel({
  documentId,
  documentStatus,
  documentTitle,
  documentBody,
  documentKind,
}: AssignmentsPanelProps) {
  const { assignments, loading, reload } = useDocumentAssignments(documentId);
  const { ids: assignedIds, reload: reloadAssignedIds } = useAssignedPracticeIds(documentId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAssigned = () => {
    reload();
    reloadAssignedIds();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Practices with this document
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {documentStatus === "DRAFT"
              ? "This doc is still a Draft. You can assign it, but the practice will see the current draft content frozen at assignment time."
              : "Content is frozen at assignment time. Re-publish + re-assign to push a new version."}
          </p>
        </div>
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Assign to practice
        </Button>
      </div>

      {loading && assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading assignments…</p>
      ) : assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm font-medium">Not assigned to any practice yet.</p>
          <p className="text-sm mt-1">Click "Assign to practice" to push this doc to a tenant.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <AssignmentRow key={a.id} assignment={a} onChanged={handleAssigned} />
          ))}
        </div>
      )}

      <AssignPracticeDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        documentId={documentId}
        documentTitle={documentTitle}
        documentBody={documentBody}
        documentKind={documentKind}
        excludeIds={assignedIds}
        onAssigned={handleAssigned}
      />
    </div>
  );
}

function AssignmentRow({
  assignment,
  onChanged,
}: {
  assignment: PracticeDocumentAssignment;
  onChanged: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function handleRemove() {
    try {
      await unassignDocument(assignment.id);
      toast.success("Removed from practice");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <Building2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{assignment.practice_name ?? "Unknown practice"}</span>
          <TrackingBadges assignment={assignment} />
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Assigned {formatDistanceToNow(new Date(assignment.assigned_at), { addSuffix: true })}
          {assignment.assigned_by_admin_email && ` by ${assignment.assigned_by_admin_email}`}
          {" · "}
          <span title={new Date(assignment.assigned_at).toLocaleString()}>
            {format(new Date(assignment.assigned_at), "d MMM yyyy")}
          </span>
        </div>
        {assignment.viewed_at && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Viewed {formatDistanceToNow(new Date(assignment.viewed_at), { addSuffix: true })}
          </div>
        )}
        {assignment.acknowledged_at && (
          <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
            <Check className="h-3 w-3 inline mr-1" />
            Acknowledged {formatDistanceToNow(new Date(assignment.acknowledged_at), { addSuffix: true })}
          </div>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
        onClick={() => setConfirmRemove(true)}
        aria-label="Unassign from practice"
        title="Unassign from practice"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Unassign this document?"
        description={`The practice will no longer see "${assignment.title}". Their viewed/acknowledged state is preserved in the audit log but the doc is removed from their library.`}
        confirmLabel="Unassign"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}

function TrackingBadges({ assignment }: { assignment: PracticeDocumentAssignment }) {
  if (assignment.acknowledged_at) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
        Acked
      </span>
    );
  }
  if (assignment.viewed_at) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
        Viewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
      Unread
    </span>
  );
}

function AssignPracticeDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  documentBody,
  documentKind,
  excludeIds,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  documentBody: string;
  documentKind: "CLIENT_FACING" | "INTERNAL";
  excludeIds: Set<string>;
  onAssigned: () => void;
}) {
  const { data: tenants = [], isLoading } = useTenants();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants
      .filter((t) => !excludeIds.has(t.id))
      .filter(
        (t) =>
          !q ||
          (t.name && t.name.toLowerCase().includes(q)) ||
          (t.slug && t.slug.toLowerCase().includes(q)) ||
          (t.city && t.city.toLowerCase().includes(q)) ||
          (t.postcode && t.postcode.toLowerCase().includes(q)),
      );
  }, [tenants, excludeIds, search]);

  async function handleAssign(practiceId: string, practiceName: string) {
    if (busyId) return;
    setBusyId(practiceId);
    try {
      const latestVersionId = await getLatestVersionId(documentId);
      await assignDocumentToPractice({
        practiceId,
        sourceDocumentId: documentId,
        sourceVersionId: latestVersionId,
        title: documentTitle.trim() || "Untitled",
        bodyMarkdown: documentBody,
        kind: documentKind,
      });
      toast.success(`Assigned to ${practiceName}`);
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busyId && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign to a practice</DialogTitle>
          <DialogDescription>
            The current title + body will be frozen onto the practice's copy. Re-publish + re-assign
            later to push a new version.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search practice name, slug, city, postcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[400px] overflow-auto rounded-lg border divide-y">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading practices…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {tenants.length === excludeIds.size
                ? "This doc is already assigned to every practice."
                : "No practices match."}
            </p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => handleAssign(t.id, t.name)}
                disabled={busyId !== null}
                className={cn(
                  "w-full text-left flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors",
                  busyId !== null && "opacity-60 cursor-not-allowed",
                )}
              >
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[t.city, t.postcode].filter(Boolean).join(" · ") || t.slug}
                  </div>
                </div>
                {busyId === t.id ? (
                  <span className="text-xs text-muted-foreground">Assigning…</span>
                ) : (
                  <Send className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!busyId}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

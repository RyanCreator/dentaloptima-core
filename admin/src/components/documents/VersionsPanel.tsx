import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, History, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import {
  useAdminDocumentVersions,
  revertAdminDocumentToVersion,
  type AdminDocumentVersion,
} from "@/hooks/useAdminDocuments";

// Change-log view. Lists every Publish snapshot for a doc, newest first.
// Each row expands to show the body that was published, and offers a
// Revert action that copies that body back into the live row as a DRAFT
// — the operator has to make a deliberate Publish to broadcast the
// revert as a new entry in the log.
export function VersionsPanel({
  documentId,
  onReverted,
}: {
  documentId: string;
  onReverted: () => void;
}) {
  const { versions, loading, reload } = useAdminDocumentVersions(documentId);

  if (loading && versions.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading versions…</p>;
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-60" />
        <p className="text-sm font-medium">No versions yet.</p>
        <p className="text-sm mt-1">
          Versions are captured each time you Publish. Save as Draft doesn't create one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {versions.length} {versions.length === 1 ? "version" : "versions"}. Each Publish creates one.
      </p>
      {versions.map((v, idx) => (
        <VersionCard
          key={v.id}
          version={v}
          isLatest={idx === 0}
          onReverted={() => {
            reload();
            onReverted();
          }}
        />
      ))}
    </div>
  );
}

function VersionCard({
  version,
  isLatest,
  onReverted,
}: {
  version: AdminDocumentVersion;
  isLatest: boolean;
  onReverted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);

  async function handleRevert() {
    try {
      await revertAdminDocumentToVersion(version.document_id, version);
      toast.success("Reverted. The doc is now a DRAFT with this version's content.");
      onReverted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revert failed");
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{version.title}</span>
            {isLatest && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                Latest
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {version.author_email ?? "Unknown admin"}
            {" · "}
            <span title={new Date(version.created_at).toLocaleString()}>
              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
            </span>
            {" · "}
            <span>{format(new Date(version.created_at), "d MMM yyyy, HH:mm")}</span>
          </div>
          {version.change_summary && (
            <p className="text-sm mt-2 italic">"{version.change_summary}"</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/30 p-4 space-y-3">
          <div className="rounded-md border bg-card p-4 max-h-[400px] overflow-auto">
            <div className="markdown-preview text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{version.body_markdown}</ReactMarkdown>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmRevert(true)}
              disabled={isLatest}
              title={isLatest ? "This is already the current published content" : undefined}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Revert to this version
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRevert}
        onOpenChange={setConfirmRevert}
        title="Revert to this version?"
        description="The live doc body, title, and kind will be replaced with this snapshot. The doc will become a DRAFT — you'll need to Publish again to broadcast the revert."
        confirmLabel="Revert"
        onConfirm={handleRevert}
      />
    </div>
  );
}

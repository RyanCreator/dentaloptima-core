import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  Save,
  Download,
  Archive,
  ArchiveRestore,
  Trash2,
  Send,
} from "lucide-react";
import { generateDocumentPdf } from "@/lib/generateDocumentPdf";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PublishDialog } from "@/components/documents/PublishDialog";
import { NotesPanel } from "@/components/documents/NotesPanel";
import { VersionsPanel } from "@/components/documents/VersionsPanel";
import { AssignmentsPanel } from "@/components/documents/AssignmentsPanel";
import {
  useAdminDocument,
  updateAdminDocument,
  archiveAdminDocument,
  unarchiveAdminDocument,
  deleteAdminDocument,
  publishAdminDocument,
  type AdminDocumentKind,
  type AdminDocumentStatus,
} from "@/hooks/useAdminDocuments";

// Editor view: textarea (Markdown source) + live preview. Save is explicit,
// so unsaved edits stick around even if the operator clicks Preview.
//
// PDF download is window.print() against an isolated preview region. The
// global print stylesheet (admin/src/styles/print.css) hides everything
// except `[data-print-target="true"]`, so what the operator sees in the
// preview pane is exactly what the printed PDF contains.

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { doc, loading, error, reload } = useAdminDocument(id);

  if (loading) {
    return (
      <Layout title="Document" description="Loading…">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Layout>
    );
  }
  if (error || !doc) {
    return (
      <Layout title="Document" description="Not found">
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>This document doesn't exist or has been deleted.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/documents")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to library
          </Button>
        </div>
      </Layout>
    );
  }

  return <DocumentEditor key={doc.id} initial={doc} onSaved={reload} />;
}

function DocumentEditor({
  initial,
  onSaved,
}: {
  initial: {
    id: string;
    title: string;
    slug: string | null;
    body_markdown: string;
    kind: AdminDocumentKind;
    status: AdminDocumentStatus;
    updated_at: string;
    archived_at: string | null;
  };
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [body, setBody] = useState(initial.body_markdown);
  const [kind, setKind] = useState<AdminDocumentKind>(initial.kind);
  const [status, setStatus] = useState<AdminDocumentStatus>(initial.status);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmExit, setConfirmExit] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const slugError = slug.trim() && !SLUG_RE.test(slug.trim())
    ? "Slug must be lowercase letters, numbers and hyphens (e.g. 'onboarding-pack')."
    : null;

  const isDirty =
    initial.title !== title.trim() ||
    (initial.slug ?? "") !== slug.trim() ||
    initial.body_markdown !== body ||
    initial.kind !== kind ||
    initial.status !== status;

  // Warn on browser-level navigation away (close tab, back button) if
  // there are unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function tryNavigate(to: string) {
    if (isDirty) setConfirmExit(to);
    else navigate(to);
  }

  // The Save button is context-aware:
  //   • status = DRAFT     → updateAdminDocument (silent save)
  //   • status = PUBLISHED → opens PublishDialog. The dialog calls
  //     publishAdminDocument (RPC) which atomically updates the doc
  //     AND inserts a version snapshot.
  // This means every Publish save shows up in the change log, and
  // Drafts stay out of the log entirely.
  function validate(): boolean {
    if (!title.trim()) {
      toast.error("Title is required");
      return false;
    }
    if (slugError) {
      toast.error(slugError);
      return false;
    }
    return true;
  }

  function handleSaveClick() {
    if (!validate()) return;
    if (status === "PUBLISHED") {
      setPublishOpen(true);
    } else {
      void handleSaveDraft();
    }
  }

  async function handleSaveDraft() {
    setBusy(true);
    try {
      await updateAdminDocument(initial.id, {
        title: title.trim(),
        slug: slug.trim() || null,
        body_markdown: body,
        kind,
        status,
      });
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish(changeSummary: string | null) {
    setBusy(true);
    try {
      await publishAdminDocument({
        id: initial.id,
        title: title.trim(),
        body_markdown: body,
        kind,
        slug: slug.trim() || null,
        change_summary: changeSummary,
      });
      toast.success("Published — new version saved to the change log");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
      throw err; // re-throw so dialog stays open on failure
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveToggle() {
    setBusy(true);
    try {
      if (initial.archived_at) {
        await unarchiveAdminDocument(initial.id);
        toast.success("Document restored");
      } else {
        await archiveAdminDocument(initial.id);
        toast.success("Document archived");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteAdminDocument(initial.id);
      toast.success("Document deleted");
      navigate("/documents");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  async function handleDownloadPdf() {
    // Generate the PDF directly — no window.print(), no browser-added
    // headers/footers, no URL printed at the bottom. The file downloads
    // with the doc title as its name.
    setBusy(true);
    try {
      await generateDocumentPdf({
        title: title.trim() || "Untitled",
        bodyMarkdown: body,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout
      title={initial.title || "Untitled"}
      description={`${kindLabel(kind)} · Last edited ${format(new Date(initial.updated_at), "d MMM yyyy, HH:mm")}`}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => tryNavigate("/documents")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Library
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={busy}>
            <Download className="h-4 w-4 mr-1.5" />
            Download PDF
          </Button>
          <Button size="sm" onClick={handleSaveClick} disabled={busy || !isDirty}>
            {status === "PUBLISHED" ? (
              <Send className="h-4 w-4 mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {isDirty
              ? status === "PUBLISHED"
                ? "Publish…"
                : "Save draft"
              : status === "PUBLISHED"
                ? "Published"
                : "Saved"}
          </Button>
        </>
      }
    >
      <Tabs defaultValue="editor" className="w-full print:hidden">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-4">

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 print:block">
        {/* ---- Main editor + preview --------------------------------- */}
        <div className="min-w-0 space-y-4 print:hidden">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              className="text-base"
            />
          </div>

          <Tabs defaultValue="edit" className="w-full">
            <TabsList>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="split">Split</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="mt-3">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write in Markdown. ## headings, **bold**, lists, tables — all supported."
                className="min-h-[60vh] font-mono text-sm leading-relaxed"
                spellCheck={false}
              />
            </TabsContent>

            <TabsContent value="preview" className="mt-3">
              <div className="rounded-lg border bg-card p-6 min-h-[60vh] overflow-auto">
                <MarkdownPreview markdown={body} />
              </div>
            </TabsContent>

            <TabsContent value="split" className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[60vh] font-mono text-sm leading-relaxed"
                  spellCheck={false}
                />
                <div className="rounded-lg border bg-card p-4 min-h-[60vh] overflow-auto">
                  <MarkdownPreview markdown={body} />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ---- Side panel: metadata + actions ------------------------ */}
        <aside className="space-y-4 print:hidden">
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-kind">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as AdminDocumentKind)}>
                <SelectTrigger id="doc-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_FACING">Client-facing</SelectItem>
                  <SelectItem value="INTERNAL">Internal</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {kind === "CLIENT_FACING"
                  ? "Shared with practices. Later phases will allow per-tenant assignment."
                  : "Team-only. Not visible to practices."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AdminDocumentStatus)}>
                <SelectTrigger id="doc-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Draft is editable scratch space. Published is the version teammates link to.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-slug">Slug (optional)</Label>
              <Input
                id="doc-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="onboarding-pack"
                className="font-mono text-sm"
              />
              {slugError ? (
                <p className="text-xs text-destructive">{slugError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  URL-safe identifier for sharing later. Letters, numbers, hyphens.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Manage
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleArchiveToggle}
              disabled={busy}
            >
              {initial.archived_at ? (
                <>
                  <ArchiveRestore className="h-4 w-4 mr-1.5" />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-1.5" />
                  Archive
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete permanently
            </Button>
          </div>
        </aside>

      </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesPanel documentId={initial.id} />
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <VersionsPanel documentId={initial.id} onReverted={onSaved} />
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <AssignmentsPanel
            documentId={initial.id}
            documentStatus={status}
            documentTitle={title}
            documentBody={body}
            documentKind={kind}
          />
        </TabsContent>
      </Tabs>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        documentTitle={title}
        onPublish={handlePublish}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this document?"
        description="This permanently removes the document. There's no undo."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={!!confirmExit}
        onOpenChange={(o) => !o && setConfirmExit(null)}
        title="Discard unsaved changes?"
        description="You have unsaved edits. Leaving now will lose them."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={() => {
          const to = confirmExit;
          setConfirmExit(null);
          if (to) navigate(to);
        }}
      />
    </Layout>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  // `prose` class from tailwindcss-typography would be ideal but isn't a
  // dep here — we apply scoped element styles via the .markdown-preview
  // wrapper in print.css + tailwind base.
  const trimmed = useMemo(() => markdown.trim(), [markdown]);
  if (!trimmed) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Nothing to preview yet — start writing on the Edit tab.
      </p>
    );
  }
  return (
    <div className="markdown-preview text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

function kindLabel(kind: AdminDocumentKind) {
  return kind === "CLIENT_FACING" ? "Client-facing" : "Internal";
}

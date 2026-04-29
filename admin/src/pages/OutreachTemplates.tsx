import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { format } from "date-fns";
import { Archive, ArchiveRestore, FileText, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  archiveTemplate,
  renderTemplate,
  restoreTemplate,
  TEMPLATE_VARIABLES,
  upsertTemplate,
  useOutreachTemplates,
  type OutreachTemplate,
} from "@/hooks/useOutreachTemplates";

const SAMPLE_CONTACT = {
  email: "dr.smith@example.co.uk",
  first_name: "John",
  last_name: "Smith",
  practice_name: "Smith Dental Practice",
  phone: "01234 567890",
};

export default function OutreachTemplates() {
  const [showArchived, setShowArchived] = useState(false);
  const { templates, loading, reload } = useOutreachTemplates({ showArchived });
  const [editing, setEditing] = useState<OutreachTemplate | null | undefined>(undefined);
  // undefined = closed, null = new, OutreachTemplate = editing existing

  return (
    <Layout
      title="Templates"
      description="Reusable email templates with merge variables. Used by campaigns to personalise mass sends."
      actions={
        <>
          <Button
            size="sm"
            variant={showArchived ? "secondary" : "ghost"}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="h-4 w-4 mr-1.5" />
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          <Button size="sm" onClick={() => setEditing(null)} disabled={showArchived}>
            <Plus className="h-4 w-4 mr-1.5" />
            New template
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">
            {showArchived ? "No archived templates" : "No templates yet"}
          </p>
          <p className="text-sm mt-1">
            {showArchived
              ? "Archived templates will appear here. Restore them to use again."
              : "Create your first to start sending campaigns."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {templates.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              onEdit={() => setEditing(t)}
              onChange={reload}
            />
          ))}
        </div>
      )}

      {editing !== undefined && (
        <EditSheet
          template={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            reload();
          }}
        />
      )}
    </Layout>
  );
}

function TemplateRow({
  template,
  onEdit,
  onChange,
}: {
  template: OutreachTemplate;
  onEdit: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isArchived = !!template.archived_at;

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await restoreTemplate(template.id);
      toast.success("Template restored");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 p-4 hover:bg-accent/50 transition-colors">
      <button
        onClick={onEdit}
        disabled={isArchived}
        className="flex-1 min-w-0 text-left disabled:cursor-default"
      >
        <p className={`font-semibold truncate ${isArchived ? "text-muted-foreground" : ""}`}>{template.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{template.subject}</p>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-1 truncate italic">{template.description}</p>
        )}
      </button>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground">
          {template.last_used_at
            ? `Used ${format(new Date(template.last_used_at), "d MMM")}`
            : "Never sent"}
        </span>
        {isArchived && (
          <Button size="sm" variant="outline" onClick={handleRestore} disabled={busy}>
            <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}

function EditSheet({
  template,
  onClose,
  onSaved,
}: {
  template: OutreachTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "Hello {first_name}, a quick note about {practice_name}");
  const [bodyText, setBodyText] = useState(
    template?.body_text ??
      "Hi {first_name},\n\nI wanted to reach out about [your topic] for {practice_name}.\n\n[Your message here.]\n\nBest,\nDentaloptima"
  );
  const [description, setDescription] = useState(template?.description ?? "");
  const [busy, setBusy] = useState(false);

  const renderedSubject = renderTemplate(subject, SAMPLE_CONTACT);
  const renderedBody = renderTemplate(bodyText, SAMPLE_CONTACT);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !bodyText.trim()) return;
    setBusy(true);
    try {
      await upsertTemplate({ name, subject, body_text: bodyText, description }, template?.id);
      toast.success(template ? "Template updated" : "Template created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const [confirmArchive, setConfirmArchive] = useState(false);

  const doArchive = async () => {
    if (!template) return;
    setBusy(true);
    try {
      await archiveTemplate(template.id);
      toast.success("Template archived");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{template ? "Edit template" : "New template"}</SheetTitle>
          <SheetDescription>
            Use {`{first_name}`}, {`{practice_name}`}, etc. to personalise. The preview on the right
            shows what one example contact would receive.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 flex-1">
          {/* Editor */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Template name (internal)
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "Introduction v1"'
                disabled={busy}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Subject
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Body
              </label>
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={14}
                disabled={busy}
                className="font-mono text-xs resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Description (internal note)
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When to use this template"
                disabled={busy}
              />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-medium text-muted-foreground mb-1">Available variables</p>
              {TEMPLATE_VARIABLES.map((v) => (
                <div key={v.token} className="flex justify-between gap-3">
                  <code className="font-mono text-foreground">{v.token}</code>
                  <span className="text-muted-foreground">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              Live preview · sample contact: {SAMPLE_CONTACT.first_name} {SAMPLE_CONTACT.last_name} ({SAMPLE_CONTACT.email})
            </p>
            <div className="rounded-lg border bg-background p-4 text-sm">
              <p className="font-semibold mb-2">{renderedSubject || <span className="text-muted-foreground italic">(empty subject)</span>}</p>
              <hr className="my-2" />
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {renderedBody || <span className="text-muted-foreground italic">(empty body)</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 flex justify-between items-center mt-4">
          {template ? (
            <Button variant="ghost" onClick={() => setConfirmArchive(true)} disabled={busy}>
              <Archive className="h-4 w-4 mr-1.5" />
              Archive
            </Button>
          ) : <span />}
          <Button onClick={handleSave} disabled={busy || !name.trim() || !subject.trim() || !bodyText.trim()}>
            {busy ? "Saving..." : template ? "Save changes" : "Create template"}
          </Button>
        </div>
      </SheetContent>

      {template && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={`Archive "${template.name}"?`}
          description={`It will be hidden from the list but kept on file. You can restore it later from "Show archived".`}
          confirmLabel="Archive"
          onConfirm={doArchive}
        />
      )}
    </Sheet>
  );
}

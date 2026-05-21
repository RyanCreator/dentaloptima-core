import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MarkdownLinkButton } from "@/components/messaging/MarkdownLinkButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  FileText,
  Plus,
  Search,
  Copy,
  ArrowLeft,
  Send,
  Mail,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  archiveTemplate,
  renderTemplate,
  restoreTemplate,
  TEMPLATE_VARIABLES,
  upsertTemplate,
  useOutreachTemplates,
  useTemplate,
  useTemplateCounts,
  type OutreachTemplate,
} from "@/hooks/useOutreachTemplates";
import { sendEmail, useEmailAccounts } from "@/hooks/useEmailInbox";
import { useOutreachContacts } from "@/hooks/useOutreachContacts";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const SAMPLE_CONTACT = {
  email: "dr.smith@example.co.uk",
  first_name: "John",
  last_name: "Smith",
  practice_name: "Smith Dental Practice",
  phone: "01234 567890",
};

// The page is route-aware: same component handles list, new, and edit modes
// based on the URL. Lets us share state and avoid an extra page module.
export default function OutreachTemplates() {
  const { id } = useParams<{ id?: string }>();
  // /outreach/templates/new → create mode (no id, but in editor)
  const isNewRoute = window.location.pathname.endsWith("/templates/new");
  if (id) return <TemplateEditor mode="edit" id={id} />;
  if (isNewRoute) return <TemplateEditor mode="new" />;
  return <TemplateList />;
}

// ---- LIST VIEW -----------------------------------------------------------

type ListFilter = "active" | "archived";

function TemplateList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ListFilter>("active");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const { templates, loading, reload } = useOutreachTemplates({
    showArchived: filter === "archived",
  });
  const { counts } = useTemplateCounts();

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return templates;
    const q = debouncedSearch.trim().toLowerCase();
    return templates.filter((t) =>
      [t.name, t.subject, t.description ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [templates, debouncedSearch]);

  const handleRestore = async (id: string) => {
    try {
      await restoreTemplate(id);
      toast.success("Template restored");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    }
  };

  return (
    <Layout
      title="Templates"
      description={`${counts.active} active · ${counts.archived} archived`}
      actions={
        <>
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, subject, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button size="sm" onClick={() => navigate("/outreach/templates/new")}>
            <Plus className="h-4 w-4 mr-1.5" />
            New template
          </Button>
        </>
      }
    >
      {/* Filter pills with counts. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["active", "archived"] as ListFilter[]).map((key) => {
          const isActive = filter === key;
          const n = key === "active" ? counts.active : counts.archived;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px] capitalize",
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card hover:bg-muted/60 text-muted-foreground",
              )}
            >
              {key}
              <span
                className={cn(
                  "text-[10px] rounded px-1 tabular-nums",
                  isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
        {debouncedSearch.trim() && (
          <span className="text-xs text-muted-foreground tabular-nums ml-1">
            {filtered.length} {filtered.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">
            {filter === "archived"
              ? "No archived templates"
              : counts.active === 0
                ? "No templates yet"
                : "No matches"}
          </p>
          <p className="text-sm mt-1">
            {filter === "archived"
              ? "Archived templates will appear here. Restore them to use again."
              : counts.active === 0
                ? "Create your first to start sending campaigns."
                : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filtered.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-3 p-4 transition-colors",
                !t.archived_at && "hover:bg-accent/50 cursor-pointer",
              )}
              onClick={() => {
                if (!t.archived_at) navigate(`/outreach/templates/${t.id}`);
              }}
            >
              <div className="flex-1 min-w-0">
                <p className={cn("font-semibold truncate", t.archived_at && "text-muted-foreground")}>
                  {t.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1 truncate italic">{t.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {t.last_used_at
                    ? `Used ${format(new Date(t.last_used_at), "d MMM")}`
                    : "Never sent"}
                </span>
                {t.archived_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(t.id);
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                    Restore
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

// ---- EDITOR VIEW --------------------------------------------------------

const DEFAULT_SUBJECT = "Hello {first_name}, a quick note about {practice_name}";
const DEFAULT_BODY =
  "Hi {first_name},\n\nI wanted to reach out about [your topic] for {practice_name}.\n\n[Your message here.]\n\nBest,\nDentaloptima";

const SUBJECT_SOFT_LIMIT = 80;
const BODY_SOFT_LIMIT = 3000;

function TemplateEditor({ mode, id }: { mode: "edit" | "new"; id?: string }) {
  const navigate = useNavigate();
  const { template, loading } = useTemplate(mode === "edit" ? id : undefined);

  if (mode === "edit" && loading) {
    return (
      <Layout title="Edit template" description="Loading…">
        <p className="text-sm text-muted-foreground">Loading template…</p>
      </Layout>
    );
  }
  if (mode === "edit" && !template) {
    return (
      <Layout title="Edit template" description="Not found">
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>This template doesn't exist or has been hard-deleted.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/outreach/templates")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back to list
          </Button>
        </div>
      </Layout>
    );
  }

  return <TemplateEditorBody initial={template} mode={mode} />;
}

function TemplateEditorBody({
  initial,
  mode,
}: {
  initial: OutreachTemplate | null;
  mode: "edit" | "new";
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? DEFAULT_SUBJECT);
  const [bodyText, setBodyText] = useState(initial?.body_text ?? DEFAULT_BODY);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmExit, setConfirmExit] = useState<null | string>(null);

  // Refs + tracking for click-to-insert variables.
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  // Dirty tracking — used to confirm exit if there are unsaved edits.
  const isDirty =
    (initial?.name ?? "") !== name ||
    (initial?.subject ?? DEFAULT_SUBJECT) !== subject ||
    (initial?.body_text ?? DEFAULT_BODY) !== bodyText ||
    (initial?.description ?? "") !== description;

  // Warn before navigating away if there are unsaved changes.
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
    if (isDirty) {
      setConfirmExit(to);
    } else {
      navigate(to);
    }
  }

  function insertVariable(token: string) {
    const ref = activeField === "subject" ? subjectRef : bodyRef;
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const next = before + token + after;
    if (activeField === "subject") setSubject(next);
    else setBodyText(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  // Real-contact preview picker — pull a small sample of recent active
  // contacts so the operator can render against actual data.
  const { contacts: previewContacts } = useOutreachContacts({
    status: "ACTIVE",
    pageSize: 25,
    sortBy: "created_desc",
  });
  const [previewContactId, setPreviewContactId] = useState<string>("__sample__");
  const previewContact =
    previewContactId === "__sample__"
      ? SAMPLE_CONTACT
      : previewContacts.find((c) => c.id === previewContactId) ?? SAMPLE_CONTACT;
  const renderedSubject = renderTemplate(subject, previewContact);
  const renderedBody = renderTemplate(bodyText, previewContact);

  const isValid = name.trim() && subject.trim() && bodyText.trim();

  async function handleSave() {
    if (!isValid) return;
    setBusy(true);
    try {
      await upsertTemplate({ name, subject, body_text: bodyText, description }, initial?.id);
      toast.success(initial ? "Template updated" : "Template created");
      navigate("/outreach/templates");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAsDuplicate() {
    if (!isValid) return;
    setBusy(true);
    try {
      const created = await upsertTemplate({
        name: `${name} (copy)`,
        subject,
        body_text: bodyText,
        description,
      });
      toast.success("Saved as new template");
      navigate(`/outreach/templates/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!initial) return;
    setBusy(true);
    try {
      await archiveTemplate(initial.id);
      toast.success("Template archived");
      navigate("/outreach/templates");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout
      title={mode === "edit" ? "Edit template" : "New template"}
      description={
        initial
          ? `${initial.name}${initial.last_used_at ? ` · last used ${format(new Date(initial.last_used_at), "d MMM yyyy")}` : ""}`
          : "Two-column layout — write on the left, see the live render on the right."
      }
      actions={
        <Button variant="ghost" size="sm" onClick={() => tryNavigate("/outreach/templates")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to list
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor column */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">
              Template name <span className="text-muted-foreground font-normal text-xs">(internal)</span>
            </Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Introduction v1"'
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="t-subject">Subject</Label>
              <span className={cn(
                "text-[11px] tabular-nums",
                subject.length > SUBJECT_SOFT_LIMIT ? "text-amber-600" : "text-muted-foreground",
              )}>
                {subject.length}{subject.length > SUBJECT_SOFT_LIMIT ? ` (long)` : ""}
              </span>
            </div>
            <Input
              id="t-subject"
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setActiveField("subject")}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="t-body">Body</Label>
              <div className="flex items-center gap-2">
                <MarkdownLinkButton
                  textareaRef={bodyRef}
                  value={bodyText}
                  onChange={setBodyText}
                  disabled={busy}
                />
                <span className={cn(
                  "text-[11px] tabular-nums",
                  bodyText.length > BODY_SOFT_LIMIT ? "text-amber-600" : "text-muted-foreground",
                )}>
                  {bodyText.length} chars
                </span>
              </div>
            </div>
            <Textarea
              id="t-body"
              ref={bodyRef}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              onFocus={() => setActiveField("body")}
              rows={16}
              disabled={busy}
              className="text-sm leading-relaxed resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-desc">
              Description <span className="text-muted-foreground font-normal text-xs">(internal note)</span>
            </Label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When to use this template"
              disabled={busy}
            />
          </div>

          {/* Variables panel — click to insert at cursor of the focused field. */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Click to insert into {activeField === "subject" ? "subject" : "body"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs border bg-background hover:bg-accent transition-colors font-mono"
                  title={v.desc}
                  disabled={busy}
                >
                  {v.token}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Unknown variables are left as-is, so typos like <code className="font-mono">{`{frist_name}`}</code> are visible in the preview.
            </p>
          </div>
        </div>

        {/* Preview column */}
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Preview as</Label>
            <Select value={previewContactId} onValueChange={setPreviewContactId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sample__">Sample contact (Dr Smith)</SelectItem>
                {previewContacts.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Recent contacts</div>
                    {previewContacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}
                        {c.practice_name && ` · ${c.practice_name}`}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Live preview</p>
            <div className="rounded-lg border bg-background p-4 text-sm">
              <p className="font-semibold mb-2 break-words">
                {renderedSubject || <span className="text-muted-foreground italic">(empty subject)</span>}
              </p>
              <hr className="my-2" />
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {renderedBody || <span className="text-muted-foreground italic">(empty body)</span>}
              </p>
            </div>
          </div>

          <SendTestPanel
            disabled={!isValid || busy}
            renderedSubject={renderedSubject}
            renderedBody={renderedBody}
          />
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {initial && (
            <Button variant="ghost" onClick={() => setConfirmArchive(true)} disabled={busy}>
              <Archive className="h-4 w-4 mr-1.5" />
              Archive
            </Button>
          )}
          {initial && (
            <Button variant="outline" onClick={handleSaveAsDuplicate} disabled={busy || !isValid}>
              <Copy className="h-4 w-4 mr-1.5" />
              Save as duplicate
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          <Button onClick={handleSave} disabled={busy || !isValid || !isDirty}>
            {busy ? "Saving…" : initial ? "Save changes" : "Create template"}
          </Button>
        </div>
      </div>

      {initial && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={`Archive "${initial.name}"?`}
          description="It will be hidden from the list but kept on file. Restore later from the Archived filter."
          confirmLabel="Archive"
          onConfirm={handleArchive}
        />
      )}

      <ConfirmDialog
        open={confirmExit !== null}
        onOpenChange={(o) => !o && setConfirmExit(null)}
        title="Discard unsaved changes?"
        description="You have unsaved edits to this template. Leave anyway?"
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

// Send a one-off test email of the rendered template to a chosen address.
// Operators use this to QA a template before firing a campaign.
function SendTestPanel({
  disabled,
  renderedSubject,
  renderedBody,
}: {
  disabled: boolean;
  renderedSubject: string;
  renderedBody: string;
}) {
  const { accounts } = useEmailAccounts();
  const { session } = useAuth();
  const adminEmail = session?.user.email ?? "";

  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState(adminEmail);
  const [sending, setSending] = useState(false);

  // Default the From to the first account once accounts arrive. Same
  // useEffect-not-useMemo pattern as the Messaging page.
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  // Default the recipient to the logged-in operator's own email — that's
  // what you usually want for a test send.
  useEffect(() => {
    if (!to && adminEmail) setTo(adminEmail);
  }, [adminEmail, to]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const toValid = EMAIL_RE.test(to.trim());

  async function handleSend() {
    setSending(true);
    try {
      await sendEmail({
        account_id: accountId,
        to: [{ address: to.trim() }],
        subject: `[TEST] ${renderedSubject}`,
        body_text: renderedBody,
      });
      toast.success(`Test sent to ${to}`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || accounts.length === 0}
        className="w-full"
      >
        <Mail className="h-4 w-4 mr-1.5" />
        Send test email
      </Button>
    );
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Send test</Label>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="test-from" className="text-[11px] text-muted-foreground">From</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="test-from" className="h-8 text-xs">
            <SelectValue placeholder="Pick account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.address}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="test-to" className="text-[11px] text-muted-foreground">To</Label>
        <Input
          id="test-to"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
          aria-invalid={to.trim().length > 0 && !toValid}
          className="h-8 text-xs"
        />
      </div>
      <Button
        type="button"
        size="sm"
        onClick={handleSend}
        disabled={sending || !accountId || !toValid}
        className="w-full"
      >
        <Send className="h-3.5 w-3.5 mr-1.5" />
        {sending ? "Sending…" : "Send test"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        The subject is prefixed with <code className="font-mono">[TEST]</code> so you can tell it apart from real outbound mail.
      </p>
    </div>
  );
}

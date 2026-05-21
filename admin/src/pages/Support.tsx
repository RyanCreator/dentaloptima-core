import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTenants } from "@/hooks/useTenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  useSupportThreads,
  useSupportMessages,
  sendAdminReply,
  markInboundRead,
  startThreadFromAdmin,
  updateThreadStatus,
  uploadAdminAttachment,
  claimThread,
  unclaimThread,
  type SupportThread,
  type SupportThreadStatus,
} from "@/hooks/useSupport";
import {
  Plus,
  Inbox,
  Paperclip,
  X,
  Download,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserMinus,
  Search,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SupportThreadStatus, string> = {
  OPEN: "Open",
  AWAITING_DENTALOPTIMA: "Needs reply",
  AWAITING_TENANT: "Awaiting tenant",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const STATUS_COLOR: Record<SupportThreadStatus, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  // Amber for "needs attention" rather than red — red reads as error/broken,
  // but a waiting reply is a normal queue state, not a failure.
  AWAITING_DENTALOPTIMA: "bg-amber-100 text-amber-700",
  AWAITING_TENANT: "bg-sky-100 text-sky-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-gray-200 text-gray-600",
};

type FilterKey = "needs-reply" | "open" | "resolved" | "closed" | "all";

const FILTERS: Array<{ key: FilterKey; label: string; predicate: (s: SupportThreadStatus) => boolean }> = [
  { key: "needs-reply", label: "Needs reply", predicate: (s) => s === "AWAITING_DENTALOPTIMA" },
  { key: "open", label: "All open", predicate: (s) => s !== "RESOLVED" && s !== "CLOSED" },
  { key: "resolved", label: "Resolved", predicate: (s) => s === "RESOLVED" },
  { key: "closed", label: "Closed", predicate: (s) => s === "CLOSED" },
  { key: "all", label: "All", predicate: () => true },
];

// Tables on dentaloptima-core have practice_id with a real FK, but admin
// reads via the service-role client (no RLS for embeds), so we still build
// the practice-name lookup from useTenants() rather than a PostgREST embed.
// Same shape as the old tenant lookup.
function usePracticeNameLookup() {
  const { data: practices } = useTenants();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const p of practices ?? []) map.set(p.id, p.name);
    return map;
  }, [practices]);
}

function practiceLabel(practiceNameById: Map<string, string>, practiceId: string | null): string {
  if (!practiceId) return "(no practice)";
  return practiceNameById.get(practiceId) ?? "(unknown practice)";
}

export default function Support() {
  const { threads, loading, reload } = useSupportThreads();
  const practiceNameById = usePracticeNameLookup();
  // Store only the ID, not the object — looking up the live thread on each
  // render means realtime updates (status change, new message, etc.) flow
  // through to the open sheet automatically.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("needs-reply");
  const [search, setSearch] = useState("");
  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) ?? null : null;

  const counts = useMemo(() => {
    const acc = { all: threads.length, "needs-reply": 0, open: 0, resolved: 0, closed: 0 };
    for (const t of threads) {
      if (t.status === "AWAITING_DENTALOPTIMA") acc["needs-reply"]++;
      if (t.status !== "RESOLVED" && t.status !== "CLOSED") acc.open++;
      if (t.status === "RESOLVED") acc.resolved++;
      if (t.status === "CLOSED") acc.closed++;
    }
    return acc;
  }, [threads]);

  const filteredThreads = useMemo(() => {
    const filterDef = FILTERS.find((f) => f.key === filter)!;
    return threads.filter((t) => {
      if (!filterDef.predicate(t.status)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [t.subject, practiceLabel(practiceNameById, t.practice_id)]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [threads, filter, search, practiceNameById]);

  return (
    <Layout
      title="Support inbox"
      description={
        loading
          ? "Two-way messaging with every tenant practice."
          : `${counts["needs-reply"]} need reply · ${counts.open} open · ${counts.all} total`
      }
      actions={
        <>
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subject or tenant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setNewOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New thread
          </Button>
        </>
      }
    >
      {/* Pill filters with counts — same pattern as Leads. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const n = counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]",
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card hover:bg-muted/60 text-muted-foreground",
              )}
            >
              {f.label}
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
        {(filter !== "all" || search.trim()) && (
          <span className="text-xs text-muted-foreground tabular-nums ml-1">
            {filteredThreads.length} {filteredThreads.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filteredThreads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">Nothing here</p>
          <p className="text-sm mt-1">No support threads match this filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filteredThreads.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveThreadId(t.id)}
              className={cn(
                "w-full flex items-start gap-3 p-4 text-left hover:bg-accent/50 transition-colors",
                // Amber left-border accent makes the queue scannable in a glance.
                t.status === "AWAITING_DENTALOPTIMA" && "border-l-4 border-l-amber-400 pl-3",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate">{t.subject}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                  {t.unread_count && t.unread_count > 0 ? (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                      {t.unread_count}
                    </span>
                  ) : null}
                  {t.claimed_by_email && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                      <UserCheck className="h-2.5 w-2.5" />
                      {t.claimed_by_email.split("@")[0]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {practiceLabel(practiceNameById, t.practice_id)} · {format(new Date(t.last_message_at), "d MMM HH:mm")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <ThreadSheet
        thread={activeThread}
        tenantName={activeThread ? practiceLabel(practiceNameById, activeThread.practice_id) : ""}
        onClose={() => setActiveThreadId(null)}
        onMutated={reload}
      />
      <NewThreadSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => setNewOpen(false)}
      />
    </Layout>
  );
}

function ThreadSheet({
  thread,
  tenantName,
  onClose,
  onMutated,
}: {
  thread: SupportThread | null;
  tenantName: string;
  onClose: () => void;
  // Called after any mutation that changes the thread row (claim, status,
  // etc.) so the parent list refetches and the just-mutated row's badge
  // updates immediately, even if the realtime channel hasn't fired yet.
  onMutated: () => void;
}) {
  const open = thread !== null;
  const { messages, loading } = useSupportMessages(thread?.id ?? null);
  const { session } = useAuth();
  const adminEmail = session?.user.email ?? "support@dentaloptima.co.uk";
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<null | "RESOLVED" | "CLOSED">(null);

  // Live message indicator — when a new INBOUND message arrives while the
  // thread is open, the user has already seen it (we mark read on focus).
  // We surface incoming-while-typing arrivals with a small toast instead of
  // forcing a refresh.
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  useEffect(() => {
    if (!thread) {
      setLastMessageId(null);
      return;
    }
    const latest = messages[messages.length - 1];
    if (!latest) return;
    if (lastMessageId && latest.id !== lastMessageId && latest.direction === "INBOUND") {
      toast.info("New reply arrived");
    }
    setLastMessageId(latest.id);
    // Also mark inbound read whenever the message list grows.
    markInboundRead(thread.id).catch(() => {/* non-fatal */});
  }, [messages, thread]);

  useEffect(() => {
    if (thread) {
      markInboundRead(thread.id).catch(() => {/* non-fatal */});
    }
  }, [thread?.id]);

  const handleSend = async () => {
    if (!thread || (!reply.trim() && pendingFiles.length === 0)) return;
    setSending(true);
    try {
      let attachmentIds: string[] = [];
      if (pendingFiles.length > 0) {
        setUploading(true);
        attachmentIds = await Promise.all(
          pendingFiles.map((f) => uploadAdminAttachment(thread.id, f))
        );
        setUploading(false);
      }
      await sendAdminReply(thread.id, reply.trim() || "(attachment)", adminEmail, attachmentIds);
      setReply("");
      setPendingFiles([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  async function applyStatus(status: "RESOLVED" | "CLOSED") {
    if (!thread) return;
    try {
      await updateThreadStatus(thread.id, status);
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
      onMutated();
      setConfirmStatus(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleClaim() {
    if (!thread) return;
    try {
      if (thread.claimed_by_email) {
        await unclaimThread(thread.id);
        toast.success("Released claim");
      } else {
        await claimThread(thread.id, adminEmail);
        toast.success("Thread claimed");
      }
      onMutated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const claimedByMe = thread?.claimed_by_email === adminEmail;
  const claimedByOther = !!thread?.claimed_by_email && !claimedByMe;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle className="text-left">{thread?.subject ?? ""}</SheetTitle>
            {thread && (
              <p className="text-xs text-muted-foreground text-left">{tenantName}</p>
            )}
          </SheetHeader>

          {claimedByOther && (
            <div className="mt-2 rounded-md border border-purple-300/60 bg-purple-50/60 dark:bg-purple-950/20 p-2 text-xs text-purple-900 dark:text-purple-100 flex items-center gap-2">
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span>Currently claimed by <strong>{thread?.claimed_by_email}</strong>. Coordinate before replying.</span>
            </div>
          )}

          <div className="flex gap-2 pt-3 pb-2 border-b flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setConfirmStatus("RESOLVED")}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Mark resolved
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmStatus("CLOSED")}>
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Close
            </Button>
            <Button size="sm" variant={claimedByMe ? "secondary" : "ghost"} onClick={handleClaim} className="ml-auto">
              {thread?.claimed_by_email ? (
                <><UserMinus className="h-3.5 w-3.5 mr-1.5" />{claimedByMe ? "Release" : "Take over"}</>
              ) : (
                <><UserCheck className="h-3.5 w-3.5 mr-1.5" />Claim</>
              )}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 py-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
            ) : (
              messages.map((m) => {
                const fromTenant = m.direction === "INBOUND";
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 max-w-[85%] ${
                      fromTenant ? "mr-auto bg-muted" : "ml-auto bg-primary text-primary-foreground"
                    }`}
                  >
                    <p className="text-xs opacity-80 mb-1">
                      {fromTenant ? (m.author_name || m.author_email) : `Support · ${m.author_email}`} · {format(new Date(m.created_at), "d MMM HH:mm")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.attachments.map((a) => (
                          <a
                            key={a.id}
                            href={a.download_url ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                              fromTenant ? "bg-background hover:bg-accent" : "bg-white/15 hover:bg-white/25"
                            } transition-colors`}
                          >
                            <Download className="h-3 w-3" />
                            <span className="truncate">{a.file_name}</span>
                            <span className="opacity-60 ml-auto shrink-0">
                              {(a.file_size_bytes / 1024).toFixed(0)}KB
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t pt-3 space-y-2">
            {pendingFiles.length > 0 && (
              <div className="space-y-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted px-2 py-1 rounded">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="opacity-60">{(f.size / 1024).toFixed(0)}KB</span>
                    <button
                      onClick={() => removePendingFile(i)}
                      className="opacity-60 hover:opacity-100"
                      aria-label="Remove file"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply…"
              rows={3}
              disabled={sending}
            />
            <div className="flex gap-2">
              <label className="flex items-center justify-center px-3 rounded-md border border-input bg-background hover:bg-accent cursor-pointer transition-colors">
                <Paperclip className="h-4 w-4" />
                <input
                  type="file"
                  className="hidden"
                  multiple
                  disabled={sending || uploading}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setPendingFiles((prev) => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                onClick={handleSend}
                disabled={sending || uploading || (!reply.trim() && pendingFiles.length === 0)}
                className="flex-1"
              >
                {uploading ? "Uploading…" : sending ? "Sending…" : "Send reply"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmStatus !== null}
        onOpenChange={(o) => !o && setConfirmStatus(null)}
        title={confirmStatus === "RESOLVED" ? "Mark resolved?" : "Close thread?"}
        description={
          confirmStatus === "RESOLVED"
            ? "Marks the issue as resolved. The tenant can reopen by replying."
            : "Closes the thread for both sides. Use for spam or finished conversations."
        }
        confirmLabel={confirmStatus === "RESOLVED" ? "Mark resolved" : "Close"}
        onConfirm={() => confirmStatus && applyStatus(confirmStatus)}
      />
    </>
  );
}

// Tenant picker with inline filter — when there are 50+ practices the
// vanilla Select dropdown is unusable. Type-to-filter narrows it instantly.
function TenantPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { data: practices } = useTenants();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const list = practices ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [practices, query]);
  const selected = practices?.find((p) => p.id === value);

  return (
    <div className="rounded-md border bg-background">
      <div className="relative border-b">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={selected ? selected.name : "Search practices…"}
          className="pl-9 border-0 focus-visible:ring-0 rounded-none"
          disabled={disabled}
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">No matches.</div>
        ) : (
          filtered.map((p) => {
            const isSelected = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                disabled={disabled}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2",
                  isSelected && "bg-accent/60",
                )}
              >
                <span className="truncate">{p.name}</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function NewThreadSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const adminEmail = session?.user.email ?? "support@dentaloptima.co.uk";
  const [tenantId, setTenantId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset on open so old form values don't leak between create attempts.
  useEffect(() => {
    if (open) {
      setTenantId("");
      setSubject("");
      setBody("");
    }
  }, [open]);

  const handleCreate = async () => {
    if (!tenantId || !subject.trim() || !body.trim()) return;
    setCreating(true);
    try {
      await startThreadFromAdmin(tenantId, subject.trim(), body.trim(), adminEmail);
      onCreated();
      toast.success("Message sent to tenant");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Message a tenant</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <label className="text-sm font-medium block mb-1">Tenant</label>
            <TenantPicker value={tenantId} onChange={setTenantId} disabled={creating} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={creating} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Message</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} disabled={creating} />
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating || !tenantId || !subject.trim() || !body.trim()}
            className="w-full"
          >
            {creating ? "Sending…" : "Send message"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

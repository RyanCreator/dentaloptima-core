import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  type SupportThread,
  type SupportThreadStatus,
} from "@/hooks/useSupport";
import { supabaseOps as supabase } from "@/integrations/supabase/client";
import { Plus, Inbox, Paperclip, X, Download } from "lucide-react";

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

export default function Support() {
  const { threads, loading } = useSupportThreads();
  // Store only the ID, not the object — looking up the live thread on each
  // render means realtime updates (status change, new message, etc.) flow
  // through to the open sheet automatically.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "needs-reply" | "open" | "resolved" | "closed">("needs-reply");
  const [search, setSearch] = useState("");
  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) ?? null : null;

  const filteredThreads = threads.filter((t) => {
    // Status filter
    if (filter === "needs-reply" && t.status !== "AWAITING_DENTALOPTIMA") return false;
    if (filter === "open" && (t.status === "RESOLVED" || t.status === "CLOSED")) return false;
    if (filter === "resolved" && t.status !== "RESOLVED") return false;
    if (filter === "closed" && t.status !== "CLOSED") return false;
    // Search filter — subject + tenant practice_name + hostname (case-insensitive)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        t.subject,
        t.tenant?.practice_name ?? "",
        t.tenant?.hostname ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <Layout
      title="Support inbox"
      description="Two-way messaging with every tenant practice."
      actions={
        <>
          <Input
            placeholder="Search subject or tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[220px]"
          />
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="needs-reply">Needs reply</SelectItem>
              <SelectItem value="open">All open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All threads</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setNewOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New thread
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
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
              className="w-full flex items-start gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
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
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.tenant?.practice_name ?? "(unknown tenant)"} · {t.tenant?.hostname ?? ""} · {format(new Date(t.last_message_at), "d MMM HH:mm")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <ThreadSheet thread={activeThread} onClose={() => setActiveThreadId(null)} />
      <NewThreadSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => setNewOpen(false)}
      />
    </Layout>
  );
}

function ThreadSheet({ thread, onClose }: { thread: SupportThread | null; onClose: () => void }) {
  const open = thread !== null;
  const { messages, loading } = useSupportMessages(thread?.id ?? null);
  const { session } = useAuth();
  const adminEmail = session?.user.email ?? "support@dentaloptima.co.uk";
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (thread) {
      markInboundRead(thread.id).catch(() => {/* non-fatal */});
    }
  }, [thread]);

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

  const handleStatus = async (status: SupportThreadStatus) => {
    if (!thread) return;
    try {
      await updateThreadStatus(thread.id, status);
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">{thread?.subject ?? ""}</SheetTitle>
          {thread?.tenant && (
            <p className="text-xs text-muted-foreground text-left">
              {thread.tenant.practice_name} · {thread.tenant.hostname}
            </p>
          )}
        </SheetHeader>

        <div className="flex gap-2 pt-3 pb-2 border-b">
          <Button size="sm" variant="outline" onClick={() => handleStatus("RESOLVED")}>
            Mark resolved
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleStatus("CLOSED")}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
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
            placeholder="Type a reply..."
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
              {uploading ? "Uploading..." : sending ? "Sending..." : "Send reply"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
  const [tenants, setTenants] = useState<Array<{ id: string; practice_name: string; hostname: string }>>([]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("tenant")
      .select("id, practice_name, hostname")
      .eq("active", true)
      .is("deleted_at", null)
      .order("practice_name")
      .then(({ data }) => setTenants(data || []));
  }, [open]);

  const handleCreate = async () => {
    if (!tenantId || !subject.trim() || !body.trim()) return;
    setCreating(true);
    try {
      await startThreadFromAdmin(tenantId, subject.trim(), body.trim(), adminEmail);
      setTenantId("");
      setSubject("");
      setBody("");
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
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Message a tenant</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <label className="text-sm font-medium block mb-1">Tenant</label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.practice_name} ({t.hostname})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {creating ? "Sending..." : "Send message"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

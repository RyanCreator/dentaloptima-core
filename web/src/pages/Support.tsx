import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  useSupportThreads,
  useSupportMessages,
  createSupportThread,
  sendSupportMessage,
  markThreadRead,
  uploadAttachment,
  type SupportThread,
} from "@/hooks/useSupport";
import { Plus, Mail, Paperclip, X, Download } from "lucide-react";

const STATUS_LABEL: Record<SupportThread["status"], string> = {
  OPEN: "Open",
  AWAITING_DENTALOPTIMA: "Awaiting reply",
  AWAITING_TENANT: "Reply received",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export default function Support() {
  const { loading: authLoading } = useRequireAuth();
  const { threads, loading, reload } = useSupportThreads();
  const [activeThread, setActiveThread] = useState<SupportThread | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  if (authLoading) return <LoadingState />;

  return (
    <Layout title="Support">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Send a message to the Dentaloptima support team. We respond inside the app, no email required.
          </p>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New message
          </Button>
        </div>

        {loading ? (
          <LoadingState />
        ) : threads.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-3 opacity-60" />
            <p className="font-medium">No support conversations yet</p>
            <p className="text-sm mt-1">Click "New message" to start one.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThread(t)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{t.subject}</p>
                    {t.unread_count && t.unread_count > 0 ? (
                      <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                        {t.unread_count}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {STATUS_LABEL[t.status]} · last activity {format(new Date(t.last_message_at), "d MMM HH:mm")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ThreadSheet
        thread={activeThread}
        onClose={() => {
          setActiveThread(null);
          reload();
        }}
      />

      <NewThreadSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          reload();
        }}
      />
    </Layout>
  );
}

function ThreadSheet({ thread, onClose }: { thread: SupportThread | null; onClose: () => void }) {
  const open = thread !== null;
  const { messages, loading, reload } = useSupportMessages(thread?.id ?? null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // Mark as read when opening
  useEffect(() => {
    if (thread) {
      markThreadRead(thread.id).catch(() => {/* non-fatal */});
    }
  }, [thread]);

  const handleSend = async () => {
    if (!thread || (!reply.trim() && pendingFiles.length === 0)) return;
    setSending(true);
    try {
      let attachmentIds: string[] | undefined;
      if (pendingFiles.length > 0) {
        setUploading(true);
        attachmentIds = await Promise.all(
          pendingFiles.map((f) => uploadAttachment(thread.id, f))
        );
        setUploading(false);
      }
      await sendSupportMessage(thread.id, reply.trim() || "(attachment)", attachmentIds);
      setReply("");
      setPendingFiles([]);
      await reload();
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

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">{thread?.subject ?? ""}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {loading ? (
            <LoadingState />
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
          ) : (
            messages.map((m) => {
              const fromTenant = m.direction === "INBOUND";
              return (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 max-w-[85%] ${
                    fromTenant
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-muted"
                  }`}
                >
                  <p className="text-xs opacity-80 mb-1">
                    {fromTenant ? (m.author_name || m.author_email) : "Dentaloptima Support"} · {format(new Date(m.created_at), "d MMM HH:mm")}
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
                            fromTenant ? "bg-white/15 hover:bg-white/25" : "bg-background hover:bg-accent"
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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!subject.trim() || !body.trim()) return;
    setCreating(true);
    try {
      await createSupportThread(subject.trim(), body.trim());
      setSubject("");
      setBody("");
      onCreated();
      toast.success("Message sent to Dentaloptima support");
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
          <SheetTitle>New support message</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <label className="text-sm font-medium block mb-1">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this about?"
              disabled={creating}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Message</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what's happening..."
              rows={8}
              disabled={creating}
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating || !subject.trim() || !body.trim()}
            className="w-full"
          >
            {creating ? "Sending..." : "Send message"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

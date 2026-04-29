import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Mail, Download, Archive, CheckCircle2, Inbox, Plus, Send } from "lucide-react";
import {
  accountColorClasses,
  sendEmail,
  updateEmailThreadStatus,
  useEmailAccountCounts,
  useEmailAccounts,
  useEmailFilters,
  useEmailMessages,
  useEmailThreads,
  type EmailAccount,
  type EmailMessage,
  type EmailThread,
  type EmailThreadStatus,
} from "@/hooks/useEmailInbox";

const STATUS_LABEL: Record<EmailThreadStatus | "ALL", string> = {
  ALL: "All threads",
  OPEN: "Open",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
  SPAM: "Spam",
};

export default function Messaging() {
  const { accounts, loading: accountsLoading } = useEmailAccounts();
  const counts = useEmailAccountCounts();
  const { accountId, setAccountId, status, setStatus, accountById } = useEmailFilters(accounts);
  const { threads, loading: threadsLoading } = useEmailThreads(accountId, status);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredThreads = threads.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const haystack = [t.subject, t.preview?.counterparty_address ?? "", t.preview?.snippet ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const activeThread = filteredThreads.find((t) => t.id === activeThreadId) ?? null;
  const totalOpen = Object.values(counts).reduce((s, n) => s + n, 0);
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <Layout
      title="Email inbox"
      description="Shared inbox for contact@, wayne@, and ryan@ — incoming mail synced from Postmark."
      actions={
        <>
          <Input
            placeholder="Search subject, sender, content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px]"
          />
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as EmailThreadStatus | "ALL")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="ALL">All threads</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
              <SelectItem value="SPAM">Spam</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setComposeOpen(true)} disabled={accounts.length === 0}>
            <Plus className="h-4 w-4 mr-1.5" />
            New email
          </Button>
        </>
      }
    >
      {/* Account tabs row */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setAccountId(null)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border transition-colors ${
            accountId === null
              ? "bg-foreground text-background border-foreground"
              : "bg-card hover:bg-accent border-input"
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          All inboxes
          {totalOpen > 0 && (
            <span className="ml-1 text-xs opacity-70">{totalOpen}</span>
          )}
        </button>
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setAccountId(a.id)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border transition-colors ${
              accountId === a.id
                ? `${accountColorClasses(a.color)} border-2`
                : "bg-card hover:bg-accent border-input"
            }`}
            title={a.address}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor(a.color)}`} />
            {a.address.split("@")[0]}
            {counts[a.id] > 0 && (
              <span className="ml-1 text-xs opacity-70">{counts[a.id]}</span>
            )}
          </button>
        ))}
      </div>

      {accountsLoading || threadsLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filteredThreads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Mail className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">Nothing here</p>
          <p className="text-sm mt-1">
            {search.trim()
              ? "No threads match this search."
              : status === "OPEN"
              ? "No open threads. Mail forwarded from SiteGround will appear here."
              : `No ${STATUS_LABEL[status].toLowerCase()} threads.`}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filteredThreads.map((t) => {
            const acct = t.account ?? accountById.get(t.account_id);
            return (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
              >
                {acct && (
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColor(acct.color)}`}
                    title={acct.address}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{t.subject}</p>
                    {t.status !== "OPEN" && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground shrink-0">
                        {t.status.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {t.preview ? (
                      <>
                        {/* For outbound-last threads, show ↗ + which sender of
                            ours last replied. Lets you spot continuity issues
                            at a glance ("oh, Wayne replied last, I shouldn't
                            jump in as Ryan"). */}
                        {t.preview.last_direction === "OUTBOUND" && (
                          <span className="text-foreground/50 mr-1" title="You sent the last reply">
                            ↗ {extractLocalPart(t.preview.last_from_address) ?? "you"} ·
                          </span>
                        )}
                        <span className="font-medium text-foreground/80">
                          {t.preview.counterparty_name || t.preview.counterparty_address}
                        </span>
                        {t.preview.snippet && <> · {t.preview.snippet}</>}
                      </>
                    ) : (
                      "(no preview)"
                    )}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(t.last_message_at), "d MMM HH:mm")}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ThreadSheet
        thread={activeThread}
        accounts={accounts}
        onClose={() => setActiveThreadId(null)}
      />
      <ComposeSheet
        open={composeOpen}
        accounts={accounts}
        onClose={() => setComposeOpen(false)}
      />
    </Layout>
  );
}

function ThreadSheet({
  thread,
  accounts,
  onClose,
}: {
  thread: EmailThread | null;
  accounts: EmailAccount[];
  onClose: () => void;
}) {
  const open = thread !== null;
  const { messages, loading, reload } = useEmailMessages(thread?.id ?? null);

  // Default reply uses whoever last replied to the thread. This keeps the
  // sender consistent for the recipient (no jarring swap from wayne→ryan
  // mid-conversation). If no one has replied yet, fall back to the inbox
  // the thread is on.
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // Resolve the last outbound's sender → account_id, so we can default the
  // reply From to the same person.
  const lastOutboundAccountId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.direction !== "OUTBOUND") continue;
      const match = accounts.find(
        (a) => a.address.toLowerCase() === m.from_address.toLowerCase()
      );
      if (match) return match.id;
    }
    return null;
  }, [messages, accounts]);

  // Sync fromAccountId when thread or last-outbound changes.
  useMemo(() => {
    if (!thread) return;
    setFromAccountId(lastOutboundAccountId ?? thread.account_id);
  }, [thread, lastOutboundAccountId]);

  // The "to" for a reply is the original sender of the most recent inbound
  // message (or, if all messages are outbound, the first To address from our
  // most recent send). Falls back to empty.
  const replyTo = useMemo(() => {
    if (messages.length === 0) return "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.direction === "INBOUND") return m.from_address;
    }
    const lastOutbound = messages[messages.length - 1];
    return lastOutbound.to_addresses[0]?.address ?? "";
  }, [messages]);

  const handleStatus = async (status: EmailThreadStatus) => {
    if (!thread) return;
    try {
      await updateEmailThreadStatus(thread.id, status);
      toast.success(`Marked ${status.toLowerCase()}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleSendReply = async () => {
    if (!thread || !replyTo || !replyText.trim() || !fromAccountId) return;
    setSending(true);
    try {
      await sendEmail({
        thread_id: thread.id,
        account_id: fromAccountId,
        to: [{ address: replyTo }],
        subject: thread.subject,
        body_text: replyText.trim(),
      });
      setReplyText("");
      reload();
      toast.success("Reply sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  // The "expected" sender is whoever last replied (or the inbox owner if
  // nobody has yet). Warn if the user is about to switch from that.
  const expectedAccountId = lastOutboundAccountId ?? thread?.account_id ?? null;
  const expectedAccount = accounts.find((a) => a.id === expectedAccountId) ?? null;
  const senderSwitched = !!(expectedAccountId && fromAccountId && fromAccountId !== expectedAccountId);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); setReplyText(""); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left pr-6">{thread?.subject ?? ""}</SheetTitle>
          <SheetDescription className="text-left">
            {thread?.account?.address ?? ""}
            {thread && thread.message_count > 0 && ` · ${thread.message_count} message${thread.message_count > 1 ? "s" : ""}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-2 pt-3 pb-3 border-b">
          <Button size="sm" variant="outline" onClick={() => handleStatus("CLOSED")}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Close
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleStatus("ARCHIVED")}>
            <Archive className="h-4 w-4 mr-1.5" />
            Archive
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet.
            </p>
          ) : (
            messages.map((m) => <MessageCard key={m.id} message={m} />)
          )}
        </div>

        {/* Reply composer — pinned to the bottom of the sheet */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">From</span>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[180px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-[260px]">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">to</span>
            <span className="font-medium truncate" title={replyTo}>{replyTo || "(unknown)"}</span>
          </div>
          {senderSwitched && expectedAccount && (
            <p className="text-[11px] text-amber-600">
              {lastOutboundAccountId
                ? `Heads up — the last reply went out from ${expectedAccount.address}. Switching senders mid-conversation can confuse the recipient.`
                : `Heads up — this thread is in the ${expectedAccount.address} inbox. The recipient is expecting a reply from there.`}
            </p>
          )}
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type a reply..."
            rows={4}
            disabled={sending}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSendReply}
              disabled={sending || !replyText.trim() || !replyTo || !fromAccountId}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {sending ? "Sending..." : "Send reply"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ComposeSheet({
  open,
  accounts,
  onClose,
}: {
  open: boolean;
  accounts: EmailAccount[];
  onClose: () => void;
}) {
  // Default to the first account so the dropdown is never empty.
  const [fromAccountId, setFromAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  // Keep the From in sync if the accounts list arrives after first render.
  useMemo(() => {
    if (!fromAccountId && accounts[0]) setFromAccountId(accounts[0].id);
  }, [accounts, fromAccountId]);

  const reset = () => {
    setTo("");
    setCc("");
    setSubject("");
    setBodyText("");
  };

  const handleSend = async () => {
    if (!fromAccountId || !to.trim() || !subject.trim() || !bodyText.trim()) return;
    setSending(true);
    try {
      await sendEmail({
        account_id: fromAccountId,
        to: parseRecipientList(to),
        cc: cc.trim() ? parseRecipientList(cc) : undefined,
        subject: subject.trim(),
        body_text: bodyText.trim(),
      });
      toast.success("Email sent");
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>New email</SheetTitle>
          <SheetDescription>Compose a new conversation. Replies will land back in this inbox.</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 mt-4 flex-1 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">From</label>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent className="min-w-[260px]">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">To</label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com, another@example.com"
              disabled={sending}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Cc (optional)</label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              disabled={sending}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              disabled={sending}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Message</label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Write your message..."
              rows={12}
              disabled={sending}
              className="resize-none"
            />
          </div>
        </div>

        <div className="border-t pt-3 flex justify-end">
          <Button
            onClick={handleSend}
            disabled={sending || !fromAccountId || !to.trim() || !subject.trim() || !bodyText.trim()}
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Sending..." : "Send email"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Parse a comma-separated address list typed by the user into the shape
// the edge function expects. Strips whitespace, drops empties; the function
// itself does the validation/normalisation.
function parseRecipientList(input: string): { address: string }[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ address }));
}

function MessageCard({ message }: { message: EmailMessage }) {
  const isOutbound = message.direction === "OUTBOUND";
  const ts = message.received_at || message.sent_at || message.created_at;
  // Render-ready body — stripped reply if available (drops quoted history),
  // otherwise plain text. Both inbound from Postmark + our own outbound rows
  // populate body_text, so this is the universal path.
  const body = message.stripped_text || message.body_text || "(no body)";

  return (
    <div
      className={`rounded-lg p-3 ${
        isOutbound ? "ml-6 bg-primary/5 border border-primary/20" : "mr-6 bg-muted/50 border"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          {/* For inbound: show the counterparty (from_name/from_address).
              For outbound: show the actual address that replied so the reader
              can see *who* on our side sent it (wayne / ryan / contact). The
              "You" tag prefixes the address to keep it visually clear that
              it's our side. */}
          <p className="text-xs font-semibold truncate" title={message.from_address}>
            {isOutbound ? (
              <>
                <span className="text-foreground/60 font-medium mr-1">You ·</span>
                {message.from_address}
              </>
            ) : (
              message.from_name || message.from_address
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {format(new Date(ts), "d MMM yyyy HH:mm")}
        </p>
      </div>

      <p className="text-sm whitespace-pre-wrap break-words">{body}</p>

      {message.attachments && message.attachments.filter((a) => !a.is_inline).length > 0 && (
        <div className="mt-3 pt-2 border-t space-y-1">
          {message.attachments
            .filter((a) => !a.is_inline)
            .map((a) => (
              <a
                key={a.id}
                href={a.download_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-background border hover:bg-accent transition-colors"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate flex-1">{a.file_name}</span>
                <span className="opacity-60 shrink-0">
                  {(a.file_size_bytes / 1024).toFixed(0)}KB
                </span>
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

// Pull "wayne" out of "wayne@dentaloptima.co.uk" for compact display in
// dense list views. Returns null if input doesn't look like an email.
function extractLocalPart(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const at = addr.indexOf("@");
  return at > 0 ? addr.slice(0, at) : addr;
}

function dotColor(color: string): string {
  switch (color) {
    case "blue":
      return "bg-blue-500";
    case "amber":
      return "bg-amber-500";
    case "emerald":
      return "bg-emerald-500";
    case "violet":
      return "bg-violet-500";
    default:
      return "bg-slate-400";
  }
}

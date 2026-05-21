import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownLinkButton } from "@/components/messaging/MarkdownLinkButton";
import { TemplatePickerButton } from "@/components/messaging/TemplatePickerButton";
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
import {
  Mail,
  Download,
  Archive,
  CheckCircle2,
  Inbox,
  Plus,
  Send,
  ShieldAlert,
  UserCheck,
  UserMinus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  accountColorClasses,
  sendEmail,
  updateEmailThreadStatus,
  claimEmailThread,
  unclaimEmailThread,
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
import { cn } from "@/lib/utils";

type FilterKey = "needs-reply" | "open" | "all" | "closed" | "archived" | "spam";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "needs-reply", label: "Needs reply" },
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
  { key: "spam", label: "Spam" },
];

// Maps a filter pill back to the underlying status filter we send to the
// query. "Needs reply" is OPEN + filtered client-side to inbound-last.
function statusFromFilter(f: FilterKey): EmailThreadStatus | "ALL" {
  if (f === "all" || f === "needs-reply" || f === "open") return f === "all" ? "ALL" : "OPEN";
  return f.toUpperCase() as EmailThreadStatus;
}

export default function Messaging() {
  const { accounts, loading: accountsLoading } = useEmailAccounts();
  const accountTabCounts = useEmailAccountCounts();
  const { accountId, setAccountId, accountById } = useEmailFilters(accounts);
  const [filter, setFilter] = useState<FilterKey>("needs-reply");
  const queryStatus = statusFromFilter(filter);
  const { threads, loading: threadsLoading, reload } = useEmailThreads(accountId, queryStatus);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  // Counts strip — pulled from the currently-loaded threads. "needs-reply"
  // is the subset of OPEN where the last message was inbound.
  const counts = useMemo(() => {
    const acc = { all: threads.length, open: 0, "needs-reply": 0, closed: 0, archived: 0, spam: 0 };
    for (const t of threads) {
      if (t.status === "OPEN") acc.open++;
      if (t.status === "OPEN" && t.preview?.last_direction === "INBOUND") acc["needs-reply"]++;
      if (t.status === "CLOSED") acc.closed++;
      if (t.status === "ARCHIVED") acc.archived++;
      if (t.status === "SPAM") acc.spam++;
    }
    return acc;
  }, [threads]);

  // Apply the in-memory side of the filter (search + needs-reply narrow).
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      if (filter === "needs-reply" && t.preview?.last_direction !== "INBOUND") return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [
          t.subject,
          t.preview?.counterparty_address ?? "",
          t.preview?.snippet ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [threads, filter, search]);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  return (
    <Layout
      title="Email inbox"
      description={
        threadsLoading
          ? "Shared inbox for contact@, wayne@, and ryan@ — incoming mail synced from Postmark."
          : `${counts["needs-reply"]} need reply · ${counts.open} open · ${counts.all} loaded`
      }
      actions={
        <>
          <Input
            placeholder="Search subject, sender, content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-[260px]"
          />
          <Button size="sm" onClick={() => setComposeOpen(true)} disabled={accounts.length === 0}>
            <Plus className="h-4 w-4 mr-1.5" />
            New email
          </Button>
        </>
      }
    >
      {/* Account tabs row — scroll horizontally on small screens instead of
          wrapping across multiple lines. */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        <button
          onClick={() => setAccountId(null)}
          className={cn(
            "shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors min-h-[36px]",
            accountId === null
              ? "bg-foreground text-background border-foreground"
              : "bg-card hover:bg-accent border-input",
          )}
        >
          <Inbox className="h-3.5 w-3.5" />
          All inboxes
          {accountTabCounts && Object.values(accountTabCounts).reduce((s, n) => s + n, 0) > 0 && (
            <span className="ml-1 text-xs opacity-70">
              {Object.values(accountTabCounts).reduce((s, n) => s + n, 0)}
            </span>
          )}
        </button>
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setAccountId(a.id)}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors min-h-[36px]",
              accountId === a.id ? `${accountColorClasses(a.color)} border-2` : "bg-card hover:bg-accent border-input",
            )}
            title={a.address}
          >
            <span className={cn("h-2 w-2 rounded-full", dotColor(a.color))} />
            {a.address.split("@")[0]}
            {accountTabCounts[a.id] > 0 && (
              <span className="ml-1 text-xs opacity-70">{accountTabCounts[a.id]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Pill filters — same pattern as Support / Announcements / Leads. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
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

      {accountsLoading || threadsLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filteredThreads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Mail className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">Nothing here</p>
          <p className="text-sm mt-1">
            {search.trim()
              ? "No threads match this search."
              : filter === "needs-reply"
              ? "No threads waiting on you."
              : `No ${filter} threads.`}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filteredThreads.map((t) => {
            const acct = t.account ?? accountById.get(t.account_id);
            const needsReply = t.status === "OPEN" && t.preview?.last_direction === "INBOUND";
            return (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={cn(
                  "w-full flex items-start gap-3 p-4 text-left hover:bg-accent/50 transition-colors",
                  // Amber left-border accent when an inbound is waiting on you,
                  // mirrors the Support inbox pattern for queue scannability.
                  needsReply && "border-l-4 border-l-amber-400 pl-3",
                )}
              >
                {acct && (
                  <span
                    className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", dotColor(acct.color))}
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
                    {t.claimed_by_email && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium shrink-0">
                        <UserCheck className="h-2.5 w-2.5" />
                        {t.claimed_by_email.split("@")[0]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {t.preview ? (
                      <>
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
        onMutated={reload}
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
  onMutated,
}: {
  thread: EmailThread | null;
  accounts: EmailAccount[];
  onClose: () => void;
  onMutated: () => void;
}) {
  const open = thread !== null;
  const { messages, loading, reload } = useEmailMessages(thread?.id ?? null);
  const { session } = useAuth();
  const adminEmail = session?.user.email ?? "";

  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Resolve the last outbound's sender → account_id, so we can default the
  // reply From to the same person.
  const lastOutboundAccountId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.direction !== "OUTBOUND") continue;
      const match = accounts.find(
        (a) => a.address.toLowerCase() === m.from_address.toLowerCase(),
      );
      if (match) return match.id;
    }
    return null;
  }, [messages, accounts]);

  // Sync default fromAccountId when thread or last-outbound changes. Use
  // useEffect — setState during render (the old useMemo) is an anti-pattern.
  useEffect(() => {
    if (!thread) return;
    setFromAccountId(lastOutboundAccountId ?? thread.account_id);
  }, [thread?.id, lastOutboundAccountId]);

  // Live "new reply arrived" toast — when a new INBOUND message lands while
  // this sheet is open, surface it without forcing a manual refresh.
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  useEffect(() => {
    if (!thread) {
      setLastSeenId(null);
      return;
    }
    const latest = messages[messages.length - 1];
    if (!latest) return;
    if (lastSeenId && latest.id !== lastSeenId && latest.direction === "INBOUND") {
      toast.info("New reply arrived");
    }
    setLastSeenId(latest.id);
  }, [messages, thread]);

  // The "to" for a reply is the original sender of the most recent inbound.
  // If everything's outbound, fall back to the first To address from the
  // most recent send.
  const replyTo = useMemo(() => {
    if (messages.length === 0) return "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.direction === "INBOUND") return m.from_address;
    }
    const lastOutbound = messages[messages.length - 1];
    return lastOutbound.to_addresses[0]?.address ?? "";
  }, [messages]);

  const expectedAccountId = lastOutboundAccountId ?? thread?.account_id ?? null;
  const expectedAccount = accounts.find((a) => a.id === expectedAccountId) ?? null;
  const senderSwitched = !!(expectedAccountId && fromAccountId && fromAccountId !== expectedAccountId);

  const claimedByMe = thread?.claimed_by_email === adminEmail;
  const claimedByOther = !!thread?.claimed_by_email && !claimedByMe;

  const handleStatus = async (status: EmailThreadStatus) => {
    if (!thread) return;
    try {
      await updateEmailThreadStatus(thread.id, status);
      toast.success(`Marked ${status.toLowerCase()}`);
      onMutated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleClaim = async () => {
    if (!thread) return;
    try {
      if (thread.claimed_by_email) {
        await unclaimEmailThread(thread.id);
        toast.success("Released claim");
      } else {
        await claimEmailThread(thread.id, adminEmail);
        toast.success("Thread claimed");
      }
      onMutated();
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
      onMutated();
      toast.success("Reply sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

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

        {claimedByOther && (
          <div className="mt-2 rounded-md border border-purple-300/60 bg-purple-50/60 dark:bg-purple-950/20 p-2 text-xs text-purple-900 dark:text-purple-100 flex items-center gap-2">
            <UserCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Currently claimed by <strong>{thread?.claimed_by_email}</strong>. Coordinate before replying.</span>
          </div>
        )}

        <div className="flex gap-2 pt-3 pb-3 border-b flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleStatus("CLOSED")}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Close
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleStatus("ARCHIVED")}>
            <Archive className="h-4 w-4 mr-1.5" />
            Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => handleStatus("SPAM")}
          >
            <ShieldAlert className="h-4 w-4 mr-1.5" />
            Spam
          </Button>
          <Button size="sm" variant={claimedByMe ? "secondary" : "ghost"} onClick={handleClaim} className="ml-auto">
            {thread?.claimed_by_email ? (
              <><UserMinus className="h-3.5 w-3.5 mr-1.5" />{claimedByMe ? "Release" : "Take over"}</>
            ) : (
              <><UserCheck className="h-3.5 w-3.5 mr-1.5" />Claim</>
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
          ) : (
            messages.map((m) => <MessageCard key={m.id} message={m} />)
          )}
        </div>

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
            ref={replyTextareaRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type a reply…"
            rows={4}
            disabled={sending}
            className="resize-none"
          />
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
              <TemplatePickerButton
                textareaRef={replyTextareaRef}
                bodyValue={replyText}
                onBodyChange={setReplyText}
                disabled={sending}
              />
              <MarkdownLinkButton
                textareaRef={replyTextareaRef}
                value={replyText}
                onChange={setReplyText}
                disabled={sending}
              />
            </div>
            <Button
              size="sm"
              onClick={handleSendReply}
              disabled={sending || !replyText.trim() || !replyTo || !fromAccountId}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {sending ? "Sending…" : "Send reply"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Loose RFC-ish email check. Edge function does the canonical validation;
// this is just for UI feedback so the operator catches typos pre-send.
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function validateEmailList(input: string): { valid: string[]; invalid: string[] } {
  const tokens = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (EMAIL_RE.test(t)) valid.push(t);
    else invalid.push(t);
  }
  return { valid, invalid };
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
  const [fromAccountId, setFromAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync the default From if accounts arrive after first render. useEffect,
  // not useMemo (the previous code mis-used useMemo for setState).
  useEffect(() => {
    if (!fromAccountId && accounts[0]) setFromAccountId(accounts[0].id);
  }, [accounts, fromAccountId]);

  const reset = () => {
    setTo("");
    setCc("");
    setSubject("");
    setBodyText("");
  };

  const toCheck = useMemo(() => validateEmailList(to), [to]);
  const ccCheck = useMemo(() => validateEmailList(cc), [cc]);
  const hasInvalidRecipients = toCheck.invalid.length > 0 || ccCheck.invalid.length > 0;
  const hasValidTo = toCheck.valid.length > 0;

  const handleSend = async () => {
    if (!fromAccountId || !hasValidTo || !subject.trim() || !bodyText.trim() || hasInvalidRecipients) return;
    setSending(true);
    try {
      await sendEmail({
        account_id: fromAccountId,
        to: toCheck.valid.map((address) => ({ address })),
        cc: ccCheck.valid.length > 0 ? ccCheck.valid.map((address) => ({ address })) : undefined,
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
              aria-invalid={toCheck.invalid.length > 0}
            />
            {toCheck.invalid.length > 0 && (
              <p className="text-[11px] text-destructive mt-1">
                Not a valid email: {toCheck.invalid.join(", ")}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Cc (optional)</label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              disabled={sending}
              aria-invalid={ccCheck.invalid.length > 0}
            />
            {ccCheck.invalid.length > 0 && (
              <p className="text-[11px] text-destructive mt-1">
                Not a valid email: {ccCheck.invalid.join(", ")}
              </p>
            )}
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">Message</label>
              <div className="flex items-center gap-1">
                <TemplatePickerButton
                  textareaRef={bodyTextareaRef}
                  bodyValue={bodyText}
                  onBodyChange={setBodyText}
                  subject={subject}
                  onSubjectChange={setSubject}
                  disabled={sending}
                />
                <MarkdownLinkButton
                  textareaRef={bodyTextareaRef}
                  value={bodyText}
                  onChange={setBodyText}
                  disabled={sending}
                />
              </div>
            </div>
            <Textarea
              ref={bodyTextareaRef}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Write your message…"
              rows={12}
              disabled={sending}
              className="resize-none"
            />
          </div>
        </div>

        <div className="border-t pt-3 flex justify-end">
          <Button
            onClick={handleSend}
            disabled={
              sending ||
              !fromAccountId ||
              !hasValidTo ||
              !subject.trim() ||
              !bodyText.trim() ||
              hasInvalidRecipients
            }
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Sending…" : "Send email"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MessageCard({ message }: { message: EmailMessage }) {
  const isOutbound = message.direction === "OUTBOUND";
  const ts = message.received_at || message.sent_at || message.created_at;
  const body = message.stripped_text || message.body_text || "(no body)";

  return (
    <div
      className={cn(
        "rounded-lg p-3",
        isOutbound ? "ml-2 sm:ml-6 bg-primary/5 border border-primary/20" : "mr-2 sm:mr-6 bg-muted/50 border",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
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

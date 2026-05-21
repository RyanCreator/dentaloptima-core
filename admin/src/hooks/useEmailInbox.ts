import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";
import { debounce } from "@/lib/debounce";

// Coalesce realtime-triggered reloads — bursts of inserts/updates within this
// window collapse into a single fetch.
const REALTIME_DEBOUNCE_MS = 300;

// Direct registry queries — RLS policies restrict everything in this subsystem
// to admin_user-active sessions. Reply/send is Phase 2 (send-email edge fn).

export type EmailDirection = "INBOUND" | "OUTBOUND";
export type EmailThreadStatus = "OPEN" | "CLOSED" | "ARCHIVED" | "SPAM";

export interface EmailAccount {
  id: string;
  address: string;
  display_name: string;
  color: string;
}

export interface EmailThread {
  id: string;
  account_id: string;
  subject: string;
  status: EmailThreadStatus;
  last_message_at: string;
  message_count: number;
  claimed_by_email: string | null;
  claimed_at: string | null;
  account?: EmailAccount;
  preview?: {
    // The other party in the conversation — who you're talking to. For
    // inbound messages this is the sender; for outbound it's the recipient.
    // Computed so the list view never has to render "You" as the headline.
    counterparty_address: string;
    counterparty_name: string | null;
    last_direction: EmailDirection;
    // For outbound-last threads, which of our addresses sent it. Lets the
    // list view show "↗ wayne · Customer Name · ..." so you can spot at a
    // glance who replied last and stay consistent.
    last_from_address: string;
    snippet: string;
  } | null;
}

export interface EmailAttachment {
  id: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  file_path: string;
  is_inline: boolean;
  download_url: string | null;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  direction: EmailDirection;
  from_address: string;
  from_name: string | null;
  to_addresses: { address: string; name: string | null }[];
  cc_addresses: { address: string; name: string | null }[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
  stripped_text: string | null;
  message_id: string;
  received_at: string | null;
  sent_at: string | null;
  created_at: string;
  attachments?: EmailAttachment[];
}

const ATTACHMENT_BUCKET = "email-attachments";
// 1-hour TTL on signed URLs — long enough that an operator can leave a
// thread open and still download an attachment without the link expiring,
// short enough that a stolen URL doesn't have a long shelf life.
const SIGNED_DOWNLOAD_TTL_SECONDS = 60 * 60;

export function useEmailAccounts() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("email_account")
        .select("id, address, display_name, color")
        .eq("is_active", true)
        .order("address");
      if (!cancelled) {
        setAccounts((data as EmailAccount[]) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { accounts, loading };
}

// One-line preview from the most recent message in a thread, used for the
// list view. Pulled in a single batched query keyed by thread_id.
async function loadThreadPreviews(threadIds: string[]): Promise<Map<string, EmailThread["preview"]>> {
  const previews = new Map<string, EmailThread["preview"]>();
  if (threadIds.length === 0) return previews;
  // Order by created_at desc per thread — pull the latest message we have
  // for each thread. Postgres has no per-group LIMIT in standard SQL, so we
  // do a single query and pick the first per thread on the client. Fine for
  // up to ~200 threads × a few rows each.
  const { data } = await supabase
    .from("email_message")
    .select("thread_id, direction, from_address, from_name, to_addresses, body_text, stripped_text, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });
  for (const m of (data as EmailMessage[]) || []) {
    if (previews.has(m.thread_id)) continue;
    const text = m.stripped_text || m.body_text || "";
    // Counterparty = the OTHER party in this exchange. Inbound means the
    // outside sender; outbound means the first To recipient. Falls back to
    // the from address if a sent row somehow has no recipients.
    const isOutbound = m.direction === "OUTBOUND";
    const firstTo = isOutbound ? m.to_addresses?.[0] : null;
    previews.set(m.thread_id, {
      counterparty_address: isOutbound ? firstTo?.address ?? m.from_address : m.from_address,
      counterparty_name: isOutbound ? firstTo?.name ?? null : m.from_name,
      last_direction: m.direction,
      last_from_address: m.from_address,
      snippet: text.slice(0, 140).replace(/\s+/g, " ").trim(),
    });
  }
  return previews;
}

export function useEmailThreads(accountId: string | null, status: EmailThreadStatus | "ALL" = "ALL") {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  // Guard against stale fetches resolving after unmount or after the
  // accountId/status filters change. Without this, a slow loadThreadPreviews
  // call from a previous render can overwrite fresh state.
  const aliveRef = useRef(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("email_thread")
      .select("*, account:account_id(id, address, display_name, color)")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (accountId) query = query.eq("account_id", accountId);
    if (status !== "ALL") query = query.eq("status", status);
    const { data, error } = await query;
    if (!aliveRef.current) return;
    if (!error && data) {
      const ids = data.map((t: any) => t.id);
      const previews = await loadThreadPreviews(ids);
      if (!aliveRef.current) return;
      setThreads(
        (data as any[]).map((t) => ({
          ...t,
          preview: previews.get(t.id) ?? null,
        })) as EmailThread[]
      );
    }
    setLoading(false);
  }, [accountId, status]);

  useEffect(() => {
    aliveRef.current = true;
    reload();
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`email-threads-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "email_message" },
        () => debouncedReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "email_thread" },
        () => debouncedReload()
      )
      .subscribe();
    return () => {
      aliveRef.current = false;
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { threads, loading, reload };
}

export function useEmailMessages(threadId: string | null) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("email_message")
      .select(
        "*, attachments:email_attachment(id, file_name, file_size_bytes, mime_type, file_path, is_inline)"
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    // Mint signed URLs for non-inline attachments. Inline ones (cid:) are
    // referenced from body_html and would need URL rewriting — Phase 2.
    const enriched = await Promise.all(
      ((data as any[]) || []).map(async (m) => {
        const atts = await Promise.all(
          (m.attachments || []).map(async (a: EmailAttachment) => {
            if (a.is_inline) return { ...a, download_url: null };
            const { data: signed } = await supabase.storage
              .from(ATTACHMENT_BUCKET)
              .createSignedUrl(a.file_path, SIGNED_DOWNLOAD_TTL_SECONDS);
            return { ...a, download_url: signed?.signedUrl ?? null };
          })
        );
        return { ...m, attachments: atts };
      })
    );
    setMessages(enriched as EmailMessage[]);
    setLoading(false);
  }, [threadId]);

  useEffect(() => {
    reload();
    if (!threadId) return;
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`email-messages-${threadId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "ops",
          table: "email_message",
          filter: `thread_id=eq.${threadId}`,
        },
        () => debouncedReload()
      )
      .subscribe();
    return () => {
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [threadId, reload]);

  return { messages, loading, reload };
}

export async function updateEmailThreadStatus(threadId: string, status: EmailThreadStatus) {
  const { error } = await supabase
    .from("email_thread")
    .update({ status })
    .eq("id", threadId);
  if (error) throw error;
}

// Mirror of the support claim flow — see migration 0026. Stored as the
// operator's email at claim time (snapshot). Multiple operators reading
// the inbox at once can use this to avoid double-replying.
export async function claimEmailThread(threadId: string, operatorEmail: string) {
  const { error } = await supabase
    .from("email_thread")
    .update({ claimed_by_email: operatorEmail, claimed_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) throw error;
}

export async function unclaimEmailThread(threadId: string) {
  const { error } = await supabase
    .from("email_thread")
    .update({ claimed_by_email: null, claimed_at: null })
    .eq("id", threadId);
  if (error) throw error;
}

// Send via the send-email edge function. Caller decides whether this is a
// reply (thread_id supplied) or a new thread (no thread_id).
export interface SendEmailInput {
  account_id: string;
  to: { address: string; name?: string | null }[];
  cc?: { address: string; name?: string | null }[];
  subject: string;
  body_text: string;
  thread_id?: string | null;
}

export interface SendEmailResult {
  ok: true;
  thread_id: string;
  message_id: string;
  postmark_message_id: string | null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { data, error } = await supabase.functions.invoke("send-email", { body: input });
  if (error) {
    // supabase-js wraps non-2xx into FunctionsHttpError with a context.response.
    // Try to surface the actual server message if we can.
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx?.json) {
      try {
        const payload = (await ctx.json()) as { error?: string; postmark_message?: string };
        throw new Error(payload.error ?? payload.postmark_message ?? error.message);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
      }
    }
    throw error;
  }
  return data as SendEmailResult;
}

// Per-account open-thread count for the tab badges.
export function useEmailAccountCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("email_thread")
      .select("account_id")
      .eq("status", "OPEN");
    const next: Record<string, number> = {};
    for (const row of (data as { account_id: string }[]) || []) {
      next[row.account_id] = (next[row.account_id] || 0) + 1;
    }
    setCounts(next);
  }, []);

  useEffect(() => {
    reload();
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`email-counts-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "email_thread" },
        () => debouncedReload()
      )
      .subscribe();
    return () => {
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return counts;
}

// Used by the sidebar bell/badge — total unread across all accounts.
// Phase 1: counts INBOUND threads in OPEN status (no per-admin read state yet).
export function useTotalOpenThreads() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const { count } = await supabase
        .from("email_thread")
        .select("id", { count: "exact", head: true })
        .eq("status", "OPEN");
      setCount(count ?? 0);
    };
    refresh();
    const debouncedRefresh = debounce(refresh, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`email-total-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "email_thread" },
        () => debouncedRefresh()
      )
      .subscribe();
    return () => {
      debouncedRefresh.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}

// Convenience: a coloured tag class per account, using the seeded colour.
export function accountColorClasses(color: string): string {
  switch (color) {
    case "blue":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "amber":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "emerald":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "violet":
      return "bg-violet-100 text-violet-700 border-violet-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function useEmailFilters(accounts: EmailAccount[]) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<EmailThreadStatus | "ALL">("OPEN");

  const accountById = useMemo(() => {
    const m = new Map<string, EmailAccount>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  return { accountId, setAccountId, status, setStatus, accountById };
}

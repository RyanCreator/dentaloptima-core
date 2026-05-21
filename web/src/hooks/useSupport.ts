import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Practice <-> Dentaloptima support messaging.
//
// Tables (in dentaloptima-core, migration 0038):
//   support_thread, support_message, support_attachment
// Storage:
//   support-attachments bucket, path = {practice_id}/{thread_id}/{file}
//
// All access is via the practice member's session JWT — RLS scopes results
// to current_practice_id() automatically. No edge function, no env var,
// no cross-project hop.

const REALTIME_DEBOUNCE_MS = 300;
const ATTACHMENT_BUCKET = "support-attachments";
const SIGNED_DOWNLOAD_TTL_SECONDS = 60 * 60;

export type SupportThreadStatus =
  | "OPEN"
  | "AWAITING_DENTALOPTIMA"
  | "AWAITING_TENANT"
  | "RESOLVED"
  | "CLOSED";

export interface SupportThread {
  id: string;
  practice_id: string;
  subject: string;
  status: SupportThreadStatus;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  unread_count?: number;
}

export interface SupportAttachment {
  id: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  file_path: string;
  download_url: string | null;
}

export interface SupportMessage {
  id: string;
  thread_id: string;
  practice_id: string;
  direction: "INBOUND" | "OUTBOUND";
  author_email: string;
  author_name: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
  attachments?: SupportAttachment[];
}

// Author/practice context required to send a message. The booking app
// constructs this from useAuth() at the call site — we don't pull it in
// here so the imperative functions stay free of React context.
export interface SupportSendContext {
  practice_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
}

// Lightweight debounce — bursts of realtime events within the window
// collapse to a single fetch. Inline rather than imported to keep this
// hook self-contained.
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return wrapped;
}

// ----- Threads --------------------------------------------------------------

export function useSupportThreads() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data: threadRows, error: threadErr } = await supabase
        .from("support_thread")
        .select("*")
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (threadErr) throw threadErr;
      const ids = (threadRows ?? []).map((t) => t.id);
      let unreadByThread = new Map<string, number>();
      if (ids.length > 0) {
        // Practice-side unread = OUTBOUND (Dentaloptima → us) messages with no read_at.
        const { data: unread } = await supabase
          .from("support_message")
          .select("thread_id")
          .in("thread_id", ids)
          .eq("direction", "OUTBOUND")
          .is("read_at", null);
        for (const m of unread ?? []) {
          unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
        }
      }
      setThreads(
        ((threadRows ?? []) as SupportThread[]).map((t) => ({
          ...t,
          unread_count: unreadByThread.get(t.id) ?? 0,
        })),
      );
      setError(null);
    } catch (err) {
      logger.error("Failed to load support threads", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`support-threads-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_thread" },
        () => debouncedReload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_message" },
        () => debouncedReload(),
      )
      .subscribe();
    return () => {
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { threads, loading, error, reload };
}

export function useSupportMessages(threadId: string | null) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from("support_message")
        .select(
          "*, attachments:support_attachment(id, file_name, file_size_bytes, mime_type, file_path)",
        )
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (fetchErr) throw fetchErr;
      // Mint signed download URLs for attachments. RLS gates the
      // signing — non-members of this practice can't sign URLs.
      const enriched = await Promise.all(
        (data ?? []).map(async (m: any) => {
          const atts = await Promise.all(
            (m.attachments ?? []).map(async (a: SupportAttachment) => {
              const { data: signed } = await supabase.storage
                .from(ATTACHMENT_BUCKET)
                .createSignedUrl(a.file_path, SIGNED_DOWNLOAD_TTL_SECONDS);
              return { ...a, download_url: signed?.signedUrl ?? null };
            }),
          );
          return { ...m, attachments: atts };
        }),
      );
      setMessages(enriched as SupportMessage[]);
    } catch (err) {
      logger.error("Failed to load thread messages", err);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    reload();
    if (!threadId) return;
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`support-messages-${threadId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_message",
          filter: `thread_id=eq.${threadId}`,
        },
        () => debouncedReload(),
      )
      .subscribe();
    return () => {
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [threadId, reload]);

  return { messages, loading, reload };
}

// ----- Attachments ----------------------------------------------------------

// Two-step upload:
//   1. Insert support_attachment row with NULL message_id.
//   2. Upload the bytes to storage at {practice_id}/{thread_id}/{...}.
//   3. Caller links the attachment_id to the message at send time.
//
// Storage path includes practice_id so the path-prefix RLS on storage.objects
// can scope writes per-practice.
export async function uploadAttachment(
  ctx: SupportSendContext,
  threadId: string,
  file: File,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectName = `${ctx.practice_id}/${threadId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(objectName, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadErr) throw uploadErr;
  const { data: row, error: insertErr } = await supabase
    .from("support_attachment")
    .insert({
      thread_id: threadId,
      message_id: null,
      practice_id: ctx.practice_id,
      file_path: objectName,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || null,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;
  return row.id as string;
}

async function linkAttachments(attachmentIds: string[], threadId: string, messageId: string) {
  if (attachmentIds.length === 0) return;
  const { error } = await supabase
    .from("support_attachment")
    .update({ message_id: messageId })
    .in("id", attachmentIds)
    .eq("thread_id", threadId)
    .is("message_id", null);
  if (error) throw error;
}

// ----- Mutations ------------------------------------------------------------

export async function createSupportThread(
  ctx: SupportSendContext,
  subject: string,
  body: string,
  attachmentIds?: string[],
): Promise<SupportThread> {
  const { data: thread, error: threadErr } = await supabase
    .from("support_thread")
    .insert({
      practice_id: ctx.practice_id,
      subject,
      // Initial status — first message will flip it to AWAITING_DENTALOPTIMA
      // via the touch_thread trigger.
      status: "OPEN",
    })
    .select("*")
    .single();
  if (threadErr) throw threadErr;

  const { data: message, error: msgErr } = await supabase
    .from("support_message")
    .insert({
      thread_id: thread.id,
      practice_id: ctx.practice_id,
      direction: "INBOUND",
      author_user_id: ctx.user_id,
      author_email: ctx.email,
      author_name: ctx.full_name,
      body,
    })
    .select("id")
    .single();
  if (msgErr) throw msgErr;

  if (attachmentIds && attachmentIds.length > 0) {
    await linkAttachments(attachmentIds, thread.id, message.id);
  }
  return thread as SupportThread;
}

export async function sendSupportMessage(
  ctx: SupportSendContext,
  threadId: string,
  body: string,
  attachmentIds?: string[],
): Promise<SupportMessage> {
  const { data: message, error: msgErr } = await supabase
    .from("support_message")
    .insert({
      thread_id: threadId,
      practice_id: ctx.practice_id,
      direction: "INBOUND",
      author_user_id: ctx.user_id,
      author_email: ctx.email,
      author_name: ctx.full_name,
      body,
    })
    .select("*")
    .single();
  if (msgErr) throw msgErr;
  if (attachmentIds && attachmentIds.length > 0) {
    await linkAttachments(attachmentIds, threadId, message.id);
  }
  return message as SupportMessage;
}

// Mark all OUTBOUND (Dentaloptima → us) messages on this thread as read.
// RLS only permits the caller to update messages in their own practice;
// the read_at column is the only thing the booking-app code touches.
export async function markThreadRead(threadId: string) {
  const { error } = await supabase
    .from("support_message")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("direction", "OUTBOUND")
    .is("read_at", null);
  if (error) throw error;
}

// ----- Bell badge polling ---------------------------------------------------

export function useSupportUnreadCount(pollIntervalMs = 60_000) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    const { count } = await supabase
      .from("support_message")
      .select("id", { count: "exact", head: true })
      .eq("direction", "OUTBOUND")
      .is("read_at", null);
    setUnread(count ?? 0);
  }, []);

  useEffect(() => {
    refresh();
    const debouncedRefresh = debounce(refresh, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`support-unread-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_message" },
        () => debouncedRefresh(),
      )
      .subscribe();
    // Also poll periodically as a backstop for missed realtime events.
    const id = window.setInterval(refresh, pollIntervalMs);
    return () => {
      debouncedRefresh.cancel();
      supabase.removeChannel(channel);
      window.clearInterval(id);
    };
  }, [refresh, pollIntervalMs]);

  return { unread, refresh };
}

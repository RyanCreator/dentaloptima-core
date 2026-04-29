import { useCallback, useEffect, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";
import { debounce } from "@/lib/debounce";

// Coalesce realtime-triggered reloads — bursts of inserts/updates within this
// window collapse into a single fetch.
const REALTIME_DEBOUNCE_MS = 300;

// Direct registry queries — RLS policies restrict to admin_user-active sessions.
// Realtime subscription on support_message gives us the live bell badge.

export type SupportThreadStatus =
  | "OPEN"
  | "AWAITING_DENTALOPTIMA"
  | "AWAITING_TENANT"
  | "RESOLVED"
  | "CLOSED";

export interface SupportThread {
  id: string;
  tenant_id: string;
  subject: string;
  status: SupportThreadStatus;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  tenant?: { practice_name: string; hostname: string } | null;
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
  direction: "INBOUND" | "OUTBOUND";
  author_email: string;
  author_name: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
  attachments?: SupportAttachment[];
}

const ATTACHMENT_BUCKET = "support-attachments";
// 1-hour TTL — keeps download links live even if an operator leaves a
// thread open while reading, without giving stolen URLs a long shelf life.
const SIGNED_DOWNLOAD_TTL_SECONDS = 60 * 60;

export function useSupportThreads() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_thread")
      .select("*, tenant:tenant_id(practice_name, hostname)")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      // Annotate with unread inbound count per thread
      const ids = data.map((t) => t.id);
      let unreadByThread = new Map<string, number>();
      if (ids.length > 0) {
        const { data: unread } = await supabase
          .from("support_message")
          .select("thread_id")
          .in("thread_id", ids)
          .eq("direction", "INBOUND")
          .is("read_at", null);
        for (const m of unread || []) {
          unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) || 0) + 1);
        }
      }
      setThreads(
        (data as SupportThread[]).map((t) => ({
          ...t,
          unread_count: unreadByThread.get(t.id) || 0,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`support-threads-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_message" },
        () => debouncedReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_thread" },
        () => debouncedReload()
      )
      .subscribe();
    return () => {
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { threads, loading, reload };
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
    const { data } = await supabase
      .from("support_message")
      .select("*, attachments:support_attachment(id, file_name, file_size_bytes, mime_type, file_path)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    // Mint signed download URLs client-side (admin has direct storage access).
    const enriched = await Promise.all(
      ((data as any[]) || []).map(async (m) => {
        const atts = await Promise.all(
          (m.attachments || []).map(async (a: SupportAttachment) => {
            const { data: signed } = await supabase.storage
              .from(ATTACHMENT_BUCKET)
              .createSignedUrl(a.file_path, SIGNED_DOWNLOAD_TTL_SECONDS);
            return { ...a, download_url: signed?.signedUrl ?? null };
          })
        );
        return { ...m, attachments: atts };
      })
    );
    setMessages(enriched as SupportMessage[]);
    setLoading(false);
  }, [threadId]);

  useEffect(() => {
    reload();
    if (!threadId) return;
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`support-messages-${threadId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_message", filter: `thread_id=eq.${threadId}` },
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

export async function uploadAdminAttachment(threadId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${threadId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadErr) throw uploadErr;
  const { data: row, error: insertErr } = await supabase
    .from("support_attachment")
    .insert({
      thread_id: threadId,
      message_id: null,
      file_path: path,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || null,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;
  return row.id;
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

export async function sendAdminReply(
  threadId: string,
  body: string,
  adminEmail: string,
  attachmentIds: string[] = []
) {
  const { data: message, error: msgErr } = await supabase
    .from("support_message")
    .insert({
      thread_id: threadId,
      direction: "OUTBOUND",
      author_email: adminEmail,
      body,
    })
    .select("id")
    .single();
  if (msgErr) throw msgErr;
  await linkAttachments(attachmentIds, threadId, message.id);
  const { error: threadErr } = await supabase
    .from("support_thread")
    .update({ status: "AWAITING_TENANT", last_message_at: new Date().toISOString() })
    .eq("id", threadId);
  if (threadErr) throw threadErr;
}

export async function markInboundRead(threadId: string) {
  await supabase
    .from("support_message")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("direction", "INBOUND")
    .is("read_at", null);
}

export async function startThreadFromAdmin(
  tenantId: string,
  subject: string,
  body: string,
  adminEmail: string
) {
  const { data: thread, error: threadErr } = await supabase
    .from("support_thread")
    .insert({ tenant_id: tenantId, subject, status: "AWAITING_TENANT" })
    .select("*")
    .single();
  if (threadErr) throw threadErr;
  const { error: msgErr } = await supabase.from("support_message").insert({
    thread_id: thread.id,
    direction: "OUTBOUND",
    author_email: adminEmail,
    body,
  });
  if (msgErr) throw msgErr;
  return thread as SupportThread;
}

export async function updateThreadStatus(
  threadId: string,
  status: SupportThreadStatus
) {
  const { error } = await supabase
    .from("support_thread")
    .update({ status })
    .eq("id", threadId);
  if (error) throw error;
}

export function useUnreadInboundCount() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const { count } = await supabase
        .from("support_message")
        .select("id", { count: "exact", head: true })
        .eq("direction", "INBOUND")
        .is("read_at", null);
      setUnread(count ?? 0);
    };
    refresh();
    const debouncedRefresh = debounce(refresh, REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`support-unread-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_message" },
        () => debouncedRefresh()
      )
      .subscribe();
    return () => {
      debouncedRefresh.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  return unread;
}

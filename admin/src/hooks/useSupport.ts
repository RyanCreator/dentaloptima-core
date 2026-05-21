import { useCallback, useEffect, useState } from "react";
import { supabaseCore as supabase } from "@/integrations/supabase/client";

// Operator-side support inbox.
//
// Reads/writes go directly against dentaloptima-core (migration 0038) using
// the service-role client — operators don't have a JWT against core, so
// service role is the canonical access path. RLS is bypassed by service
// role; the security perimeter is the operator login at the admin app.
//
// Realtime works with the service-role client (postgres_changes channel
// auth accepts service-role keys, RLS is bypassed for the channel).

const REALTIME_DEBOUNCE_MS = 300;
const ATTACHMENT_BUCKET = "support-attachments";
const SIGNED_DOWNLOAD_TTL_SECONDS = 60 * 60;

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
  claimed_by_email: string | null;
  claimed_at: string | null;
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

// ----- Threads --------------------------------------------------------------

export function useSupportThreads() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_thread")
      .select("*")
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      const ids = data.map((t) => t.id);
      let unreadByThread = new Map<string, number>();
      if (ids.length > 0) {
        // Operator-side unread = INBOUND (practice → us) messages with no read_at.
        const { data: unread } = await supabase
          .from("support_message")
          .select("thread_id")
          .in("thread_id", ids)
          .eq("direction", "INBOUND")
          .is("read_at", null);
        for (const m of unread ?? []) {
          unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
        }
      }
      setThreads(
        (data as SupportThread[]).map((t) => ({
          ...t,
          unread_count: unreadByThread.get(t.id) ?? 0,
        })),
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
        () => debouncedReload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_thread" },
        () => debouncedReload(),
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
      .select(
        "*, attachments:support_attachment(id, file_name, file_size_bytes, mime_type, file_path)",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    const enriched = await Promise.all(
      ((data as any[]) ?? []).map(async (m) => {
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

// ----- Attachments + send ---------------------------------------------------

// Operator-side upload. Path mirrors the practice-side convention so RLS
// on storage.objects scopes the right way:
//   {practice_id}/{thread_id}/<random>-<safe filename>
// We need the practice_id (looked up from the thread) to build the path.
async function lookupPracticeId(threadId: string): Promise<string> {
  const { data, error } = await supabase
    .from("support_thread")
    .select("practice_id")
    .eq("id", threadId)
    .single();
  if (error || !data) throw new Error("Thread not found");
  return data.practice_id as string;
}

export async function uploadAdminAttachment(threadId: string, file: File): Promise<string> {
  const practiceId = await lookupPracticeId(threadId);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectName = `${practiceId}/${threadId}/${crypto.randomUUID()}-${safeName}`;
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
      practice_id: practiceId,
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

export async function sendAdminReply(
  threadId: string,
  body: string,
  adminEmail: string,
  attachmentIds: string[] = [],
) {
  const practiceId = await lookupPracticeId(threadId);
  const { data: message, error: msgErr } = await supabase
    .from("support_message")
    .insert({
      thread_id: threadId,
      practice_id: practiceId,
      direction: "OUTBOUND",
      author_email: adminEmail,
      body,
    })
    .select("id")
    .single();
  if (msgErr) throw msgErr;
  await linkAttachments(attachmentIds, threadId, message.id);
  // The touch_thread trigger handles last_message_at + status, but we don't
  // need to update them ourselves any more.
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
  practiceId: string,
  subject: string,
  body: string,
  adminEmail: string,
) {
  const { data: thread, error: threadErr } = await supabase
    .from("support_thread")
    .insert({ practice_id: practiceId, subject, status: "OPEN" })
    .select("*")
    .single();
  if (threadErr) throw threadErr;
  const { error: msgErr } = await supabase.from("support_message").insert({
    thread_id: thread.id,
    practice_id: practiceId,
    direction: "OUTBOUND",
    author_email: adminEmail,
    body,
  });
  if (msgErr) throw msgErr;
  return thread as SupportThread;
}

export async function updateThreadStatus(threadId: string, status: SupportThreadStatus) {
  const { error } = await supabase
    .from("support_thread")
    .update({ status })
    .eq("id", threadId);
  if (error) throw error;
}

export async function claimThread(threadId: string, operatorEmail: string) {
  const { error } = await supabase
    .from("support_thread")
    .update({ claimed_by_email: operatorEmail, claimed_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) throw error;
}

export async function unclaimThread(threadId: string) {
  const { error } = await supabase
    .from("support_thread")
    .update({ claimed_by_email: null, claimed_at: null })
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
        () => debouncedRefresh(),
      )
      .subscribe();
    return () => {
      debouncedRefresh.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  return unread;
}

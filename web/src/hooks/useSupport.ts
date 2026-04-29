import { useCallback, useEffect, useState } from "react";
import { supabase, getTenantSupabaseUrl } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Wraps the registry's support-action edge function. Holds no Supabase client
// of its own — uses the booking app's existing tenant-side session for the
// JWT and pulls the registry's base URL from VITE_TENANT_REGISTRY_URL.

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

function deriveRegistryBaseUrl(): string | null {
  const registryFnUrl = import.meta.env.VITE_TENANT_REGISTRY_URL as string | undefined;
  if (!registryFnUrl) return null;
  // Strip /functions/v1/<fn-name> from the end to get the project base URL.
  return registryFnUrl.replace(/\/functions\/v1\/[^/]+$/, "");
}

async function callSupportAction(verb: string, payload: Record<string, unknown> = {}) {
  const registryBase = deriveRegistryBaseUrl();
  if (!registryBase) {
    throw new Error(
      "Support messaging is unavailable — VITE_TENANT_REGISTRY_URL is not configured."
    );
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Not signed in");

  const tenantUrl = getTenantSupabaseUrl();

  const res = await fetch(`${registryBase}/functions/v1/support-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Url": tenantUrl,
    },
    body: JSON.stringify({ verb, ...payload }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`support-action ${verb} failed (${res.status}): ${errBody}`);
  }
  return res.json();
}

// ----- Threads -----

export function useSupportThreads() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { threads } = await callSupportAction("list_threads");
      setThreads(threads || []);
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
      const { messages } = await callSupportAction("list_messages", { thread_id: threadId });
      setMessages(messages || []);
    } catch (err) {
      logger.error("Failed to load thread messages", err);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { messages, loading, reload };
}

// ----- Mutations -----

// Attachment flow: caller picks files, calls uploadAttachment for each to get
// an attachment_id, then passes the IDs to createSupportThread/sendSupportMessage.
export async function uploadAttachment(threadId: string, file: File): Promise<string> {
  const { attachment_id, upload_url } = await callSupportAction("prepare_upload", {
    thread_id: threadId,
    file_name: file.name,
    file_size_bytes: file.size,
    mime_type: file.type || null,
  });
  // PUT the file directly to the signed URL.
  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    throw new Error(`Upload failed (${uploadRes.status}): ${txt}`);
  }
  return attachment_id;
}

export async function createSupportThread(
  subject: string,
  body: string,
  attachmentIds?: string[]
) {
  // For new threads we need a thread_id BEFORE we can upload attachments,
  // so the UI uploads via uploadAttachment(threadId=temp) — but new threads
  // don't have an id yet. Workaround: callers can either skip attachments on
  // brand-new threads OR create the thread first, then call sendSupportMessage
  // with attachments. For now, ignore attachmentIds on create_thread.
  // (UI surfaces this by only showing the file picker on existing threads.)
  const { thread } = await callSupportAction("create_thread", {
    subject,
    body,
    attachment_ids: attachmentIds,
  });
  return thread as SupportThread;
}

export async function sendSupportMessage(
  threadId: string,
  body: string,
  attachmentIds?: string[]
) {
  const { message } = await callSupportAction("create_message", {
    thread_id: threadId,
    body,
    attachment_ids: attachmentIds,
  });
  return message as SupportMessage;
}

export async function markThreadRead(threadId: string) {
  await callSupportAction("mark_read", { thread_id: threadId });
}

// ----- Bell badge polling -----

export function useSupportUnreadCount(pollIntervalMs = 60_000) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { unread } = await callSupportAction("unread_count");
      setUnread(unread || 0);
    } catch (err) {
      logger.error("Failed to fetch support unread count", err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [refresh, pollIntervalMs]);

  return { unread, refresh };
}

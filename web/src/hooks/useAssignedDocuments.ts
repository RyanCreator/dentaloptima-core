import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/contexts/PracticeContext";

// Documents pushed to this practice by Dentaloptima staff via the admin
// dashboard. Live in core.practice_document. Practice members can:
//   - read all their practice's docs (RLS)
//   - mark a doc as viewed (auto on open) and acknowledged (one-click)
// They cannot edit the body or assign new docs.
//
// Acknowledgement is one-per-practice — first OWNER/ADMIN/dentist to ack
// does so on behalf of the whole practice. Matches "we want to know they
// have seen it" rather than per-member compliance.

export type AssignedDocumentKind = "CLIENT_FACING" | "INTERNAL";

export interface AssignedDocument {
  id: string;
  practice_id: string;
  source_document_id: string;
  source_version_id: string | null;
  title: string;
  body_markdown: string;
  kind: AssignedDocumentKind;
  assigned_at: string;
  assigned_by_admin_email: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by_member_id: string | null;
  archived_at: string | null;
}

export interface AssignedDocumentSummary {
  id: string;
  title: string;
  kind: AssignedDocumentKind;
  assigned_at: string;
  assigned_by_admin_email: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
}

export function useAssignedDocuments() {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [documents, setDocuments] = useState<AssignedDocumentSummary[]>([]);
  // hasLoadedOnce keeps the list from flashing back to a skeleton on
  // every realtime-triggered refetch — same pattern used across the
  // app's other list pages.
  const hasLoadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!hasLoadedOnce.current) setLoading(true);
    const { data, error } = await supabase
      .from("practice_document")
      .select("id, title, kind, assigned_at, assigned_by_admin_email, viewed_at, acknowledged_at")
      .eq("practice_id", practiceId)
      .is("archived_at", null)
      .order("assigned_at", { ascending: false });
    if (!error && data) {
      setDocuments(data as AssignedDocumentSummary[]);
      hasLoadedOnce.current = true;
    }
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime: refetch on any change to this practice's docs. Filtered
  // server-side so we don't get notified for other tenants.
  useEffect(() => {
    const channel = supabase
      .channel(`practice_document:${practiceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "practice_document",
          filter: `practice_id=eq.${practiceId}`,
        },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [practiceId, reload]);

  return { documents, loading, reload };
}

export function useAssignedDocument(id: string | undefined) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [doc, setDoc] = useState<AssignedDocument | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!id) {
      setDoc(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("practice_document")
      .select("*")
      .eq("id", id)
      .eq("practice_id", practiceId)
      .maybeSingle();
    if (!error) setDoc((data as AssignedDocument | null) ?? null);
    setLoading(false);
  }, [id, practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { doc, loading, reload };
}

/**
 * Count of documents that haven't been acknowledged yet. Used by the
 * sidebar badge. Cheap query — only counts.
 */
export function useUnacknowledgedDocumentCount() {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [count, setCount] = useState(0);

  const reload = useCallback(async () => {
    const { count: c } = await supabase
      .from("practice_document")
      .select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId)
      .is("archived_at", null)
      .is("acknowledged_at", null);
    setCount(c ?? 0);
  }, [practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime: keep the badge fresh as practice members read/ack docs.
  useEffect(() => {
    const channel = supabase
      .channel(`practice_document_count:${practiceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "practice_document",
          filter: `practice_id=eq.${practiceId}`,
        },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [practiceId, reload]);

  return { count, reload };
}

/**
 * Stamps viewed_at on the document if it hasn't been viewed yet.
 * No-op if viewed_at is already set — preserves the original viewed time.
 */
export async function markDocumentViewed(documentId: string): Promise<void> {
  const { error } = await supabase
    .from("practice_document")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", documentId)
    .is("viewed_at", null);
  if (error) {
    // Non-fatal — failing to stamp viewed_at shouldn't block the read.
    console.error("Failed to mark document viewed", error);
  }
}

/**
 * Acknowledges the document on behalf of the practice. Records the
 * member id who acked. Refuses if already acknowledged.
 */
export async function acknowledgeDocument(
  documentId: string,
  memberId: string,
): Promise<void> {
  const { error } = await supabase
    .from("practice_document")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by_member_id: memberId,
    })
    .eq("id", documentId)
    .is("acknowledged_at", null);
  if (error) throw error;
}

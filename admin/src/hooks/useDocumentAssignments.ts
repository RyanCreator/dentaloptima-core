import { useCallback, useEffect, useState } from "react";
import { supabaseCore, supabaseRegistry } from "@/integrations/supabase/client";

// Cross-project read: assignments live in dentaloptima-core
// (practice_document table). Admin uses the service-role client so RLS
// is bypassed — operators have full cross-tenant access by design.
//
// On assign, we fetch the doc + its latest version from tenant-registry,
// then denormalise title + body + kind + source_version_id into a row
// in core.practice_document. Re-publishing the source doesn't auto-update
// the practice's copy — the admin must explicitly re-assign to push a
// new version.

export interface PracticeDocumentAssignment {
  id: string;
  practice_id: string;
  source_document_id: string;
  source_version_id: string | null;
  title: string;
  body_markdown: string;
  kind: "CLIENT_FACING" | "INTERNAL";
  assigned_at: string;
  assigned_by_admin_email: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by_member_id: string | null;
  archived_at: string | null;
  // Joined practice metadata (admin app only — booking app reads
  // assignments without this join since it already knows its practice).
  practice_name?: string | null;
}

export function useDocumentAssignments(sourceDocumentId: string | undefined) {
  const [assignments, setAssignments] = useState<PracticeDocumentAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!sourceDocumentId) {
      setAssignments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabaseCore
      .from("practice_document")
      .select("*, practice:practice_id(name)")
      .eq("source_document_id", sourceDocumentId)
      .is("archived_at", null)
      .order("assigned_at", { ascending: false });
    if (!error && data) {
      setAssignments(
        (data as (PracticeDocumentAssignment & { practice: { name: string } | null })[]).map(
          (r) => ({ ...r, practice_name: r.practice?.name ?? null }),
        ),
      );
    }
    setLoading(false);
  }, [sourceDocumentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { assignments, loading, reload };
}

interface AssignArgs {
  practiceId: string;
  sourceDocumentId: string;
  sourceVersionId: string | null;
  title: string;
  bodyMarkdown: string;
  kind: "CLIENT_FACING" | "INTERNAL";
}

export async function assignDocumentToPractice(args: AssignArgs): Promise<void> {
  // Stamp the assigning operator's email so practices can see who pushed
  // the doc. Reads the email from the active tenant-registry session.
  const { data: sessionData } = await supabaseRegistry.auth.getSession();
  const operatorEmail = sessionData.session?.user?.email ?? null;

  const { error } = await supabaseCore.from("practice_document").insert({
    practice_id: args.practiceId,
    source_document_id: args.sourceDocumentId,
    source_version_id: args.sourceVersionId,
    title: args.title,
    body_markdown: args.bodyMarkdown,
    kind: args.kind,
    assigned_by_admin_email: operatorEmail,
  });
  if (error) throw error;
}

export async function unassignDocument(assignmentId: string): Promise<void> {
  // Soft-delete via archived_at so we retain the assignment trail for
  // audit / "this practice once had this doc" queries. Hard delete is
  // intentionally not exposed.
  const { error } = await supabaseCore
    .from("practice_document")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) throw error;
}

/**
 * Inverse-direction view: lists every client-facing admin document and
 * marks which are currently assigned to a given practice. Used by the
 * Documents tab on the practice page — bulk-tick UI where the operator
 * works through one practice's needs rather than one doc at a time.
 *
 * Cross-project: docs come from tenant-registry; assignment state from
 * dentaloptima-core. We join in JS by source_document_id.
 */
export interface AssignableDocument {
  // Source doc (admin_document in tenant-registry)
  id: string;
  title: string;
  kind: "CLIENT_FACING" | "INTERNAL";
  status: "DRAFT" | "PUBLISHED";
  updated_at: string;
  // Assignment state for the practice in question — null when not assigned.
  assignment: {
    id: string;
    source_version_id: string | null;
    viewed_at: string | null;
    acknowledged_at: string | null;
  } | null;
}

export function useAssignableDocumentsForPractice(practiceId: string | undefined) {
  const [documents, setDocuments] = useState<AssignableDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!practiceId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Pull both sides in parallel — they don't depend on each other.
    const [docsRes, assignmentsRes] = await Promise.all([
      supabaseRegistry
        .from("admin_document")
        .select("id, title, kind, status, updated_at")
        .eq("kind", "CLIENT_FACING")
        .is("archived_at", null)
        .order("updated_at", { ascending: false }),
      supabaseCore
        .from("practice_document")
        .select("id, source_document_id, source_version_id, viewed_at, acknowledged_at")
        .eq("practice_id", practiceId)
        .is("archived_at", null),
    ]);

    if (docsRes.error || assignmentsRes.error) {
      setLoading(false);
      return;
    }

    // Index assignments by source_document_id for O(1) lookup.
    const assignmentBySource = new Map<
      string,
      {
        id: string;
        source_version_id: string | null;
        viewed_at: string | null;
        acknowledged_at: string | null;
      }
    >();
    for (const a of assignmentsRes.data as Array<{
      id: string;
      source_document_id: string;
      source_version_id: string | null;
      viewed_at: string | null;
      acknowledged_at: string | null;
    }>) {
      assignmentBySource.set(a.source_document_id, {
        id: a.id,
        source_version_id: a.source_version_id,
        viewed_at: a.viewed_at,
        acknowledged_at: a.acknowledged_at,
      });
    }

    setDocuments(
      (docsRes.data as Array<{
        id: string;
        title: string;
        kind: "CLIENT_FACING" | "INTERNAL";
        status: "DRAFT" | "PUBLISHED";
        updated_at: string;
      }>).map((d) => ({
        ...d,
        assignment: assignmentBySource.get(d.id) ?? null,
      })),
    );
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { documents, loading, reload };
}

/**
 * Fetches a single admin_document's current title + body + kind + latest
 * version id. Used when assigning from the practice page — we need the
 * latest published content to freeze onto the practice's copy.
 */
export async function getDocumentForAssignment(documentId: string): Promise<{
  title: string;
  body_markdown: string;
  kind: "CLIENT_FACING" | "INTERNAL";
  latest_version_id: string | null;
} | null> {
  const [docRes, versionRes] = await Promise.all([
    supabaseRegistry
      .from("admin_document")
      .select("title, body_markdown, kind")
      .eq("id", documentId)
      .maybeSingle(),
    supabaseRegistry
      .from("admin_document_version")
      .select("id")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (docRes.error || !docRes.data) return null;
  return {
    title: (docRes.data as { title: string }).title,
    body_markdown: (docRes.data as { body_markdown: string }).body_markdown,
    kind: (docRes.data as { kind: "CLIENT_FACING" | "INTERNAL" }).kind,
    latest_version_id: (versionRes.data as { id: string } | null)?.id ?? null,
  };
}

/**
 * Returns the set of practice IDs that already have this doc assigned
 * (active, not archived). Used to disable already-assigned practices
 * in the picker.
 */
export function useAssignedPracticeIds(sourceDocumentId: string | undefined) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!sourceDocumentId) {
      setIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabaseCore
      .from("practice_document")
      .select("practice_id")
      .eq("source_document_id", sourceDocumentId)
      .is("archived_at", null);
    if (!error && data) {
      setIds(new Set((data as { practice_id: string }[]).map((r) => r.practice_id)));
    }
    setLoading(false);
  }, [sourceDocumentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ids, loading, reload };
}

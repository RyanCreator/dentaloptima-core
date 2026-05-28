import { useCallback, useEffect, useState } from "react";
import { supabaseRegistry as supabase } from "@/integrations/supabase/client";

// admin_document is the Dentaloptima team's own document library:
// SEO service breakdowns, onboarding packs, internal SOPs, etc.
//
// Phase 1 is intentionally simple — single source-of-truth row per doc,
// edited in place. Versioning + per-tenant assignment come in later phases.

export type AdminDocumentKind = "CLIENT_FACING" | "INTERNAL";
export type AdminDocumentStatus = "DRAFT" | "PUBLISHED";

export interface AdminDocument {
  id: string;
  title: string;
  slug: string | null;
  body_markdown: string;
  kind: AdminDocumentKind;
  status: AdminDocumentStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
}

export interface AdminDocumentSummary {
  id: string;
  title: string;
  slug: string | null;
  kind: AdminDocumentKind;
  status: AdminDocumentStatus;
  updated_at: string;
}

export interface AdminDocumentPatch {
  title?: string;
  slug?: string | null;
  body_markdown?: string;
  kind?: AdminDocumentKind;
  status?: AdminDocumentStatus;
}

export interface AdminDocumentInput {
  title: string;
  kind: AdminDocumentKind;
  body_markdown?: string;
  slug?: string | null;
}

export function useAdminDocuments(opts: {
  kind?: AdminDocumentKind | "ALL";
  search?: string;
  showArchived?: boolean;
} = {}) {
  const { kind = "ALL", search = "", showArchived = false } = opts;
  const [documents, setDocuments] = useState<AdminDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("admin_document")
      .select("id, title, slug, kind, status, updated_at")
      .order("updated_at", { ascending: false });

    query = showArchived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);

    if (kind !== "ALL") query = query.eq("kind", kind);

    if (search.trim()) {
      const q = search.trim();
      query = query.ilike("title", `%${q}%`);
    }

    const { data, error } = await query;
    if (!error && data) {
      setDocuments(data as AdminDocumentSummary[]);
    }
    setLoading(false);
  }, [kind, search, showArchived]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { documents, loading, reload };
}

export function useAdminDocument(id: string | undefined) {
  const [doc, setDoc] = useState<AdminDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) {
      setDoc(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("admin_document")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (qErr) {
      setError(qErr.message);
    } else {
      setDoc((data as AdminDocument | null) ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { doc, loading, error, reload };
}

export async function createAdminDocument(input: AdminDocumentInput): Promise<AdminDocument> {
  const { data, error } = await supabase
    .from("admin_document")
    .insert({
      title: input.title,
      kind: input.kind,
      body_markdown: input.body_markdown ?? "",
      slug: input.slug ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AdminDocument;
}

export async function updateAdminDocument(id: string, patch: AdminDocumentPatch): Promise<void> {
  const { error } = await supabase
    .from("admin_document")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function archiveAdminDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from("admin_document")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function unarchiveAdminDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from("admin_document")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAdminDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from("admin_document")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Versions (Phase 2) ───────────────────────────────────────────────
//
// Versions are immutable snapshots taken on every Publish save. Used as
// the change log on the detail page. Reverting copies a snapshot's body
// back into the live row — it doesn't delete newer versions.

export interface AdminDocumentVersion {
  id: string;
  document_id: string;
  title: string;
  body_markdown: string;
  kind: AdminDocumentKind;
  change_summary: string | null;
  created_at: string;
  created_by: string | null;
  // Joined from admin_user.email via created_by. Null if the admin_user
  // row was deleted (FK is ON DELETE SET NULL).
  author_email?: string | null;
}

export function useAdminDocumentVersions(documentId: string | undefined) {
  const [versions, setVersions] = useState<AdminDocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!documentId) {
      setVersions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_document_version")
      .select("*, author:admin_user!created_by(email)")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setVersions(
        (data as (AdminDocumentVersion & { author: { email: string | null } | null })[]).map(
          (r) => ({ ...r, author_email: r.author?.email ?? null }),
        ),
      );
    }
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { versions, loading, reload };
}

/**
 * Publish save: updates the doc + writes a version snapshot atomically.
 * The RPC enforces both happen in one transaction — if the snapshot
 * insert fails (RLS, constraint, etc) the doc update is rolled back too.
 */
export async function publishAdminDocument(args: {
  id: string;
  title: string;
  body_markdown: string;
  kind: AdminDocumentKind;
  slug: string | null;
  change_summary: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("publish_admin_document", {
    p_id: args.id,
    p_title: args.title,
    p_body: args.body_markdown,
    p_kind: args.kind,
    p_slug: args.slug,
    p_change_summary: args.change_summary,
  });
  if (error) throw error;
}

/**
 * Revert: copies a historical version's body+title+kind into the live
 * doc row. Status is forced back to DRAFT so the operator has to make
 * a conscious Publish call to broadcast the revert as a new snapshot.
 */
export async function revertAdminDocumentToVersion(
  documentId: string,
  version: AdminDocumentVersion,
): Promise<void> {
  const { error } = await supabase
    .from("admin_document")
    .update({
      title: version.title,
      body_markdown: version.body_markdown,
      kind: version.kind,
      status: "DRAFT",
    })
    .eq("id", documentId);
  if (error) throw error;
}

// ── Notes (Phase 2) ──────────────────────────────────────────────────

export interface AdminDocumentNote {
  id: string;
  document_id: string;
  body_markdown: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  author_email?: string | null;
}

export function useAdminDocumentNotes(documentId: string | undefined) {
  const [notes, setNotes] = useState<AdminDocumentNote[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!documentId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_document_note")
      .select("*, author:admin_user!created_by(email)")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setNotes(
        (data as (AdminDocumentNote & { author: { email: string | null } | null })[]).map(
          (r) => ({ ...r, author_email: r.author?.email ?? null }),
        ),
      );
    }
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { notes, loading, reload };
}

export async function createAdminDocumentNote(documentId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from("admin_document_note")
    .insert({ document_id: documentId, body_markdown: body });
  if (error) throw error;
}

export async function updateAdminDocumentNote(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from("admin_document_note")
    .update({ body_markdown: body })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAdminDocumentNote(id: string): Promise<void> {
  const { error } = await supabase
    .from("admin_document_note")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Fetches the most-recent version snapshot id for a doc. Used by the
 * assignment flow to record `source_version_id` on the practice copy,
 * so the admin can later detect "this practice is on an outdated
 * version" by comparing against the doc's current latest version.
 *
 * Returns null if the doc has never been published (no versions yet).
 */
export async function getLatestVersionId(documentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("admin_document_version")
    .select("id")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

import { useCallback, useEffect, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

// Direct registry queries — RLS limits all writes/reads to active admins.

export type OutreachContactStatus = "ACTIVE" | "UNSUBSCRIBED" | "BOUNCED" | "COMPLAINED";

// Free-form per-contact metadata — whatever the operator wants to tag along
// at import. Known keys are typed; unknown keys are allowed through.
export interface OutreachContactCustom {
  area?: string | null;
  target_rating?: string | null;
  website?: string | null;
  raw_notes?: string | null;
  [key: string]: unknown;
}

export interface OutreachContact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  practice_name: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  status: OutreachContactStatus;
  status_changed_at: string | null;
  last_emailed_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  archived_at: string | null;
  created_at: string;
  custom: OutreachContactCustom;
}

export interface OutreachContactInput {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  practice_name?: string | null;
  phone?: string | null;
  source?: string | null;
}

export interface OutreachContactPatch {
  first_name?: string | null;
  last_name?: string | null;
  practice_name?: string | null;
  phone?: string | null;
  notes?: string | null;
  custom?: OutreachContactCustom;
}

export async function updateContact(id: string, patch: OutreachContactPatch) {
  const { error } = await supabase
    .from("outreach_contact")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export function useOutreachContacts(opts: {
  status?: OutreachContactStatus | "ALL";
  search?: string;
  page?: number;
  pageSize?: number;
  // showArchived=true shows ONLY archived rows (the "Show archived" toggle).
  // Default behaviour hides them entirely from the list and from the
  // campaign contact-picker.
  showArchived?: boolean;
}) {
  const {
    status = "ALL",
    search = "",
    page = 0,
    pageSize = 100,
    showArchived = false,
  } = opts;
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("outreach_contact")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    query = showArchived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);
    if (status !== "ALL") query = query.eq("status", status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // Search across email + name + practice — keep cheap with ilike on the
      // most-common fields. Phase 3 might want pg_trgm for fuzzy search.
      query = query.or(
        `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,practice_name.ilike.%${q}%`
      );
    }
    const { data, error, count } = await query;
    if (!error && data) {
      setContacts(data as OutreachContact[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [status, search, page, pageSize, showArchived]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { contacts, totalCount, loading, reload };
}

export function useOutreachContactCounts() {
  const [counts, setCounts] = useState<Record<OutreachContactStatus | "ALL", number>>({
    ALL: 0,
    ACTIVE: 0,
    UNSUBSCRIBED: 0,
    BOUNCED: 0,
    COMPLAINED: 0,
  });

  const reload = useCallback(async () => {
    // Counts power the status filter dropdown — only count non-archived
    // so the numbers match what the user actually sees.
    const { data } = await supabase
      .from("outreach_contact")
      .select("status")
      .is("archived_at", null);
    const next: Record<OutreachContactStatus | "ALL", number> = {
      ALL: 0,
      ACTIVE: 0,
      UNSUBSCRIBED: 0,
      BOUNCED: 0,
      COMPLAINED: 0,
    };
    for (const row of (data as { status: OutreachContactStatus }[]) || []) {
      next.ALL++;
      next[row.status]++;
    }
    setCounts(next);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { counts, reload };
}

export interface BulkImportResult {
  inserted: number;
  duplicates: number;
  invalid: number;
  error?: string;
}

// Insert many contacts at once. Dedups by email at the DB level via the
// UNIQUE constraint + ON CONFLICT DO NOTHING so already-present emails stay
// untouched (preserves their status / open history etc).
export async function bulkImportContacts(
  rows: OutreachContactInput[],
  source: string | null
): Promise<BulkImportResult> {
  // Pre-validate: lowercase, trim, drop invalid email shapes. Counts the
  // rejects so the UI can tell the user how many made it.
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalized: OutreachContactInput[] = [];
  let invalid = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase();
    if (!emailRe.test(email)) {
      invalid++;
      continue;
    }
    // De-dup within the batch itself.
    if (seen.has(email)) continue;
    seen.add(email);
    normalized.push({
      email,
      first_name: row.first_name?.trim() || null,
      last_name: row.last_name?.trim() || null,
      practice_name: row.practice_name?.trim() || null,
      phone: row.phone?.trim() || null,
      source: source ?? row.source ?? null,
    });
  }

  if (normalized.length === 0) {
    return { inserted: 0, duplicates: 0, invalid };
  }

  // Upsert with ignoreDuplicates → Postgres does ON CONFLICT (email) DO
  // NOTHING for us. The previous implementation pre-checked existence with
  // .in("email", [...]), which builds a URL query string; at ~500 emails
  // the URL exceeded gateway limits (~17KB vs an 8KB practical cap) and
  // the request hung silently.
  //
  // Returning minimal data ("email") keeps the response small so we can
  // count what actually inserted vs what was skipped as a dupe without
  // asking for the full rows back. Batched in 500s to stay well under
  // any body-size limit.
  let inserted = 0;
  for (let i = 0; i < normalized.length; i += 500) {
    const batch = normalized.slice(i, i + 500);
    const { data, error } = await supabase
      .from("outreach_contact")
      .upsert(batch, { onConflict: "email", ignoreDuplicates: true })
      .select("email");
    if (error) {
      const sofar = inserted;
      return {
        inserted: sofar,
        duplicates: normalized.length - sofar - invalid,
        invalid,
        error: error.message,
      };
    }
    inserted += data?.length ?? 0;
  }
  const duplicates = normalized.length - inserted;

  return { inserted, duplicates, invalid };
}

export async function updateContactStatus(id: string, status: OutreachContactStatus) {
  const { error } = await supabase
    .from("outreach_contact")
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function archiveContact(id: string) {
  const { error } = await supabase
    .from("outreach_contact")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreContact(id: string) {
  const { error } = await supabase
    .from("outreach_contact")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
}

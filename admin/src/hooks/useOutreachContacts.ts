import { useCallback, useEffect, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

// Direct registry queries — RLS limits all writes/reads to active admins.

export type OutreachContactStatus = "ACTIVE" | "UNSUBSCRIBED" | "BOUNCED" | "COMPLAINED";

// Free-form per-contact metadata — whatever the operator wants to tag along
// at import. Known keys are typed; unknown keys are allowed through.
// `website` lived here historically; it's now a first-class column but
// staying in the type keeps old data round-trippable.
export interface OutreachContactCustom {
  area?: string | null;
  target_rating?: string | null;
  raw_notes?: string | null;
  [key: string]: unknown;
}

export interface OutreachContact {
  id: string;
  // Email is no longer required — many practice prospects are added by
  // name + postcode first, with email filled in later.
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  practice_name: string | null;
  // UK postcode of the practice. Primary dedupe key alongside practice_name.
  postcode: string | null;
  website: string | null;
  principal_dentist: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  status: OutreachContactStatus;
  // Operator prospecting workflow tag (free-text). Common values from
  // imported spreadsheets: "Target", "NF", "Closed", corporate-group
  // names (Portman, BUPA, Rodericks, etc.). Distinct from `status`
  // which is for email-deliverability state.
  tag: string | null;
  status_changed_at: string | null;
  last_emailed_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  archived_at: string | null;
  created_at: string;
  custom: OutreachContactCustom;
}

export interface OutreachContactInput {
  practice_name?: string | null;
  postcode?: string | null;
  website?: string | null;
  email?: string | null;
  principal_dentist?: string | null;
  notes?: string | null;
  tag?: string | null;
  // Legacy fields — accepted at import so old CSVs still work, but the
  // new column set is practice-centric.
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  source?: string | null;
}

export interface OutreachContactPatch {
  practice_name?: string | null;
  postcode?: string | null;
  website?: string | null;
  email?: string | null;
  principal_dentist?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  notes?: string | null;
  tag?: string | null;
  custom?: OutreachContactCustom;
}

// Canonical-form a UK postcode for comparison — uppercase, no spaces.
// "M1 1AA" → "M11AA". Matches the DB partial unique index logic.
function normalisePostcode(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "");
}

// Canonical-form a practice name for comparison — lowercase + trimmed.
function normalisePracticeName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/** Key used everywhere we dedupe practices. Returns "" if either field is
 *  missing — caller should treat empty as "no dedupe key". */
function practiceKey(name: string | null | undefined, postcode: string | null | undefined): string {
  const n = normalisePracticeName(name);
  const p = normalisePostcode(postcode);
  if (!n || !p) return "";
  return `${n}|${p}`;
}

export async function updateContact(id: string, patch: OutreachContactPatch) {
  const { error } = await supabase
    .from("outreach_contact")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

// Sort key + a flag telling us whether nulls should sort last (so e.g.
// "never emailed" rows don't bubble to the top when sorting by last_emailed).
export type ContactSortKey =
  | "created_desc"
  | "created_asc"
  | "last_emailed_desc"
  | "last_emailed_asc"
  | "email_asc"
  | "practice_asc";

const SORT_BY_KEY: Record<ContactSortKey, { column: string; ascending: boolean; nullsFirst?: boolean }> = {
  created_desc: { column: "created_at", ascending: false },
  created_asc: { column: "created_at", ascending: true },
  // Oldest emailed first surfaces stale contacts that need follow-up. We
  // explicitly send nullsFirst so "never emailed" rows don't dominate the
  // top of the list.
  last_emailed_asc: { column: "last_emailed_at", ascending: true, nullsFirst: false },
  last_emailed_desc: { column: "last_emailed_at", ascending: false, nullsFirst: false },
  email_asc: { column: "email", ascending: true },
  practice_asc: { column: "practice_name", ascending: true, nullsFirst: false },
};

// Sentinel values for the `tag` filter beyond a specific string match.
//   "ALL"        — don't filter by tag
//   "UNTAGGED"   — only rows where tag IS NULL
//   any other    — exact match against the tag column
export type TagFilter = "ALL" | "UNTAGGED" | string;

export function useOutreachContacts(opts: {
  status?: OutreachContactStatus | "ALL";
  search?: string;
  tag?: TagFilter;
  page?: number;
  pageSize?: number;
  sortBy?: ContactSortKey;
  // showArchived=true shows ONLY archived rows (the "Show archived" toggle).
  // Default behaviour hides them entirely from the list and from the
  // campaign contact-picker.
  showArchived?: boolean;
}) {
  const {
    status = "ALL",
    search = "",
    tag = "ALL",
    page = 0,
    pageSize = 100,
    sortBy = "created_desc",
    showArchived = false,
  } = opts;
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const sortConfig = SORT_BY_KEY[sortBy];
    let query = supabase
      .from("outreach_contact")
      .select("*", { count: "exact" })
      .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: sortConfig.nullsFirst })
      .range(from, to);
    query = showArchived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);
    if (status !== "ALL") query = query.eq("status", status);
    if (tag === "UNTAGGED") {
      query = query.is("tag", null);
    } else if (tag !== "ALL") {
      query = query.eq("tag", tag);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // Search across the practice-prospect identity fields: name,
      // postcode, principal dentist, plus email/website for find-by-URL.
      query = query.or(
        `practice_name.ilike.%${q}%,postcode.ilike.%${q}%,principal_dentist.ilike.%${q}%,email.ilike.%${q}%,website.ilike.%${q}%`
      );
    }
    const { data, error, count } = await query;
    if (!error && data) {
      setContacts(data as OutreachContact[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [status, search, tag, page, pageSize, sortBy, showArchived]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { contacts, totalCount, loading, reload };
}

export interface ContactCounts {
  ALL: number;
  ACTIVE: number;
  UNSUBSCRIBED: number;
  BOUNCED: number;
  COMPLAINED: number;
  ARCHIVED: number;
}

// Returns the set of distinct, non-null `tag` values currently in active
// contacts. Used to populate the tag-filter dropdown in the list view and
// the campaign recipient picker. Refresh manually after import or edit.
export function useOutreachContactTags() {
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    // No DISTINCT in PostgREST — fetch the column and dedupe client-side.
    // Practical at the scale we run at; if the contacts table ever grows
    // past 10k+ we'd move this to a server-side RPC returning distinct
    // values.
    const { data, error } = await supabase
      .from("outreach_contact")
      .select("tag")
      .is("archived_at", null)
      .not("tag", "is", null);
    if (!error && data) {
      const set = new Set<string>();
      for (const row of data as { tag: string | null }[]) {
        if (row.tag && row.tag.trim()) set.add(row.tag);
      }
      setTags(Array.from(set).sort((a, b) => a.localeCompare(b)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tags, loading, reload };
}

export function useOutreachContactCounts() {
  const [counts, setCounts] = useState<ContactCounts>({
    ALL: 0,
    ACTIVE: 0,
    UNSUBSCRIBED: 0,
    BOUNCED: 0,
    COMPLAINED: 0,
    ARCHIVED: 0,
  });

  const reload = useCallback(async () => {
    // Two parallel count queries — non-archived (everything except ARCHIVED
    // pill) and archived-only (ARCHIVED pill). Done as two HEAD requests so
    // we don't drag rows we don't render.
    const [active, archived] = await Promise.all([
      supabase
        .from("outreach_contact")
        .select("status")
        .is("archived_at", null),
      supabase
        .from("outreach_contact")
        .select("id", { count: "exact", head: true })
        .not("archived_at", "is", null),
    ]);
    const next: ContactCounts = {
      ALL: 0,
      ACTIVE: 0,
      UNSUBSCRIBED: 0,
      BOUNCED: 0,
      COMPLAINED: 0,
      ARCHIVED: archived.count ?? 0,
    };
    for (const row of (active.data as { status: OutreachContactStatus }[]) || []) {
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

// Insert many contacts at once. Dedupe key is (practice_name, postcode) —
// matches the DB partial unique index added in 0044. We pre-query existing
// rows to skip duplicates *before* inserting, which lets us report exact
// duplicate counts without depending on `ignoreDuplicates` round-trips.
export async function bulkImportContacts(
  rows: OutreachContactInput[],
  source: string | null
): Promise<BulkImportResult> {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Within-batch dedupe + validation. A row is valid if it has at least
  // a practice_name and a postcode — that's the new primary identity.
  // Email is no longer required at all.
  const normalised: OutreachContactInput[] = [];
  let invalid = 0;
  const seenInBatch = new Set<string>();
  for (const row of rows) {
    const practiceName = row.practice_name?.trim() || null;
    const postcode = (row.postcode ?? "").trim() || null;
    const email = row.email?.trim().toLowerCase() || null;

    // Hard requirement — without a name we have no way to identify a row
    // or dedupe it. Without a postcode we can't dedupe at all. Both must
    // be present.
    if (!practiceName || !postcode) {
      invalid++;
      continue;
    }
    // Email is optional, but if present it must be well-formed.
    if (email && !emailRe.test(email)) {
      invalid++;
      continue;
    }

    const key = practiceKey(practiceName, postcode);
    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);

    normalised.push({
      practice_name: practiceName,
      postcode,
      website: row.website?.trim() || null,
      email,
      principal_dentist: row.principal_dentist?.trim() || null,
      notes: row.notes?.trim() || null,
      tag: row.tag?.trim() || null,
      // Legacy fields — keep passing them through if the CSV has them.
      first_name: row.first_name?.trim() || null,
      last_name: row.last_name?.trim() || null,
      phone: row.phone?.trim() || null,
      source: source ?? row.source ?? null,
    });
  }

  if (normalised.length === 0) {
    return { inserted: 0, duplicates: 0, invalid };
  }

  // Pre-query existing (practice_name, postcode) pairs so we can skip
  // them. Done in batches because we ask for the active set in one shot
  // — practical for the ~500-row imports the UI sends; if we scale to
  // 10k+ we'd switch to a server-side RPC.
  //
  // We fetch *all* active rows by name in batches and filter by the
  // postcode client-side. PostgREST's `.in("practice_name", [...])` builds
  // a URL, so we batch the IN list to stay under URL caps.
  const allKeys = new Set<string>();
  const names = Array.from(new Set(normalised.map((r) => r.practice_name!).filter(Boolean)));
  for (let i = 0; i < names.length; i += 200) {
    const batch = names.slice(i, i + 200);
    const { data, error } = await supabase
      .from("outreach_contact")
      .select("practice_name, postcode")
      .is("archived_at", null)
      .in("practice_name", batch);
    if (error) {
      return { inserted: 0, duplicates: 0, invalid, error: error.message };
    }
    for (const row of (data as { practice_name: string | null; postcode: string | null }[]) ?? []) {
      const k = practiceKey(row.practice_name, row.postcode);
      if (k) allKeys.add(k);
    }
  }

  const toInsert = normalised.filter((r) => !allKeys.has(practiceKey(r.practice_name, r.postcode)));
  const skippedAsDuplicates = normalised.length - toInsert.length;

  if (toInsert.length === 0) {
    return { inserted: 0, duplicates: skippedAsDuplicates, invalid };
  }

  // Plain insert (not upsert). The DB partial unique index is the safety
  // net for a race; on conflict we get an error which we surface — much
  // rarer than the duplicate-prevention pre-check above.
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { data, error } = await supabase
      .from("outreach_contact")
      .insert(batch)
      .select("id");
    if (error) {
      return {
        inserted,
        duplicates: skippedAsDuplicates,
        invalid,
        error: error.message,
      };
    }
    inserted += data?.length ?? 0;
  }

  return { inserted, duplicates: skippedAsDuplicates, invalid };
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

// Fetch ALL contacts matching either a filter set OR a list of ids,
// batched in 1000s to clear PostgREST's max_rows cap. Used by the CSV
// exporter — the on-screen list view is paginated at 100/page, but the
// operator wants to export the whole set, not just the page they're
// looking at.
export async function fetchAllContacts(opts: {
  status?: OutreachContactStatus | "ALL";
  search?: string;
  showArchived?: boolean;
  // If supplied, ids takes precedence over filter args. Used for the
  // "Export N selected" bulk action.
  ids?: string[];
}): Promise<OutreachContact[]> {
  const PAGE = 1000;
  const all: OutreachContact[] = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("outreach_contact")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (opts.ids) {
      // ids take precedence — straight selection export, no other filters.
      if (opts.ids.length === 0) return [];
      q = q.in("id", opts.ids);
    } else {
      q = opts.showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
      if (opts.status && opts.status !== "ALL") q = q.eq("status", opts.status);
      if (opts.search?.trim()) {
        const s = opts.search.trim().toLowerCase();
        q = q.or(
          `practice_name.ilike.%${s}%,postcode.ilike.%${s}%,principal_dentist.ilike.%${s}%,email.ilike.%${s}%,website.ilike.%${s}%`,
        );
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as OutreachContact[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

// One-shot single-contact insert. Dedupe-23505 messaging tells the operator
// which of the two unique indexes fired — the practice+postcode key is
// the primary identity now, but the email-unique still applies when an
// email is set.
export async function createContact(input: OutreachContactInput): Promise<OutreachContact> {
  const practiceName = input.practice_name?.trim() || null;
  const postcode = (input.postcode ?? "").trim() || null;
  if (!practiceName) throw new Error("Practice name is required");
  if (!postcode)     throw new Error("Postcode is required");

  const email = input.email?.trim().toLowerCase() || null;
  if (email) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) throw new Error("Invalid email address");
  }

  const { data, error } = await supabase
    .from("outreach_contact")
    .insert({
      practice_name: practiceName,
      postcode,
      website: input.website?.trim() || null,
      email,
      principal_dentist: input.principal_dentist?.trim() || null,
      notes: input.notes?.trim() || null,
      // Legacy fields stay accepted so older callers don't break.
      first_name: input.first_name?.trim() || null,
      last_name: input.last_name?.trim() || null,
      phone: input.phone?.trim() || null,
      source: input.source?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      // Distinguish the two unique constraints so the message is useful.
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("uniq_outreach_practice_postcode")) {
        throw new Error(`A contact for "${practiceName}" at ${postcode} already exists`);
      }
      if (msg.includes("uniq_outreach_email") && email) {
        throw new Error(`A contact with email ${email} already exists`);
      }
      throw new Error("A contact with these details already exists");
    }
    throw error;
  }
  return data as OutreachContact;
}

// Bulk operations for the new selection UI. Both go through a single UPDATE
// with .in("id", ids) so it's one round-trip regardless of selection size.

export async function bulkArchiveContacts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from("outreach_contact")
    .update({ archived_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids);
  if (error) throw error;
  return count ?? ids.length;
}

export async function bulkUpdateContactStatus(
  ids: string[],
  status: OutreachContactStatus,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from("outreach_contact")
    .update(
      { status, status_changed_at: new Date().toISOString() },
      { count: "exact" },
    )
    .in("id", ids);
  if (error) throw error;
  return count ?? ids.length;
}

import { useCallback, useEffect, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

/** Lightweight fetch of all active templates. Used by the Contacts
 *  page's "Add to campaign" dropdown so the operator can start a new
 *  campaign with a chosen template + the selected contacts in one go. */
export async function fetchActiveTemplates(): Promise<OutreachTemplate[]> {
  const { data, error } = await supabase
    .from("outreach_template")
    .select("*")
    .is("archived_at", null)
    .order("last_used_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as OutreachTemplate[];
}

export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export function useOutreachTemplates(opts: { showArchived?: boolean } = {}) {
  const { showArchived = false } = opts;
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("outreach_template")
      .select("*")
      .order("last_used_at", { ascending: false, nullsFirst: false });
    if (!showArchived) query = query.is("archived_at", null);
    const { data } = await query;
    setTemplates((data as OutreachTemplate[]) || []);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { templates, loading, reload };
}

// Fetch a single template by id. Used by the editor route at
// /outreach/templates/:id — list-view doesn't have all the data we need
// for editing (it doesn't matter today, but we'd rather decouple the two).
export function useTemplate(id: string | undefined) {
  const [template, setTemplate] = useState<OutreachTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setTemplate(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("outreach_template")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setTemplate((data as OutreachTemplate) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { template, loading };
}

// Stats for the header counts strip: total active + archived.
export function useTemplateCounts() {
  const [counts, setCounts] = useState({ active: 0, archived: 0 });
  const reload = useCallback(async () => {
    const [activeQ, archivedQ] = await Promise.all([
      supabase
        .from("outreach_template")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null),
      supabase
        .from("outreach_template")
        .select("id", { count: "exact", head: true })
        .not("archived_at", "is", null),
    ]);
    setCounts({ active: activeQ.count ?? 0, archived: archivedQ.count ?? 0 });
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { counts, reload };
}

export interface TemplateInput {
  name: string;
  subject: string;
  body_text: string;
  description?: string | null;
}

export async function upsertTemplate(input: TemplateInput, id?: string): Promise<OutreachTemplate> {
  if (id) {
    const { data, error } = await supabase
      .from("outreach_template")
      .update({
        name: input.name.trim(),
        subject: input.subject.trim(),
        body_text: input.body_text,
        description: input.description?.trim() || null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as OutreachTemplate;
  }
  const { data, error } = await supabase
    .from("outreach_template")
    .insert({
      name: input.name.trim(),
      subject: input.subject.trim(),
      body_text: input.body_text,
      description: input.description?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OutreachTemplate;
}

export async function archiveTemplate(id: string) {
  const { error } = await supabase
    .from("outreach_template")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreTemplate(id: string) {
  const { error } = await supabase
    .from("outreach_template")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
}

// Render a template body or subject by substituting {variables} from a
// contact-shaped object. This MUST stay in lockstep with the send worker
// (tenant-registry `send-outreach-email`) so the preview matches what actually
// gets sent. `custom` exposes any per-contact custom fields as {their_key}.
export interface ContactShape {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  practice_name?: string | null;
  phone?: string | null;
  principal_dentist?: string | null;
  postcode?: string | null;
  website?: string | null;
  custom?: Record<string, unknown> | null;
}

// Standard field getters. Return null/empty when missing so callers can detect
// a gap. {name} falls back to the principal dentist for practice-centric
// contacts that have no personal first/last name.
const FIELD_GETTERS: Record<string, (c: ContactShape) => string | null | undefined> = {
  email: (c) => c.email,
  first_name: (c) => c.first_name,
  last_name: (c) => c.last_name,
  name: (c) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.principal_dentist,
  practice_name: (c) => c.practice_name,
  phone: (c) => c.phone,
  principal_dentist: (c) => c.principal_dentist,
  postcode: (c) => c.postcode,
  website: (c) => c.website,
};

// Resolve a single {token}: a standard field, then a custom field, else
// undefined (unknown token / typo).
function resolveToken(c: ContactShape, key: string): string | null | undefined {
  if (key in FIELD_GETTERS) return FIELD_GETTERS[key](c);
  const cv = c.custom?.[key];
  if (cv != null && String(cv).trim() !== "") return String(cv);
  if (c.custom && key in c.custom) return null; // present but empty
  return undefined; // unknown
}

export function renderTemplate(text: string, contact: ContactShape): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const val = resolveToken(contact, key);
    // Mirror the worker: unfilled tokens stay literal in the preview so the
    // operator can see the gap (the worker then skips that send entirely).
    return val != null && String(val).trim() !== "" ? String(val) : match;
  });
}

// The set of {tokens} in a template that can't be filled for this contact —
// either empty values or unknown tokens. The send worker SKIPS any recipient
// with a non-empty result, so they never receive a half-filled email.
export function missingTokens(text: string, contact: ContactShape): string[] {
  const missing = new Set<string>();
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    const val = resolveToken(contact, m[1]);
    if (val == null || String(val).trim() === "") missing.add(m[1]);
  }
  return [...missing];
}

export const TEMPLATE_VARIABLES = [
  { token: "{name}", desc: "Contact name (first+last, or principal dentist)" },
  { token: "{first_name}", desc: "Recipient's first name" },
  { token: "{last_name}", desc: "Recipient's last name" },
  { token: "{principal_dentist}", desc: "Principal dentist's name" },
  { token: "{practice_name}", desc: "Practice / company name" },
  { token: "{postcode}", desc: "Practice postcode" },
  { token: "{website}", desc: "Practice website" },
  { token: "{phone}", desc: "Phone number" },
  { token: "{email}", desc: "Email address" },
];

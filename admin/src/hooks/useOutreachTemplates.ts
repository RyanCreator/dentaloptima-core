import { useCallback, useEffect, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

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
// contact-shaped object. Unknown variables are left as-is so the user
// notices the typo instead of getting silently empty output.
export interface ContactShape {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  practice_name?: string | null;
  phone?: string | null;
}

export function renderTemplate(text: string, contact: ContactShape): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    switch (key) {
      case "email": return contact.email;
      case "first_name": return contact.first_name ?? "";
      case "last_name": return contact.last_name ?? "";
      case "name": return [contact.first_name, contact.last_name].filter(Boolean).join(" ");
      case "practice_name": return contact.practice_name ?? "";
      case "phone": return contact.phone ?? "";
      default: return match;
    }
  });
}

export const TEMPLATE_VARIABLES = [
  { token: "{first_name}", desc: "Recipient's first name" },
  { token: "{last_name}", desc: "Recipient's last name" },
  { token: "{name}", desc: "First + last together" },
  { token: "{practice_name}", desc: "Practice / company name" },
  { token: "{phone}", desc: "Phone number" },
  { token: "{email}", desc: "Email address" },
];

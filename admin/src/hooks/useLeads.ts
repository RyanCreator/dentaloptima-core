import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

const QUERY_KEY = ["marketing_leads"] as const;

export type LeadStatus = "NEW" | "CONTACTED" | "CONVERTED" | "ARCHIVED";

export interface Lead {
  id: string;
  name: string;
  email: string;
  message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: LeadStatus;
  notes: string | null;
  converted_to_tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useLeads() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("marketing_lead")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  // Realtime — new leads land via the contact form; updates land when an
  // operator marks contacted/converted. Either way, refresh the cache so
  // the page reflects state without a manual reload.
  useEffect(() => {
    const channel = supabase
      .channel(`marketing-leads-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "marketing_lead" },
        () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

// Count-only query for the sidebar badge — fires every minute so a freshly
// submitted lead lights the dot without a page refresh, and uses head:true
// so the body is empty (cheap to repeat).
export function useNewLeadsCount() {
  return useQuery({
    queryKey: ["marketing_leads", "new-count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("marketing_lead")
        .select("id", { count: "exact", head: true })
        .eq("status", "NEW");
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Lead, "status" | "notes" | "converted_to_tenant_id">>;
    }) => {
      const { data, error } = await supabase
        .from("marketing_lead")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

// Bulk operations — both go through a single UPDATE with .in("id", ids)
// so it's one round-trip regardless of selection size.

export async function bulkUpdateLeadStatus(
  ids: string[],
  status: LeadStatus,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from("marketing_lead")
    .update({ status }, { count: "exact" })
    .in("id", ids);
  if (error) throw error;
  return count ?? ids.length;
}

// Called from the tenant-creation flow when a lead is converted via
// ?fromLead=…&name=…&email=…. Marks the lead CONVERTED and links it to
// the freshly-created practice. Best-effort — failures are surfaced to
// the caller but don't block tenant creation.
export async function markLeadConverted(leadId: string, practiceId: string): Promise<void> {
  const { error } = await supabase
    .from("marketing_lead")
    .update({ status: "CONVERTED", converted_to_tenant_id: practiceId })
    .eq("id", leadId);
  if (error) throw error;
}

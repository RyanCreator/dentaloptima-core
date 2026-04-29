import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

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
  return useQuery({
    queryKey: ["marketing_leads"],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("marketing_lead")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing_leads"] }),
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, OPERATOR_TOKEN } from "@/integrations/supabase/client";

export type PracticeStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "OFFBOARDED";

export interface Practice {
  id: string;
  name: string;
  slug: string;
  status: PracticeStatus;
  plan: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  city: string | null;
  postcode: string | null;
  country: string;
  timezone: string;
  nhs_contract_number: string | null;
  cqc_provider_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function useTenants() {
  return useQuery({
    queryKey: ["practices"],
    queryFn: async (): Promise<Practice[]> => {
      const { data, error } = await supabase
        .from("practice")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Practice[];
    },
  });
}

export function useTenant(id: string | undefined) {
  return useQuery({
    queryKey: ["practice", id],
    enabled: !!id,
    queryFn: async (): Promise<Practice | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("practice")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Practice | null;
    },
  });
}

export interface CreatePracticeInput {
  practice_name: string;
  slug: string;
  owner_email: string;
  owner_full_name: string;
  trial_days?: number;
  redirect_to?: string;
}

export interface CreatePracticeResult {
  practice_id: string;
  slug: string;
  owner_user_id: string;
  trial_ends_at: string;
  message: string;
}

// Calls the create-practice-with-owner edge function. The operator token is
// sent in a custom header (the function does its own auth check).
export function useCreatePractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePracticeInput): Promise<CreatePracticeResult> => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-practice-with-owner`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-operator-token": OPERATOR_TOKEN,
        },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to create practice");
      }
      return json as CreatePracticeResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["practices"] }),
  });
}

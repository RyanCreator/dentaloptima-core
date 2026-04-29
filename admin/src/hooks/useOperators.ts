import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Operator {
  id: string;
  email: string;
  full_name: string;
  is_operator: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

export function useOperators() {
  return useQuery({
    queryKey: ["operators"],
    queryFn: async (): Promise<Operator[]> => {
      const { data, error } = await supabase.rpc("list_operators");
      if (error) throw error;
      return (data ?? []) as Operator[];
    },
  });
}

export interface SetOperatorInput {
  email: string;
  is_operator: boolean;
  full_name?: string;
}

export function useSetOperatorRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetOperatorInput) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/set-operator-role`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operators"] }),
  });
}

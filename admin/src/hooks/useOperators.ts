import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseRegistry } from "@/integrations/supabase/client";

// Operator list is now sourced from tenant-registry's admin_user table
// (instead of the old list_operators() RPC in dentaloptima-core that
// depended on auth.users.raw_app_meta_data.is_operator). The two-DB
// architecture means tenant-registry's auth.users IS the operator-auth
// directory; admin_user is the in-app row that gates active access.

export interface Operator {
  id: string;
  user_id: string;
  email: string;
  active: boolean;
  created_at: string;
  // Kept on the type for backwards-compat with existing UI code that
  // referenced the older shape — derived from `active`.
  is_operator: boolean;
}

export function useOperators() {
  return useQuery({
    queryKey: ["operators"],
    queryFn: async (): Promise<Operator[]> => {
      const { data, error } = await supabaseRegistry
        .from("admin_user")
        .select("id, user_id, email, active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        email: row.email as string,
        active: row.active as boolean,
        created_at: row.created_at as string,
        is_operator: row.active as boolean,
      }));
    },
  });
}

export interface SetOperatorInput {
  email: string;
  // Whether to grant or revoke. Drives whether admin_user.active is set
  // to true / false (or a new admin_user row is created).
  is_operator: boolean;
  full_name?: string;
  // Optional. When provided (and is_operator=true and the user doesn't yet
  // exist), the edge function calls auth.admin.createUser instead of
  // sending a magic-link invite. Min length is enforced server-side at 12.
  password?: string;
}

// set-operator-role is an edge function on tenant-registry (NOT
// dentaloptima-core) since admin_user lives there. It uses tenant-registry's
// service-role key to do auth.admin.* + admin_user upserts.
export function useSetOperatorRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetOperatorInput) => {
      const { data: sessionData } = await supabaseRegistry.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const registryUrl = import.meta.env.VITE_REGISTRY_SUPABASE_URL;
      const registryAnonKey = import.meta.env.VITE_REGISTRY_SUPABASE_ANON_KEY;
      const url = `${registryUrl}/functions/v1/set-operator-role`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: registryAnonKey,
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

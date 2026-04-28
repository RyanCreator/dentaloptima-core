import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuditKind = "GENERIC" | "CLINICAL";

export interface AuditEntry {
  id: string;
  kind: AuditKind;
  practice_id: string | null;
  patient_id: string | null;
  performed_by_id: string | null;
  performed_by_email: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string;
  before_data: unknown;
  after_data: unknown;
  context: string | null;
  performed_at: string;
}

// Combines public.audit + public.clinical_audit into one stream, newest first.
// Operators see all rows (RLS allows via is_operator()); practice members only
// see their own practice's rows.
export function useAuditLog(limit = 200) {
  return useQuery({
    queryKey: ["audit-log", limit],
    queryFn: async (): Promise<AuditEntry[]> => {
      const half = Math.ceil(limit / 2);
      const [generic, clinical] = await Promise.all([
        supabase
          .from("audit")
          .select("*")
          .order("performed_at", { ascending: false })
          .limit(half),
        supabase
          .from("clinical_audit")
          .select("*")
          .order("performed_at", { ascending: false })
          .limit(half),
      ]);
      if (generic.error) throw generic.error;
      if (clinical.error) throw clinical.error;
      const merged: AuditEntry[] = [
        ...(generic.data ?? []).map((r: any) => ({ ...r, kind: "GENERIC" as const, patient_id: null })),
        ...(clinical.data ?? []).map((r: any) => ({ ...r, kind: "CLINICAL" as const })),
      ];
      merged.sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));
      return merged.slice(0, limit);
    },
    refetchInterval: 60_000,
  });
}

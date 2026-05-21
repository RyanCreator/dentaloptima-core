import { useQuery } from "@tanstack/react-query";
import { supabaseCore } from "@/integrations/supabase/client";

// Combines public.audit + public.clinical_audit into one stream, newest first.
// Service role bypasses the per-practice RLS so operators see all rows.

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

export interface AuditQueryOptions {
  limit?: number;
  fromDate?: string | null;
  toDate?: string | null;
  practiceId?: string | null;
}

// limit is split half-and-half between the two tables, then merged + re-sorted
// client-side. Acceptable up to a few thousand; beyond that, real cursor
// pagination is the right fix.
export function useAuditLog(opts: AuditQueryOptions | number = {}) {
  // Backwards-compat: useAuditLog(10) keeps working for the Overview page.
  const { limit = 200, fromDate = null, toDate = null, practiceId = null } =
    typeof opts === "number" ? { limit: opts } : opts;

  return useQuery({
    queryKey: ["audit-log", limit, fromDate, toDate, practiceId],
    queryFn: async (): Promise<AuditEntry[]> => {
      const half = Math.ceil(limit / 2);

      const buildQuery = (table: "audit" | "clinical_audit") => {
        let q = supabaseCore
          .from(table)
          .select("*")
          .order("performed_at", { ascending: false })
          .limit(half);
        if (fromDate) q = q.gte("performed_at", fromDate);
        if (toDate) q = q.lt("performed_at", toDate);
        if (practiceId) q = q.eq("practice_id", practiceId);
        return q;
      };

      const [generic, clinical] = await Promise.all([
        buildQuery("audit"),
        buildQuery("clinical_audit"),
      ]);
      if (generic.error) throw generic.error;
      if (clinical.error) throw clinical.error;
      const merged: AuditEntry[] = [
        ...(generic.data ?? []).map((r: Record<string, unknown>) => ({
          ...(r as object),
          kind: "GENERIC" as const,
          patient_id: null,
        }) as AuditEntry),
        ...(clinical.data ?? []).map((r: Record<string, unknown>) => ({
          ...(r as object),
          kind: "CLINICAL" as const,
        }) as AuditEntry),
      ];
      merged.sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));
      return merged.slice(0, limit);
    },
    refetchInterval: 60_000,
  });
}

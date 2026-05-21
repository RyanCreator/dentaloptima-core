import { useQuery } from "@tanstack/react-query";
import { supabaseCore } from "@/integrations/supabase/client";
import type { AuditEntry } from "./useAuditLog";

// Per-practice audit + usage. Service role bypasses RLS so operators see
// across-tenant data without going through edge functions.

export function useTenantActivity(practiceId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ["tenant-activity", practiceId, limit],
    enabled: !!practiceId,
    queryFn: async (): Promise<AuditEntry[]> => {
      if (!practiceId) return [];
      const half = Math.ceil(limit / 2);
      const [generic, clinical] = await Promise.all([
        supabaseCore
          .from("audit")
          .select("*")
          .eq("practice_id", practiceId)
          .order("performed_at", { ascending: false })
          .limit(half),
        supabaseCore
          .from("clinical_audit")
          .select("*")
          .eq("practice_id", practiceId)
          .order("performed_at", { ascending: false })
          .limit(half),
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

export interface TenantUsageStats {
  patients: number;
  appointments_30d: number;
  open_incidents: number;
}

export function useTenantUsage(practiceId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-usage", practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<TenantUsageStats> => {
      if (!practiceId) return { patients: 0, appointments_30d: 0, open_incidents: 0 };
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [patients, appts, incidents] = await Promise.all([
        supabaseCore
          .from("patient")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", practiceId)
          .is("deleted_at", null),
        supabaseCore
          .from("appointment")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", practiceId)
          .is("deleted_at", null)
          .gte("starts_at", since),
        supabaseCore
          .from("incident_report")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", practiceId)
          .is("deleted_at", null)
          .in("status", ["REPORTED", "UNDER_INVESTIGATION", "ACTION_REQUIRED"]),
      ]);
      return {
        patients: patients.count ?? 0,
        appointments_30d: appts.count ?? 0,
        open_incidents: incidents.count ?? 0,
      };
    },
  });
}

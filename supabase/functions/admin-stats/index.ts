// admin-stats edge function
//
// Cross-DB analytics reads from dentaloptima-core. Operators have no auth
// identity in core, so reads go through this function which verifies
// the operator's tenant-registry JWT and uses service-role to query.
//
// Actions:
//   - audit_list:  merged stream of public.audit + public.clinical_audit
//   - tenant_usage: per-practice counts (patients, appointments_30d, open incidents)
//   - overview_core: platform-wide counts the Overview page needs from core
//                    (practices by status, patients, appointments, incidents,
//                    expiring trials in next 7 days, list of next 5 expiring)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { verifyOperator } from "../_shared/verify-operator.ts";

interface BaseAction { action: string }

type Action =
  | {
      action: "audit_list";
      limit?: number;
      from_date?: string | null;
      to_date?: string | null;
      practice_id?: string | null;
    }
  | { action: "tenant_usage"; practice_id: string }
  | { action: "overview_core" };

interface AuditRow {
  id: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req), status: 204 });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  const auth = await verifyOperator(req);
  if (auth instanceof Response) return auth;

  let body: BaseAction;
  try {
    body = (await req.json()) as BaseAction;
  } catch {
    return jsonResponse(req, { error: "Invalid JSON body" }, 400);
  }

  const coreUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!coreUrl || !serviceRole) {
    return jsonResponse(req, { error: "Edge function not configured" }, 500);
  }
  const core = createClient(coreUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await dispatch(core, body as Action);
    return jsonResponse(req, result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin-stats] failed", body.action, message);
    return jsonResponse(req, { error: message }, 500);
  }
});

async function dispatch(
  core: ReturnType<typeof createClient>,
  action: Action,
): Promise<unknown> {
  switch (action.action) {
    case "audit_list": {
      const limit = Math.min(action.limit ?? 200, 1000);
      const half = Math.ceil(limit / 2);
      const buildQuery = (table: "audit" | "clinical_audit") => {
        let q = core
          .from(table)
          .select("*")
          .order("performed_at", { ascending: false })
          .limit(half);
        if (action.from_date) q = q.gte("performed_at", action.from_date);
        if (action.to_date) q = q.lt("performed_at", action.to_date);
        if (action.practice_id) q = q.eq("practice_id", action.practice_id);
        return q;
      };
      const [generic, clinical] = await Promise.all([
        buildQuery("audit"),
        buildQuery("clinical_audit"),
      ]);
      if (generic.error) throw generic.error;
      if (clinical.error) throw clinical.error;
      const merged = [
        ...((generic.data ?? []) as AuditRow[]).map((r) => ({
          ...r,
          kind: "GENERIC" as const,
          patient_id: null,
        })),
        ...((clinical.data ?? []) as AuditRow[]).map((r) => ({
          ...r,
          kind: "CLINICAL" as const,
        })),
      ];
      merged.sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));
      return { entries: merged.slice(0, limit) };
    }

    case "tenant_usage": {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [patients, appts, incidents] = await Promise.all([
        core
          .from("patient")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", action.practice_id)
          .is("deleted_at", null),
        core
          .from("appointment")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", action.practice_id)
          .is("deleted_at", null)
          .gte("starts_at", since),
        core
          .from("incident_report")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", action.practice_id)
          .is("deleted_at", null)
          .in("status", ["REPORTED", "UNDER_INVESTIGATION", "ACTION_REQUIRED"]),
      ]);
      if (patients.error) throw patients.error;
      if (appts.error) throw appts.error;
      if (incidents.error) throw incidents.error;
      return {
        patients: patients.count ?? 0,
        appointments_30d: appts.count ?? 0,
        open_incidents: incidents.count ?? 0,
      };
    }

    case "overview_core": {
      // 7 parallel head-counts + a list query for the trial pipeline.
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();
      const in7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        practiceStatuses,
        patients,
        appts,
        incidents,
        expiringTrials,
        upcomingTrialList,
      ] = await Promise.all([
        core.from("practice").select("status").is("deleted_at", null),
        core
          .from("patient")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        core
          .from("appointment")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("starts_at", since30d),
        core
          .from("incident_report")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .in("status", ["REPORTED", "UNDER_INVESTIGATION", "ACTION_REQUIRED"]),
        core
          .from("practice")
          .select("id", { count: "exact", head: true })
          .eq("status", "TRIAL")
          .is("deleted_at", null)
          .gte("trial_ends_at", nowIso)
          .lte("trial_ends_at", in7d),
        core
          .from("practice")
          .select("id, name, trial_ends_at")
          .eq("status", "TRIAL")
          .is("deleted_at", null)
          .not("trial_ends_at", "is", null)
          .order("trial_ends_at", { ascending: true })
          .limit(5),
      ]);

      if (practiceStatuses.error) throw practiceStatuses.error;
      if (patients.error) throw patients.error;
      if (appts.error) throw appts.error;
      if (incidents.error) throw incidents.error;
      if (expiringTrials.error) throw expiringTrials.error;
      if (upcomingTrialList.error) throw upcomingTrialList.error;

      const rows = (practiceStatuses.data ?? []) as { status: string }[];
      return {
        total_practices: rows.length,
        active_practices: rows.filter((p) => p.status === "ACTIVE").length,
        trial_practices: rows.filter((p) => p.status === "TRIAL").length,
        total_patients: patients.count ?? 0,
        appointments_last_30d: appts.count ?? 0,
        open_incidents: incidents.count ?? 0,
        expiring_trials_7d: expiringTrials.count ?? 0,
        upcoming_trials: upcomingTrialList.data ?? [],
      };
    }

    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unknown action: ${(exhaustiveCheck as { action: string }).action}`);
    }
  }
}

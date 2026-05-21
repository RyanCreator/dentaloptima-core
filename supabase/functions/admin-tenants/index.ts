// admin-tenants edge function
//
// Cross-DB bridge: tenant-registry-authed operators reach
// dentaloptima-core's `practice` and `practice_member` tables here.
//
// Auth: operator's tenant-registry JWT in `Authorization: Bearer ...`.
// Verified by _shared/verify-operator.ts which calls back to
// tenant-registry's /auth/v1/user endpoint and confirms an active
// admin_user row.
//
// Operations are switched on the body's `action` field. We use a single
// edge function with an action enum (rather than N HTTP endpoints)
// because it's easier to deploy + log + maintain for an operator-only
// surface where every action runs the same auth check.
//
// Service-role key is used for the actual DB work — operators have no
// user-level identity in dentaloptima-core, so RLS would otherwise lock
// them out of every tenant-scoped table. The verify-operator gate above
// is the security boundary; service-role is fine after it passes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { verifyOperator } from "../_shared/verify-operator.ts";

interface BaseAction { action: string }

type Action =
  // List every practice for the tenant grid.
  | { action: "list_practices" }
  // Get one practice by id.
  | { action: "get_practice"; id: string }
  // Update an existing practice. patch fields are merged onto the row.
  | { action: "update_practice"; id: string; patch: Record<string, unknown> }
  // List members of a practice for the member grid.
  | { action: "list_practice_members"; practice_id: string }
  // Update a practice member.
  | { action: "update_practice_member"; id: string; patch: Record<string, unknown> }
  // Aggregate stats: counts per practice for the overview / per-practice
  // detail page (patients, appointments today, incident reports open).
  | { action: "tenant_stats"; practice_id?: string };

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
    return jsonResponse(
      req,
      { error: "Edge function not configured (SUPABASE_URL/SERVICE_ROLE)" },
      500,
    );
  }
  const core = createClient(coreUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await dispatch(core, body as Action, auth);
    return jsonResponse(req, result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin-tenants] failed", body.action, message);
    return jsonResponse(req, { error: message }, 500);
  }
});

async function dispatch(
  core: ReturnType<typeof createClient>,
  action: Action,
  _auth: { admin_user_id: string; email: string; user_id: string },
): Promise<unknown> {
  switch (action.action) {
    case "list_practices": {
      const { data, error } = await core
        .from("practice")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { practices: data ?? [] };
    }

    case "get_practice": {
      const { data, error } = await core
        .from("practice")
        .select("*")
        .eq("id", action.id)
        .maybeSingle();
      if (error) throw error;
      return { practice: data };
    }

    case "update_practice": {
      // Allow only known columns through. Prevents the client from
      // updating audit fields, primary keys, or anything we haven't
      // explicitly opted in to.
      const ALLOWED = new Set([
        "name", "primary_email", "primary_phone",
        "city", "postcode",
        "nhs_contract_number", "cqc_provider_id",
        "status", "plan", "trial_ends_at",
        "custom_hostname",
        "marketing_site_enabled", "booking_app_enabled",
      ]);
      const filteredPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(action.patch ?? {})) {
        if (ALLOWED.has(k)) filteredPatch[k] = v;
      }
      if (Object.keys(filteredPatch).length === 0) {
        return { practice: null, message: "no allowed fields in patch" };
      }
      const { data, error } = await core
        .from("practice")
        .update(filteredPatch)
        .eq("id", action.id)
        .select()
        .single();
      if (error) throw error;
      return { practice: data };
    }

    case "list_practice_members": {
      const { data, error } = await core
        .from("practice_member")
        .select(
          "id, user_id, practice_id, role, full_name, email, is_active, available_for_booking, gdc_number, specialism, created_at, updated_at, deleted_at",
        )
        .eq("practice_id", action.practice_id)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return { members: data ?? [] };
    }

    case "update_practice_member": {
      const ALLOWED = new Set([
        "role", "is_active", "full_name", "available_for_booking",
        "gdc_number", "specialism",
      ]);
      const filteredPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(action.patch ?? {})) {
        if (ALLOWED.has(k)) filteredPatch[k] = v;
      }
      const { data, error } = await core
        .from("practice_member")
        .update(filteredPatch)
        .eq("id", action.id)
        .select()
        .single();
      if (error) throw error;
      return { member: data };
    }

    case "tenant_stats": {
      // For overview screens. When practice_id is set, returns counts
      // for that practice; when null, returns platform-wide counts.
      const filter = action.practice_id
        ? { practice_id: action.practice_id }
        : null;

      const queries = [
        countWhere(core, "practice", null, true),
        countWhere(core, "patient", filter, true),
        countWhere(core, "appointment", filter, true),
        countWhere(core, "incident_report", filter, true),
      ];
      const [practices, patients, appointments, incidents] =
        await Promise.all(queries);
      return {
        practices,
        patients,
        appointments,
        incidents,
      };
    }

    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unknown action: ${(exhaustiveCheck as { action: string }).action}`);
    }
  }
}

async function countWhere(
  client: ReturnType<typeof createClient>,
  table: string,
  filter: Record<string, unknown> | null,
  withSoftDeleteFilter: boolean,
): Promise<number> {
  let query = client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (withSoftDeleteFilter) query = query.is("deleted_at", null);
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      query = query.eq(k, v);
    }
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

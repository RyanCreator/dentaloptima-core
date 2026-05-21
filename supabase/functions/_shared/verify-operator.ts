// Verifies a request's Authorization: Bearer <jwt> header against the
// tenant-registry Supabase project — an operator's JWT — and confirms
// they have an active row in tenant-registry's `admin_user` table.
//
// Single-query implementation: we attach the JWT to a supabase-js client
// and select from admin_user. The existing `admin_user_select` RLS
// policy invokes `public.is_admin()`, which is SECURITY DEFINER and
// matches `auth.uid()` (extracted from the JWT) against the admin_user
// table. If the JWT is invalid/expired, auth.uid() is null, is_admin()
// returns false, and the query returns no rows. Same security guarantee
// as a separate auth.getUser() call but one HTTP round-trip instead of two.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REGISTRY_URL =
  Deno.env.get("TENANT_REGISTRY_URL") ??
  "https://hbsuhalvececxvusrqlh.supabase.co";

const REGISTRY_ANON_KEY =
  Deno.env.get("TENANT_REGISTRY_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhic3VoYWx2ZWNlY3h2dXNycWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjkxMTksImV4cCI6MjA5MTc0NTExOX0.-FUIkvj8PjicZ3o4Urv3S-0X7aLbUssKIPT-_qKEx8k";

export interface VerifiedOperator {
  user_id: string;
  email: string;
  admin_user_id: string;
}

export async function verifyOperator(req: Request): Promise<VerifiedOperator | Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return jsonError("Missing Authorization: Bearer header", 401);

  const client = createClient(REGISTRY_URL, REGISTRY_ANON_KEY, {
    global: { headers: { authorization: `Bearer ${token}` } },
  });

  const { data: adminRow, error } = await client
    .from("admin_user")
    .select("id, user_id, email, active")
    .eq("active", true)
    .maybeSingle();

  if (error) {
    const detail = `${error.message ?? ""} ${error.code ?? ""} ${error.details ?? ""}`.trim();
    console.error("[verify-operator] admin_user lookup failed", detail);
    return jsonError(`admin_user lookup failed: ${detail || "unknown"}`, 500);
  }
  if (!adminRow) {
    return jsonError(
      "Not an active operator (no admin_user row, or token invalid)",
      403,
    );
  }

  return {
    user_id: adminRow.user_id as string,
    email: adminRow.email as string,
    admin_user_id: adminRow.id as string,
  };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

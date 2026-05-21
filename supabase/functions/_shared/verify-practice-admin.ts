// Verifies a request's Authorization: Bearer <jwt> header against the
// dentaloptima-core auth — a practice member's JWT — and confirms they
// have an active OWNER or ADMIN role on the target practice.
//
// Single-query implementation: attach the JWT to a supabase-js client and
// SELECT from practice_member. RLS scopes results to the caller's own
// practice via current_practice_id(). If the JWT is invalid/expired or
// the user has no membership, the query returns no rows and we reject.
//
// Returns { kind: "admin", ... } on success, or null when the JWT either
// isn't present or doesn't resolve to a practice admin. The caller is
// expected to fall back to verifyOperator() before rejecting outright.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORE_URL = Deno.env.get("SUPABASE_URL")!;

// Edge functions don't have a built-in anon key env, but the client only
// needs the URL + a key for auth-route requests; for our use we attach
// the user JWT via headers and rely on RLS, so any non-empty key works.
// Falling back to the publishable/anon key keeps this consistent with
// how the booking app talks to the same project.
const CORE_PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "";

export type AdminRole = "OWNER" | "ADMIN";

export interface VerifiedPracticeAdmin {
  kind: "practice_admin";
  user_id: string;
  member_id: string;
  practice_id: string;
  role: AdminRole;
}

export async function verifyPracticeAdmin(
  req: Request,
  targetPracticeId: string,
): Promise<VerifiedPracticeAdmin | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return null;

  const userClient = createClient(CORE_URL, CORE_PUBLISHABLE_KEY, {
    global: { headers: { authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // RLS scopes practice_member to the caller's own practice via
  // current_practice_id(). If targetPracticeId doesn't match, RLS filters
  // the row out — defence in depth, though we also explicitly filter on
  // practice_id and role here for clarity.
  const { data: member, error } = await userClient
    .from("practice_member")
    .select("id, practice_id, user_id, role, is_active, deleted_at")
    .eq("practice_id", targetPracticeId)
    .in("role", ["OWNER", "ADMIN"])
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !member) return null;

  return {
    kind: "practice_admin",
    user_id: member.user_id as string,
    member_id: member.id as string,
    practice_id: member.practice_id as string,
    role: member.role as AdminRole,
  };
}

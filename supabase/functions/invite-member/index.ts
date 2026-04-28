// invite-member
//
// Adds a new member to an existing practice. Caller must be either:
//   * An operator (is_operator() === true), OR
//   * An OWNER or ADMIN of the target practice
//
// Auth: standard JWT in Authorization header. Edge function reads the user's
// session and verifies their role server-side via the same RLS helpers used
// by the rest of the schema.
//
// POST body:
//   { practice_id, email, role, full_name, redirect_to? }
//
// On success: creates auth user via inviteUserByEmail (sends invite email)
// + creates practice_member row with the given role. Rolls back on failure.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((s) => s.trim());

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allow =
    ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)
      ? origin || "*"
      : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json" },
  });
}

const VALID_ROLES = ["OWNER", "ADMIN", "DENTIST", "HYGIENIST", "NURSE", "RECEPTIONIST"] as const;
type Role = typeof VALID_ROLES[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InviteMemberRequest {
  practice_id?: string;
  email?: string;
  role?: Role;
  full_name?: string;
  redirect_to?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method not allowed" }, 405);
  }

  // ---- caller identity ----------------------------------------------------
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(req, { error: "missing bearer token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Caller-scoped client (RLS-enforced) for permission checks
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse(req, { error: "invalid session" }, 401);
  }
  const callerUserId = userData.user.id;

  // ---- validate input -----------------------------------------------------
  let body: InviteMemberRequest;
  try { body = await req.json(); } catch { return jsonResponse(req, { error: "invalid JSON" }, 400); }

  const practiceId = body.practice_id?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role;
  const fullName = body.full_name?.trim();

  if (!practiceId || !UUID_RE.test(practiceId)) {
    return jsonResponse(req, { error: "valid practice_id required" }, 400);
  }
  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse(req, { error: "valid email required" }, 400);
  }
  if (!role || !VALID_ROLES.includes(role)) {
    return jsonResponse(req, { error: `role must be one of ${VALID_ROLES.join(", ")}` }, 400);
  }
  if (!fullName) {
    return jsonResponse(req, { error: "full_name required" }, 400);
  }

  // ---- permission check ---------------------------------------------------
  // Operators can invite to any practice; otherwise caller must be OWNER/ADMIN
  // of the target practice.
  const { data: isOp } = await callerClient.rpc("is_operator");
  let allowed = Boolean(isOp);

  if (!allowed) {
    const { data: callerMembership } = await callerClient
      .from("practice_member")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("practice_id", practiceId)
      .maybeSingle();
    allowed = callerMembership && (callerMembership.role === "OWNER" || callerMembership.role === "ADMIN");
  }

  if (!allowed) {
    return jsonResponse(req, { error: "not authorised to invite for this practice" }, 403);
  }

  // ---- check email isn't already a member somewhere ----------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  {
    const { data: existing } = await admin
      .from("practice_member")
      .select("id, practice_id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return jsonResponse(req, {
        error: "email is already a member of a practice",
        existing_practice_id: existing.practice_id,
      }, 409);
    }
  }

  // ---- create the invite --------------------------------------------------
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        full_name: fullName,
        practice_id: practiceId,
        role,
      },
      redirectTo: body.redirect_to,
    },
  );

  if (inviteError || !invited?.user) {
    console.error("invite failed", inviteError);
    return jsonResponse(req, { error: "failed to invite", detail: inviteError?.message }, 500);
  }

  const { error: memberError } = await admin
    .from("practice_member")
    .insert({
      user_id: invited.user.id,
      practice_id: practiceId,
      role,
      full_name: fullName,
      email,
      is_active: true,
    });

  if (memberError) {
    console.error("member insert failed", memberError);
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => {});
    return jsonResponse(req, {
      error: "failed to assign member role",
      detail: memberError.message,
    }, 500);
  }

  return jsonResponse(req, {
    user_id: invited.user.id,
    practice_id: practiceId,
    role,
    message: `Invite sent to ${email}.`,
  });
});

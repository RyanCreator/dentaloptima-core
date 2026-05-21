// invite-member
//
// Invites a new practice member into a target practice. Sends an invite
// email via Supabase Auth admin and creates the practice_member row.
//
// Auth (dual-mode): the function accepts EITHER
//   1. A practice OWNER/ADMIN JWT (booking app's self-service invite flow).
//      Verified against dentaloptima-core auth via verifyPracticeAdmin —
//      RLS scopes them to their own practice, so they can only invite
//      into the practice they're already a member of. ADMINs additionally
//      can't grant the OWNER role; only OWNERs can hand out OWNER.
//   2. An operator JWT (admin dashboard). Verified against tenant-registry
//      via verifyOperator — operators can invite any role into any practice.
//
// We try (1) first because the booking-app caller is the more frequent path.
// If the JWT isn't a practice admin (or the body's practice_id doesn't match
// their practice), we fall through to the operator check before rejecting.
//
// POST body: { practice_id, email, role, full_name, redirect_to? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { verifyOperator } from "../_shared/verify-operator.ts";
import { verifyPracticeAdmin } from "../_shared/verify-practice-admin.ts";

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

  // Body parsed BEFORE auth so practice-admin verification can scope the
  // RLS check to body.practice_id. (Operator auth doesn't need this, but
  // we share the parse step for symmetry.)
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

  // ---- dual-mode auth ----------------------------------------------------
  // Try practice-admin first; fall back to operator. Either way, by the
  // time we get past this block, `caller` is a verified principal with a
  // role gate that matches the action.
  const practiceAdmin = await verifyPracticeAdmin(req, practiceId);
  let caller: { kind: "practice_admin" | "operator"; role?: "OWNER" | "ADMIN" };
  if (practiceAdmin) {
    // ADMINs cannot hand out OWNER. Only OWNERs (and operators) can.
    if (role === "OWNER" && practiceAdmin.role !== "OWNER") {
      return jsonResponse(req, {
        error: "Only the practice owner can invite another OWNER. Ask Dentaloptima support if you need to transfer ownership.",
      }, 403);
    }
    caller = { kind: "practice_admin", role: practiceAdmin.role };
  } else {
    const opAuth = await verifyOperator(req);
    if (opAuth instanceof Response) return opAuth;
    caller = { kind: "operator" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- check email isn't already a member somewhere ----------------------
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

  // ---- check practice has a free seat ------------------------------------
  // The DB trigger trg_enforce_staff_seat_limit is the hard guarantee, but
  // checking here means we don't create an auth.users row + send an invite
  // email only to roll it all back when the trigger fires. Friendlier UX
  // for the operator and avoids a stray "you've been invited" email.
  {
    const { data: practiceRow, error: practiceErr } = await admin
      .from("practice")
      .select("staff_seat_limit")
      .eq("id", practiceId)
      .maybeSingle();
    if (practiceErr || !practiceRow) {
      return jsonResponse(req, { error: "practice not found" }, 404);
    }
    const limit: number | null = practiceRow.staff_seat_limit;
    if (limit !== null) {
      const { count, error: countErr } = await admin
        .from("practice_member")
        .select("id", { count: "exact", head: true })
        .eq("practice_id", practiceId)
        .is("deleted_at", null);
      if (countErr) {
        return jsonResponse(req, {
          error: "failed to verify seat limit",
          detail: countErr.message,
        }, 500);
      }
      if ((count ?? 0) >= limit) {
        return jsonResponse(req, {
          error: `Staff seat limit reached: this practice allows ${limit} active member(s).`,
          seat_limit: limit,
          active_count: count ?? 0,
        }, 409);
      }
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

  console.log(
    `[invite-member] invited ${email} as ${role} into ${practiceId} via ${caller.kind}`,
  );

  return jsonResponse(req, {
    user_id: invited.user.id,
    practice_id: practiceId,
    role,
    message: `Invite sent to ${email}.`,
  });
});

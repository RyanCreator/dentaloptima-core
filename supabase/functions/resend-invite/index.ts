// resend-invite
//
// Sends a fresh sign-in email to an existing practice_member when the
// original invite never arrived (e.g. the email account hadn't been
// provisioned yet, mailbox bounced, etc.). Without this, an operator who
// invited a member to a not-yet-real address gets locked out — they can't
// re-invite (email already in use) and the original invite is gone.
//
// Strategy:
//   1. Try inviteUserByEmail first — Supabase regenerates the invite link
//      and re-sends the email for users who exist but haven't confirmed.
//   2. If the user has already confirmed, inviteUserByEmail errors with
//      "already registered". Fall back to resetPasswordForEmail, which
//      sends a password-reset link. The booking app's /auth/callback
//      treats type=recovery the same as type=invite — both land the
//      recipient on the set-password screen, so the user-visible flow is
//      identical from there on.
//
// Auth: operator JWT (admin dashboard) OR practice OWNER/ADMIN JWT
// (booking-app self-service). Same dual-mode pattern as invite-member.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { verifyOperator } from "../_shared/verify-operator.ts";
import { verifyPracticeAdmin } from "../_shared/verify-practice-admin.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResendInviteRequest {
  practice_id?: string;
  member_id?: string;
  redirect_to?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method not allowed" }, 405);
  }

  let body: ResendInviteRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "invalid JSON" }, 400);
  }

  const practiceId = body.practice_id?.trim();
  const memberId = body.member_id?.trim();

  if (!practiceId || !UUID_RE.test(practiceId)) {
    return jsonResponse(req, { error: "valid practice_id required" }, 400);
  }
  if (!memberId || !UUID_RE.test(memberId)) {
    return jsonResponse(req, { error: "valid member_id required" }, 400);
  }

  // Dual auth — practice admin first (more frequent path from the booking
  // app), operator fallback.
  const practiceAdmin = await verifyPracticeAdmin(req, practiceId);
  if (!practiceAdmin) {
    const opAuth = await verifyOperator(req);
    if (opAuth instanceof Response) return opAuth;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: member, error: lookupErr } = await admin
    .from("practice_member")
    .select("email, practice_id, full_name")
    .eq("id", memberId)
    .maybeSingle();
  if (lookupErr || !member) {
    return jsonResponse(req, { error: "member not found" }, 404);
  }
  if (member.practice_id !== practiceId) {
    return jsonResponse(req, { error: "member not in this practice" }, 403);
  }

  // First attempt — fresh invite. Supabase regenerates the token + resends
  // the email for users who haven't yet confirmed.
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    member.email,
    {
      data: {
        full_name: member.full_name ?? undefined,
        practice_id: member.practice_id,
      },
      redirectTo: body.redirect_to,
    },
  );

  if (!inviteErr) {
    console.log(`[resend-invite] re-sent invite to ${member.email}`);
    return jsonResponse(req, {
      ok: true,
      kind: "invite",
      message: `Invite re-sent to ${member.email}`,
    });
  }

  // Already-confirmed user → invite path errors. Pattern-match loosely
  // because Supabase error wording varies between versions.
  const isAlreadyRegistered = /already (registered|confirmed)|already exists|email[_ ]?taken/i
    .test(inviteErr.message ?? "");
  if (!isAlreadyRegistered) {
    console.error("[resend-invite] invite failed", inviteErr);
    return jsonResponse(
      req,
      { error: "failed to resend invite", detail: inviteErr.message },
      500,
    );
  }

  // Fall back to a password-reset link.
  const { error: resetErr } = await admin.auth.resetPasswordForEmail(
    member.email,
    { redirectTo: body.redirect_to },
  );
  if (resetErr) {
    console.error("[resend-invite] reset fallback failed", resetErr);
    return jsonResponse(
      req,
      { error: "failed to send reset email", detail: resetErr.message },
      500,
    );
  }

  console.log(`[resend-invite] sent password-reset to ${member.email}`);
  return jsonResponse(req, {
    ok: true,
    kind: "reset",
    message: `Password-reset link sent to ${member.email}`,
  });
});

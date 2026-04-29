// set-operator-role — grants or revokes the is_operator app_metadata flag.
// Caller must already be an operator. Self-revoke blocked (avoid lockout).
// Sends an invite email if the target user doesn't exist yet.
//
// POST body: { email, is_operator, full_name?, redirect_to? }
// Auth: Bearer JWT from a logged-in operator.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim());

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin) ? origin || "*" : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "content-type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SetOperatorRequest {
  email?: string;
  is_operator?: boolean;
  full_name?: string;
  redirect_to?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse(req, { error: "missing bearer token" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse(req, { error: "invalid session" }, 401);
  const callerEmail = userData.user.email?.toLowerCase();

  const { data: isOp } = await callerClient.rpc("is_operator");
  if (!isOp) return jsonResponse(req, { error: "not authorised" }, 403);

  let body: SetOperatorRequest;
  try { body = await req.json(); } catch { return jsonResponse(req, { error: "invalid JSON" }, 400); }

  const targetEmail = body.email?.trim().toLowerCase();
  const isOperator = Boolean(body.is_operator);

  if (!targetEmail || !EMAIL_RE.test(targetEmail)) return jsonResponse(req, { error: "valid email required" }, 400);

  // Block self-revoke — avoids the "last operator locks themselves out" trap
  if (callerEmail === targetEmail && !isOperator) {
    return jsonResponse(req, { error: "cannot revoke your own operator role; ask another operator to do it" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: usersData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) return jsonResponse(req, { error: "failed to look up user", detail: listErr.message }, 500);
  let target = usersData.users.find((u) => u.email?.toLowerCase() === targetEmail);

  if (!target && isOperator) {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(targetEmail, {
      data: { full_name: body.full_name?.trim() ?? "" },
      redirectTo: body.redirect_to,
    });
    if (inviteErr || !invited?.user) return jsonResponse(req, { error: "invite failed", detail: inviteErr?.message }, 500);
    target = invited.user;
  }

  if (!target) return jsonResponse(req, { error: "user not found and revoke requested" }, 404);

  const { error: updateErr } = await admin.auth.admin.updateUserById(target.id, {
    app_metadata: { ...(target.app_metadata ?? {}), is_operator: isOperator },
  });
  if (updateErr) return jsonResponse(req, { error: "update failed", detail: updateErr.message }, 500);

  return jsonResponse(req, {
    user_id: target.id,
    email: targetEmail,
    is_operator: isOperator,
    invited: !target.last_sign_in_at,
    message: isOperator
      ? (target.last_sign_in_at ? `${targetEmail} is now an operator.` : `Invite sent to ${targetEmail}; they'll be an operator on accept.`)
      : `${targetEmail} is no longer an operator.`,
  });
});

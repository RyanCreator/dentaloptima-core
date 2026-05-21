// set-operator-role — grants or revokes the is_operator app_metadata flag.
// Caller must already be an operator. Self-revoke blocked (avoid lockout).
//
// Two ways to add a new operator:
//   1. Magic-link invite (default) — calls auth.admin.inviteUserByEmail.
//      Relies on email delivery; the recipient sets their own password
//      when they click the link.
//   2. Direct password — pass a `password` field. Calls auth.admin.createUser
//      with email_confirm: true so they can sign in immediately. Use this
//      when SMTP is unreliable or for internal accounts you'll hand the
//      password to in person / over a secure channel.
//
// POST body: { email, is_operator, full_name?, password?, redirect_to? }
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
  password?: string;
  redirect_to?: string;
}

const MIN_PASSWORD_LENGTH = 12;

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

  // Validate password if direct-create mode is requested.
  const wantsDirectPassword = typeof body.password === "string" && body.password.length > 0;
  if (wantsDirectPassword) {
    if (!isOperator) {
      return jsonResponse(req, { error: "password is only used for granting operator role, not revoke" }, 400);
    }
    if ((body.password as string).length < MIN_PASSWORD_LENGTH) {
      return jsonResponse(req, { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
    }
  }

  const { data: usersData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) return jsonResponse(req, { error: "failed to look up user", detail: listErr.message }, 500);
  let target = usersData.users.find((u) => u.email?.toLowerCase() === targetEmail);
  let createdWithPassword = false;

  if (!target && isOperator) {
    if (wantsDirectPassword) {
      // Direct path — create the user with a password and a confirmed
      // email so they can sign in immediately. Skips the magic-link
      // email entirely. The caller is responsible for getting the
      // password to the operator over a secure channel.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: targetEmail,
        password: body.password,
        email_confirm: true,
        app_metadata: { is_operator: true },
        user_metadata: { full_name: body.full_name?.trim() ?? "" },
      });
      if (createErr || !created?.user) {
        return jsonResponse(req, { error: "create failed", detail: createErr?.message }, 500);
      }
      target = created.user;
      createdWithPassword = true;
    } else {
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(targetEmail, {
        data: { full_name: body.full_name?.trim() ?? "" },
        redirectTo: body.redirect_to,
      });
      if (inviteErr || !invited?.user) return jsonResponse(req, { error: "invite failed", detail: inviteErr?.message }, 500);
      target = invited.user;
    }
  }

  if (!target) return jsonResponse(req, { error: "user not found and revoke requested" }, 404);

  // If we just created the user with a password, the is_operator flag
  // was set in createUser already — no need for a separate update.
  if (!createdWithPassword) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(target.id, {
      app_metadata: { ...(target.app_metadata ?? {}), is_operator: isOperator },
    });
    if (updateErr) return jsonResponse(req, { error: "update failed", detail: updateErr.message }, 500);
  }

  return jsonResponse(req, {
    user_id: target.id,
    email: targetEmail,
    is_operator: isOperator,
    invited: !target.last_sign_in_at && !createdWithPassword,
    created_with_password: createdWithPassword,
    message: !isOperator
      ? `${targetEmail} is no longer an operator.`
      : createdWithPassword
        ? `${targetEmail} created with the password you set. Pass it to them over a secure channel.`
        : (target.last_sign_in_at
          ? `${targetEmail} is now an operator.`
          : `Invite sent to ${targetEmail}; they'll be an operator on accept.`),
  });
});

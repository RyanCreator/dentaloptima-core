// create-practice-with-owner
//
// Operator-only endpoint. Creates a new practice + invites the first OWNER
// via Supabase Auth's invite-by-email flow + creates the OWNER practice_member
// row, all in one atomic-ish operation. On any failure, rolls back what's
// already been created so we never leave half-built tenants.
//
// Auth: shared secret in `X-Operator-Token` header (constant-time compare).
// The token is held in the OPERATOR_TOKEN edge-function secret.
//
// POST body:
//   {
//     practice_name: string,        // human-readable, e.g. "Optima Dental"
//     slug: string,                 // url-safe, 3-50 chars [a-z0-9-]
//     owner_email: string,          // email of the first OWNER
//     owner_full_name: string,      // their name
//     plan?: "TRIAL" | string,      // default "TRIAL"
//     trial_days?: number,          // default 30
//     redirect_to?: string          // post-invite landing URL
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ---------- shared helpers (inlined so MCP deploy bundles cleanly) ----------
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((s) => s.trim());

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin =
    ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)
      ? origin || "*"
      : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-operator-token",
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

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function requireOperatorToken(req: Request): Response | null {
  const expected = Deno.env.get("OPERATOR_TOKEN");
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "OPERATOR_TOKEN secret not configured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const provided = req.headers.get("x-operator-token") ?? "";
  if (!constantTimeEquals(provided, expected)) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return null;
}

// ---------- handler -------------------------------------------------------

interface CreatePracticeRequest {
  practice_name?: string;
  slug?: string;
  owner_email?: string;
  owner_full_name?: string;
  plan?: string;
  trial_days?: number;
  redirect_to?: string;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method not allowed" }, 405);
  }

  const authError = requireOperatorToken(req);
  if (authError) return authError;

  let body: CreatePracticeRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "invalid JSON body" }, 400);
  }

  // ---- validate input -----------------------------------------------------
  const practiceName = body.practice_name?.trim();
  const slug = body.slug?.trim().toLowerCase();
  const ownerEmail = body.owner_email?.trim().toLowerCase();
  const ownerFullName = body.owner_full_name?.trim();
  const plan = body.plan?.trim() || "TRIAL";
  const trialDays = Number.isFinite(body.trial_days)
    ? Math.max(1, Math.min(365, Math.floor(body.trial_days as number)))
    : 30;

  if (!practiceName || practiceName.length > 200) {
    return jsonResponse(req, { error: "practice_name required (1-200 chars)" }, 400);
  }
  if (!slug || !SLUG_RE.test(slug)) {
    return jsonResponse(req, {
      error: "slug must be 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen",
    }, 400);
  }
  if (!ownerEmail || !EMAIL_RE.test(ownerEmail)) {
    return jsonResponse(req, { error: "valid owner_email required" }, 400);
  }
  if (!ownerFullName || ownerFullName.length > 200) {
    return jsonResponse(req, { error: "owner_full_name required (1-200 chars)" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ---- check slug uniqueness ---------------------------------------------
  {
    const { data: existing } = await supabase
      .from("practice")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      return jsonResponse(req, { error: "slug already taken" }, 409);
    }
  }

  // ---- check owner email isn't already a member of any practice ----------
  {
    const { data: existingMember } = await supabase
      .from("practice_member")
      .select("id, practice_id")
      .eq("email", ownerEmail)
      .maybeSingle();
    if (existingMember) {
      return jsonResponse(req, {
        error: "owner_email is already a member of another practice",
        existing_practice_id: existingMember.practice_id,
      }, 409);
    }
  }

  // ---- create the practice -----------------------------------------------
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: practice, error: practiceError } = await supabase
    .from("practice")
    .insert({
      name: practiceName,
      slug,
      primary_email: ownerEmail,
      plan,
      status: "TRIAL",
      trial_started_at: new Date().toISOString(),
      trial_ends_at: trialEndsAt,
    })
    .select("id, slug")
    .single();

  if (practiceError || !practice) {
    console.error("practice insert failed", practiceError);
    return jsonResponse(req, { error: "failed to create practice" }, 500);
  }

  // ---- invite the owner via auth admin API -------------------------------
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    ownerEmail,
    {
      data: {
        full_name: ownerFullName,
        practice_id: practice.id,
        practice_slug: practice.slug,
        role: "OWNER",
      },
      redirectTo: body.redirect_to,
    },
  );

  if (inviteError || !invited?.user) {
    console.error("invite failed", inviteError);
    await supabase.from("practice").delete().eq("id", practice.id);
    return jsonResponse(req, {
      error: "failed to invite owner",
      detail: inviteError?.message,
    }, 500);
  }

  // ---- create the OWNER practice_member row ------------------------------
  const { error: memberError } = await supabase
    .from("practice_member")
    .insert({
      user_id: invited.user.id,
      practice_id: practice.id,
      role: "OWNER",
      full_name: ownerFullName,
      email: ownerEmail,
      is_active: true,
    });

  if (memberError) {
    console.error("member insert failed", memberError);
    await supabase.auth.admin.deleteUser(invited.user.id).catch(() => {});
    await supabase.from("practice").delete().eq("id", practice.id);
    return jsonResponse(req, {
      error: "failed to assign owner role",
      detail: memberError.message,
    }, 500);
  }

  return jsonResponse(req, {
    practice_id: practice.id,
    slug: practice.slug,
    owner_user_id: invited.user.id,
    trial_ends_at: trialEndsAt,
    message: `Practice created. Invite emailed to ${ownerEmail}.`,
  });
});

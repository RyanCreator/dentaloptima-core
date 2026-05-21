// create-practice-with-owner
//
// Creates a new practice + invites the first OWNER via Supabase Auth's
// invite-by-email + creates the OWNER practice_member row, all in one
// atomic-ish operation. On any failure rolls back what's already been
// created so we never leave half-built tenants.
//
// Auth: operator's tenant-registry JWT in Authorization: Bearer header.
// Verified by _shared/verify-operator.ts which calls back to
// tenant-registry's /auth/v1/user endpoint and confirms an active
// admin_user row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { verifyOperator } from "../_shared/verify-operator.ts";

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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "method not allowed" }, 405);

  const auth = await verifyOperator(req);
  if (auth instanceof Response) return auth;

  let body: CreatePracticeRequest;
  try { body = await req.json(); } catch { return jsonResponse(req, { error: "invalid JSON body" }, 400); }

  const practiceName = body.practice_name?.trim();
  const slug = body.slug?.trim().toLowerCase();
  const ownerEmail = body.owner_email?.trim().toLowerCase();
  const ownerFullName = body.owner_full_name?.trim();
  const plan = body.plan?.trim() || "TRIAL";
  const trialDays = Number.isFinite(body.trial_days) ? Math.max(1, Math.min(365, Math.floor(body.trial_days as number))) : 30;

  if (!practiceName || practiceName.length > 200) return jsonResponse(req, { error: "practice_name required (1-200 chars)" }, 400);
  if (!slug || !SLUG_RE.test(slug)) return jsonResponse(req, { error: "slug must be 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen" }, 400);
  if (!ownerEmail || !EMAIL_RE.test(ownerEmail)) return jsonResponse(req, { error: "valid owner_email required" }, 400);
  if (!ownerFullName || ownerFullName.length > 200) return jsonResponse(req, { error: "owner_full_name required (1-200 chars)" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  {
    const { data: existing } = await supabase.from("practice").select("id").eq("slug", slug).maybeSingle();
    if (existing) return jsonResponse(req, { error: "slug already taken" }, 409);
  }

  {
    const { data: existingMember } = await supabase.from("practice_member").select("id, practice_id").eq("email", ownerEmail).maybeSingle();
    if (existingMember) return jsonResponse(req, { error: "owner_email is already a member of another practice", existing_practice_id: existingMember.practice_id }, 409);
  }

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

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    ownerEmail,
    { data: { full_name: ownerFullName, practice_id: practice.id, practice_slug: practice.slug, role: "OWNER" }, redirectTo: body.redirect_to },
  );

  if (inviteError || !invited?.user) {
    console.error("invite failed", inviteError);
    await supabase.from("practice").delete().eq("id", practice.id);
    return jsonResponse(req, { error: "failed to invite owner", detail: inviteError?.message }, 500);
  }

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
    return jsonResponse(req, { error: "failed to assign owner role", detail: memberError.message }, 500);
  }

  return jsonResponse(req, {
    practice_id: practice.id,
    slug: practice.slug,
    owner_user_id: invited.user.id,
    trial_ends_at: trialEndsAt,
    message: `Practice created. Invite emailed to ${ownerEmail}.`,
  });
});

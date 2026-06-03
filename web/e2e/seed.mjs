// Seeds (idempotently) an isolated E2E test practice so mutating specs never
// touch real/demo data. Creates: an auth owner, the practice (with a
// custom_hostname the booking app resolves), an OWNER practice_member, and one
// seed patient. Safe to re-run.
//
// Requires service-role access (bypasses RLS). Provide via env:
//   SUPABASE_URL                 (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    (or VITE_SUPABASE_SERVICE_ROLE_KEY)
//   E2E_TP_PASSWORD              (owner password to set — required)
// Optional: E2E_TP_EMAIL, E2E_TP_HOSTNAME
//
// Run: npm run test:e2e:seed   (see package.json)
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_TP_EMAIL || "e2e-owner@dentaloptima.test";
const password = process.env.E2E_TP_PASSWORD;
const hostname = process.env.E2E_TP_HOSTNAME || "e2e.dentaloptima.test";

if (!url || !key) throw new Error("Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
if (!password) throw new Error("Set E2E_TP_PASSWORD (the test owner's password)");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const die = (m, e) => { console.error(m, e); process.exit(1); };

// 1) Auth owner — create or reset password if already present.
let userId;
const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (created.data?.user) {
  userId = created.data.user.id;
} else {
  let page = 1, found;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) die("listUsers failed", error);
    found = data.users.find((u) => u.email === email);
    if (found || data.users.length < 1000) break;
    page++;
  }
  if (!found) die("Could not create or find owner user", created.error);
  userId = found.id;
  await sb.auth.admin.updateUserById(userId, { password, email_confirm: true });
}

// 2) Practice (find-or-create by slug; always (re)assert hostname + active).
const slug = "e2e-test-practice";
let practiceId;
{
  const { data } = await sb.from("practice").select("id").eq("slug", slug).maybeSingle();
  if (data) {
    practiceId = data.id;
    await sb.from("practice").update({
      custom_hostname: hostname, status: "ACTIVE", booking_app_enabled: true, deleted_at: null,
    }).eq("id", practiceId);
  } else {
    const ins = await sb.from("practice").insert({
      name: "E2E Test Practice", slug, custom_hostname: hostname,
      status: "ACTIVE", booking_app_enabled: true, marketing_site_enabled: false,
    }).select("id").single();
    if (ins.error) die("practice insert failed", ins.error);
    practiceId = ins.data.id;
  }
}

// 3) OWNER member (one user = one practice).
{
  const { data } = await sb.from("practice_member").select("id").eq("user_id", userId).maybeSingle();
  if (data) {
    await sb.from("practice_member").update({ practice_id: practiceId, role: "OWNER", is_active: true })
      .eq("id", data.id);
  } else {
    const ins = await sb.from("practice_member").insert({
      user_id: userId, practice_id: practiceId, role: "OWNER", email, full_name: "E2E Owner", is_active: true,
    });
    if (ins.error) die("practice_member insert failed", ins.error);
  }
}

// 4) One seed patient for non-booking specs to operate on.
let patientId;
{
  const { data } = await sb.from("patient").select("id")
    .eq("practice_id", practiceId).eq("nhs_number", "9999999999").maybeSingle();
  if (data) patientId = data.id;
  else {
    const ins = await sb.from("patient").insert({
      practice_id: practiceId, first_name: "E2E", last_name: "Patient",
      nhs_number: "9999999999", dob: "1990-01-01", gender: "FEMALE",
      email: "e2e.patient@dentaloptima.test",
    }).select("id").single();
    if (ins.error) die("patient insert failed", ins.error);
    patientId = ins.data.id;
  }
}

console.log(JSON.stringify({ ok: true, practiceId, userId, patientId, email, hostname }, null, 2));

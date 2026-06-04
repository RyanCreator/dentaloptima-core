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

// 5) Owner member id + make them bookable (for the booking flow).
let staffId;
{
  const { data } = await sb.from("practice_member").select("id").eq("user_id", userId).maybeSingle();
  staffId = data?.id;
  if (staffId) await sb.from("practice_member").update({ available_for_booking: true }).eq("id", staffId);
}

// 6) A bookable service + link the owner to it (availability engine needs both).
let serviceId;
{
  const { data } = await sb.from("service").select("id").eq("practice_id", practiceId).eq("name", "E2E Checkup").maybeSingle();
  if (data) serviceId = data.id;
  else {
    const ins = await sb.from("service").insert({
      practice_id: practiceId, name: "E2E Checkup", duration_minutes: 30, is_active: true, price_pence: 0,
    }).select("id").single();
    if (ins.error) die("service insert failed", ins.error);
    serviceId = ins.data.id;
  }
  if (staffId) {
    const { data: link } = await sb.from("staff_service").select("id")
      .eq("practice_id", practiceId).eq("staff_id", staffId).eq("service_id", serviceId).maybeSingle();
    if (!link) await sb.from("staff_service").insert({ practice_id: practiceId, staff_id: staffId, service_id: serviceId });
  }
}

// 7) A sample enquiry (booking_request) for the enquiries specs.
let enquiryId;
{
  const { data } = await sb.from("booking_request").select("id")
    .eq("practice_id", practiceId).eq("first_name", "E2E").eq("last_name", "Enquiry").maybeSingle();
  if (data) enquiryId = data.id;
  else {
    const ins = await sb.from("booking_request").insert({
      practice_id: practiceId, first_name: "E2E", last_name: "Enquiry",
      email: "e2e.enquiry@dentaloptima.test", phone: "07700900999",
    }).select("id").single();
    if (ins.error) die("booking_request insert failed", ins.error);
    enquiryId = ins.data.id;
  }
}

// 8) A recall due in the future for the recalls specs.
let recallId;
{
  const { data } = await sb.from("recall").select("id").eq("practice_id", practiceId).eq("patient_id", patientId).maybeSingle();
  if (data) recallId = data.id;
  else {
    const ins = await sb.from("recall").insert({
      practice_id: practiceId, patient_id: patientId, due_date: "2026-12-01",
    }).select("id").single();
    if (ins.error) die("recall insert failed", ins.error);
    recallId = ins.data.id;
  }
}

// 9) Practice opening hours Mon–Fri 09:00–17:00 (the availability engine needs
//    practice hours, not just staff availability, to offer booking slots).
{
  const { data } = await sb.from("practice_hours").select("id").eq("practice_id", practiceId).limit(1);
  if (!data || data.length === 0) {
    const days = ["MON", "TUE", "WED", "THU", "FRI"];
    const ins = await sb.from("practice_hours").insert(
      days.map((weekday) => ({ practice_id: practiceId, weekday, open_time: "09:00", close_time: "17:00" })),
    );
    if (ins.error) die("practice_hours insert failed", ins.error);
  }
}

// 10) Owner's weekly availability Mon–Fri 09:00–17:00 (the booking engine reads
//     staff_availability per staff member, not the default shown on the page).
if (staffId) {
  const { data } = await sb.from("staff_availability").select("id").eq("staff_id", staffId).limit(1);
  if (!data || data.length === 0) {
    const days = ["MON", "TUE", "WED", "THU", "FRI"];
    const ins = await sb.from("staff_availability").insert(
      days.map((weekday) => ({
        practice_id: practiceId, staff_id: staffId, weekday, start_time: "09:00", end_time: "17:00",
      })),
    );
    if (ins.error) die("staff_availability insert failed", ins.error);
  }
}

// 11) A performer + a READY_TO_SUBMIT FP17 claim with snapshot + activity lines,
//     so the Compass submission-helper spec has a fixture to drive.
let claimId;
if (staffId) {
  let performerId;
  {
    const { data } = await sb.from("nhs_performer").select("id")
      .eq("practice_id", practiceId).eq("staff_id", staffId).eq("is_active", true).maybeSingle();
    if (data) performerId = data.id;
    else {
      const ins = await sb.from("nhs_performer").insert({
        practice_id: practiceId, staff_id: staffId, performer_number: "999999", provider_number: "99999",
      }).select("id").single();
      if (ins.error) die("nhs_performer insert failed", ins.error);
      performerId = ins.data.id;
    }
  }
  const { data: existing } = await sb.from("nhs_claim").select("id")
    .eq("practice_id", practiceId).eq("course_of_treatment_id", "E2E-FIXTURE").is("deleted_at", null).maybeSingle();
  if (existing) claimId = existing.id;
  else {
    const ins = await sb.from("nhs_claim").insert({
      practice_id: practiceId, patient_id: patientId, performer_id: performerId,
      course_of_treatment_id: "E2E-FIXTURE", form_type: "FP17", treatment_band: "BAND_1", country: "ENGLAND",
      date_of_acceptance: "2026-05-13", date_of_completion: "2026-05-13", status: "READY_TO_SUBMIT",
      ready_to_submit_at: "2026-05-13T10:00:00Z", patient_charge_pence: 0, exemption_category: "UNDER_18",
      patient_signature_received: true, recall_interval_months: 12,
      snapshot_forename: "E2E", snapshot_surname: "Patient", snapshot_sex: "F",
      snapshot_date_of_birth: "1990-01-01", snapshot_nhs_number: "9999999999",
    }).select("id").single();
    if (ins.error) die("nhs_claim insert failed", ins.error);
    claimId = ins.data.id;
    const acts = [["9150", 1], ["9317", null], ["9172", 12], ["9378", 2], ["9379", 0]];
    const a = await sb.from("nhs_claim_activity").insert(
      acts.map(([code, value]) => ({ practice_id: practiceId, nhs_claim_id: claimId, code, value })),
    );
    if (a.error) die("nhs_claim_activity insert failed", a.error);
  }
}

console.log(JSON.stringify(
  { ok: true, practiceId, userId, staffId, patientId, serviceId, enquiryId, recallId, claimId, email, hostname },
  null, 2,
));

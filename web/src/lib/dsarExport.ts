import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// DSAR = Data Subject Access Request. UK GDPR Article 15 gives any patient
// the right to receive a copy of their personal data within 30 days. This
// helper collects everything we hold about a single patient into one JSON
// payload the practice can hand over (electronically or printed). The shape
// is intentionally flat-by-table — easier to audit than a deeply nested
// graph, and matches how a regulator typically asks for it.
//
// Storage objects (X-rays, photos, signed consent PDFs) are NOT bundled
// inline — the file sizes blow past anything the browser can hold. We
// generate signed URLs (valid for 24h) for each document and include them
// in the manifest. The practice can either email those links or download
// each file separately for handover.

export interface DsarExport {
  generated_at: string;
  generated_by: { id: string | null; full_name: string | null; email: string | null };
  practice_id: string;
  patient: Record<string, unknown> | null;
  medical_alerts: unknown[];
  medical_history: unknown[];
  consent_records: unknown[];
  prescriptions: unknown[];
  appointments: unknown[];
  treatment_plans: unknown[];
  treatment_plan_items: unknown[];
  referrals: unknown[];
  recalls: unknown[];
  waiting_list: unknown[];
  billing_items: unknown[];
  notes: unknown[];
  nhs_claims: unknown[];
  documents: Array<Record<string, unknown> & { signed_url: string | null }>;
}

export interface DsarActor {
  id: string | null;
  full_name: string | null;
  email: string | null;
}

export async function buildDsarExport(
  patientId: string,
  practiceId: string,
  actor: DsarActor,
): Promise<DsarExport> {
  // Fire all the table reads in parallel — RLS already scopes them to the
  // caller's practice, and they don't depend on each other. The biggest
  // risk is a single failure dropping a section silently, so we log each
  // table's error and proceed with an empty array.
  const [
    patientRes,
    alertsRes,
    historyRes,
    consentRes,
    prescriptionsRes,
    appointmentsRes,
    plansRes,
    planItemsRes,
    referralsRes,
    recallsRes,
    waitlistRes,
    billingRes,
    notesRes,
    nhsClaimsRes,
    documentsRes,
  ] = await Promise.all([
    supabase.from("patient").select("*").eq("id", patientId).maybeSingle(),
    supabase.from("medical_alert").select("*").eq("patient_id", patientId),
    supabase.from("medical_history_entry").select("*").eq("patient_id", patientId),
    supabase.from("consent_record").select("*").eq("patient_id", patientId),
    supabase.from("prescription").select("*").eq("patient_id", patientId),
    supabase.from("appointment").select("*, services:appointment_service(*)").eq("patient_id", patientId),
    supabase.from("treatment_plan").select("*").eq("patient_id", patientId),
    supabase.from("treatment_plan_item").select("*, treatment_plan!inner(patient_id)").eq("treatment_plan.patient_id", patientId),
    supabase.from("referral").select("*").eq("patient_id", patientId),
    supabase.from("recall").select("*").eq("patient_id", patientId),
    supabase.from("waiting_list").select("*").eq("patient_id", patientId),
    supabase.from("billing_item").select("*, appointment!inner(patient_id)").eq("appointment.patient_id", patientId),
    supabase.from("note").select("*").eq("patient_id", patientId),
    supabase.from("nhs_claim").select("*").eq("patient_id", patientId),
    supabase.from("document").select("*").eq("patient_id", patientId),
  ]);

  if (patientRes.error)       logger.error("DSAR patient", patientRes.error);
  if (alertsRes.error)        logger.error("DSAR alerts", alertsRes.error);
  if (historyRes.error)       logger.error("DSAR history", historyRes.error);
  if (consentRes.error)       logger.error("DSAR consent", consentRes.error);
  if (prescriptionsRes.error) logger.error("DSAR prescriptions", prescriptionsRes.error);
  if (appointmentsRes.error)  logger.error("DSAR appointments", appointmentsRes.error);
  if (plansRes.error)         logger.error("DSAR plans", plansRes.error);
  if (planItemsRes.error)     logger.error("DSAR plan items", planItemsRes.error);
  if (referralsRes.error)     logger.error("DSAR referrals", referralsRes.error);
  if (recallsRes.error)       logger.error("DSAR recalls", recallsRes.error);
  if (waitlistRes.error)      logger.error("DSAR waitlist", waitlistRes.error);
  if (billingRes.error)       logger.error("DSAR billing", billingRes.error);
  if (notesRes.error)         logger.error("DSAR notes", notesRes.error);
  if (nhsClaimsRes.error)     logger.error("DSAR nhs", nhsClaimsRes.error);
  if (documentsRes.error)     logger.error("DSAR documents", documentsRes.error);

  // Per-document signed URLs. Storage path lives on the row already; we
  // turn that into a temporary download link (24h expiry). If signing
  // fails for a particular file we leave signed_url=null and carry on.
  const docsWithUrls = await Promise.all(
    (documentsRes.data ?? []).map(async (d) => {
      const path = (d as { storage_path?: string }).storage_path;
      const bucket = (d as { storage_bucket?: string }).storage_bucket ?? "patient-files";
      if (!path) return { ...d, signed_url: null };
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24);
      if (error) {
        logger.error("DSAR signed-url failed", error);
        return { ...d, signed_url: null };
      }
      return { ...d, signed_url: data.signedUrl };
    }),
  );

  // Write the DSAR-issued audit row. The trigger-driven audit on each
  // table already records *reads* aren't captured (only mutations), so an
  // explicit DSAR marker is the only way an inspector knows this happened.
  // We use `context` so it shows up clearly in the audit-log viewer.
  await supabase.from("audit").insert({
    practice_id: practiceId,
    performed_by_id: actor.id,
    performed_by_email: actor.email,
    action: "UPDATE",
    entity_type: "patient",
    entity_id: patientId,
    context: "GDPR DSAR export",
  });

  return {
    generated_at: new Date().toISOString(),
    generated_by: actor,
    practice_id: practiceId,
    patient: (patientRes.data as Record<string, unknown>) ?? null,
    medical_alerts:      (alertsRes.data       as unknown[]) ?? [],
    medical_history:     (historyRes.data      as unknown[]) ?? [],
    consent_records:     (consentRes.data      as unknown[]) ?? [],
    prescriptions:       (prescriptionsRes.data as unknown[]) ?? [],
    appointments:        (appointmentsRes.data as unknown[]) ?? [],
    treatment_plans:     (plansRes.data        as unknown[]) ?? [],
    treatment_plan_items:(planItemsRes.data    as unknown[]) ?? [],
    referrals:           (referralsRes.data    as unknown[]) ?? [],
    recalls:             (recallsRes.data      as unknown[]) ?? [],
    waiting_list:        (waitlistRes.data     as unknown[]) ?? [],
    billing_items:       (billingRes.data      as unknown[]) ?? [],
    notes:               (notesRes.data        as unknown[]) ?? [],
    nhs_claims:          (nhsClaimsRes.data    as unknown[]) ?? [],
    documents:           docsWithUrls as DsarExport["documents"],
  };
}

/** Triggers a browser download of the export as a pretty-printed JSON. */
export function downloadDsarJson(payload: DsarExport, patientName: string): void {
  const safeName = patientName.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "patient";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `dsar_${safeName}_${date}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Browser keeps the blob alive until the URL is revoked. Wait a tick so
  // the download actually fires before we revoke.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

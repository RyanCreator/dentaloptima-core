import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";
import type { ClaimActivityInput } from "@/lib/nhs/validateClaim";

// FP17 claim writer. Creates or updates an `nhs_claim` row (header + patient
// identity snapshot) and replaces its canonical 9000-code activity lines in
// `nhs_claim_activity`. Atomicity isn't critical — a partial write leaves the
// claim in DRAFT and the dentist re-saves.

export type FP17FormType = "FP17" | "FP17O" | "FP17W" | "FP17PR";

export type FP17TreatmentBand =
  | "BAND_1"
  | "BAND_2"
  | "BAND_3"
  | "URGENT"
  | "BAND_1_WITH_X_RAY"
  | "PRESCRIPTION_ONLY"
  | "REPAIR_FREE"
  | "DENTURE_REPAIR";

export type NHSClaimStatus =
  | "DRAFT"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "ACCEPTED"
  | "REJECTED"
  | "DUPLICATE"
  | "SCHEDULED_FOR_PAYMENT"
  | "PAID"
  | "CANCELLED";

export interface ClaimTreatmentDetails {
  examination: boolean;
  scale_and_polish: boolean;
  fluoride_varnish: boolean;
  fissure_sealants: boolean;
  fillings_count: number;
  extractions_count: number;
  endodontic_count: number;
  crowns_count: number;
  bridges_count: number;
  dentures_count: number;
  x_rays_taken: number;
  periodontal_treatment: boolean;
  free_repair_or_replacement: boolean;
  antibiotic_items: number;
  treated_tooth_numbers: number[] | null;
}

// Patient identity SNAPSHOT — frozen onto the claim at save (the claim is an
// immutable record; the live patient row can change). Validated by Compass
// errors 101 (name/sex) and 102 (DOB).
export interface ClaimPatientSnapshot {
  nhsNumber?: string | null;
  title?: string | null;
  forename?: string | null;
  surname?: string | null;
  sex?: "M" | "F" | null;
  dateOfBirth?: string | null; // YYYY-MM-DD
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLine3?: string | null;
  postcode?: string | null;
  email?: string | null;
  mobile?: string | null;
}

export interface CreateNhsClaimInput {
  practiceId: string;
  patientId: string;
  appointmentId: string;
  performerId: string;
  formType: FP17FormType;
  treatmentBand: FP17TreatmentBand;
  country?: "ENGLAND" | "WALES" | "ISLE_OF_MAN";
  dateOfAcceptance: string; // YYYY-MM-DD
  dateOfCompletion?: string | null;
  dateOfReferral?: string | null;
  isUrgentTreatment?: boolean;
  numberOfVisits?: number;
  patientChargePence: number;
  exemptionCategory: string;
  exemptionEvidenceSeen: boolean;
  patientSignatureReceived: boolean;
  patientSignatureMethod?: string | null;
  /** Canonical 9000-code activity lines (nhs_claim_activity). */
  activities: ClaimActivityInput[];
  snapshot: ClaimPatientSnapshot;
  recallIntervalMonths?: number | null;
  status?: NHSClaimStatus;
  existingClaimId?: string;
}

export interface CreateNhsClaimResult {
  success: boolean;
  claimId?: string;
  error?: string;
}

export async function saveNhsClaim(
  input: CreateNhsClaimInput,
): Promise<CreateNhsClaimResult> {
  const s = input.snapshot;
  const claimPayload = {
    practice_id: input.practiceId,
    patient_id: input.patientId,
    performer_id: input.performerId,
    source_appointment_id: input.appointmentId,
    form_type: input.formType,
    treatment_band: input.treatmentBand,
    country: input.country ?? "ENGLAND",
    date_of_acceptance: input.dateOfAcceptance,
    date_of_completion: input.dateOfCompletion ?? null,
    is_urgent_treatment: input.isUrgentTreatment ?? false,
    number_of_visits: input.numberOfVisits ?? 1,
    patient_charge_pence: input.patientChargePence,
    exemption_category: input.exemptionCategory,
    exemption_evidence_seen: input.exemptionEvidenceSeen,
    patient_signature_received: input.patientSignatureReceived,
    patient_signature_method: input.patientSignatureMethod ?? null,
    recall_interval_months: input.recallIntervalMonths ?? null,
    // Patient identity snapshot (frozen at save).
    snapshot_nhs_number: s.nhsNumber ?? null,
    snapshot_title: s.title ?? null,
    snapshot_forename: s.forename ?? null,
    snapshot_surname: s.surname ?? null,
    snapshot_sex: s.sex ?? null,
    snapshot_date_of_birth: s.dateOfBirth ?? null,
    snapshot_address_line1: s.addressLine1 ?? null,
    snapshot_address_line2: s.addressLine2 ?? null,
    snapshot_address_line3: s.addressLine3 ?? null,
    snapshot_postcode: s.postcode ?? null,
    patient_email: s.email ?? null,
    patient_mobile: s.mobile ?? null,
    status: input.status ?? "DRAFT",
    ...(input.status === "READY_TO_SUBMIT"
      ? { ready_to_submit_at: new Date().toISOString() }
      : {}),
  };

  let claimId: string | undefined;

  if (input.existingClaimId) {
    const { error } = await supabase
      .from("nhs_claim")
      .update(claimPayload as unknown as TablesUpdate<"nhs_claim">)
      .eq("id", input.existingClaimId);
    if (error) {
      logger.error("Failed to update FP17 claim", error);
      return { success: false, error: error.message };
    }
    claimId = input.existingClaimId;
  } else {
    const { data, error } = await supabase
      .from("nhs_claim")
      .insert(claimPayload as unknown as TablesInsert<"nhs_claim">)
      .select("id")
      .single();
    if (error || !data) {
      logger.error("Failed to insert FP17 claim", error);
      return { success: false, error: error?.message ?? "Failed to save claim" };
    }
    claimId = data.id;
  }

  // Canonical 9000-code activity lines (nhs_claim_activity) — the single source
  // of truth the validator + detail sheet + future WebEDI serialiser use.
  // Replace-all (delete then insert) keeps edit simple.
  const { error: delErr } = await supabase
    .from("nhs_claim_activity")
    .delete()
    .eq("nhs_claim_id", claimId);
  if (delErr) {
    logger.error("Failed to clear FP17 activity lines", delErr);
    return { success: false, error: delErr.message };
  }
  if (input.activities.length > 0) {
    const activityRows: TablesInsert<"nhs_claim_activity">[] = input.activities.map(
      (a) => ({
        practice_id: input.practiceId,
        nhs_claim_id: claimId!,
        code: a.code,
        value: a.value ?? null,
        tooth_number: a.toothNumber ?? null,
        quadrant: (a as ClaimActivityInput & { quadrant?: string | null }).quadrant ?? null,
        dcp_gdc_number: a.dcpGdcNumber ?? null,
      }),
    );
    const { error: actErr } = await supabase
      .from("nhs_claim_activity")
      .insert(activityRows);
    if (actErr) {
      logger.error("Failed to insert FP17 activity lines", actErr);
      return { success: false, error: actErr.message };
    }
  }

  return { success: true, claimId };
}

// Looks up the currently-effective NHS performer for a staff member.
// Returns null when the staff member doesn't have one configured —
// callers should block claim creation in that case.
export async function findActivePerformerForStaff(
  staffId: string,
): Promise<{ id: string; performer_number: string; provider_number: string } | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("nhs_performer")
    .select("id, performer_number, provider_number, effective_from, effective_to")
    .eq("staff_id", staffId)
    .eq("is_active", true)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("Failed to find active performer", error);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    performer_number: data.performer_number,
    provider_number: data.provider_number,
  };
}

// Looks up an existing FP17 claim for an appointment. Returns the full row
// so the form can pre-fill on edit.
export async function findClaimForAppointment(appointmentId: string) {
  const { data: claim, error: claimError } = await supabase
    .from("nhs_claim")
    .select("*")
    .eq("source_appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (claimError || !claim) return null;

  const { data: activities } = await supabase
    .from("nhs_claim_activity")
    .select("code, value")
    .eq("nhs_claim_id", claim.id);

  return { claim, activities: activities ?? [] };
}

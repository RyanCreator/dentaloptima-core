import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// FP17 claim writer. Creates or updates an `nhs_claim` row plus its 1:1
// `nhs_claim_treatment` row in two steps. Atomicity isn't critical here —
// if the treatment write fails after the claim has been created, the
// claim row is in DRAFT state with no treatment row, which surfaces in
// the claims list as "incomplete" and the dentist re-saves. Worse than a
// transaction, but avoids a service-role round-trip.
//
// FP17O (orthodontic) and FP17W (domiciliary) extensions are intentionally
// excluded for now — they get their own writers when those forms are wired
// up. The form_type column accepts them, so a half-built ortho claim sits
// in DRAFT state until the ortho UI lands.

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

export interface CreateNhsClaimInput {
  practiceId: string;
  patientId: string;
  appointmentId: string;
  performerId: string;
  formType: FP17FormType;
  treatmentBand: FP17TreatmentBand;
  dateOfAcceptance: string; // YYYY-MM-DD
  dateOfCompletion?: string | null;
  isUrgentTreatment?: boolean;
  numberOfVisits?: number;
  patientChargePence: number;
  exemptionCategory: string;
  exemptionEvidenceSeen: boolean;
  patientSignatureReceived: boolean;
  patientSignatureMethod?: string | null;
  treatments: ClaimTreatmentDetails;
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
  const claimPayload = {
    practice_id: input.practiceId,
    patient_id: input.patientId,
    performer_id: input.performerId,
    source_appointment_id: input.appointmentId,
    form_type: input.formType,
    treatment_band: input.treatmentBand,
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
    status: input.status ?? "DRAFT",
    ...(input.status === "READY_TO_SUBMIT"
      ? { ready_to_submit_at: new Date().toISOString() }
      : {}),
  };

  let claimId: string | undefined;

  if (input.existingClaimId) {
    const { error } = await supabase
      .from("nhs_claim")
      .update(claimPayload)
      .eq("id", input.existingClaimId);
    if (error) {
      logger.error("Failed to update FP17 claim", error);
      return { success: false, error: error.message };
    }
    claimId = input.existingClaimId;
  } else {
    const { data, error } = await supabase
      .from("nhs_claim")
      .insert(claimPayload)
      .select("id")
      .single();
    if (error || !data) {
      logger.error("Failed to insert FP17 claim", error);
      return { success: false, error: error?.message ?? "Failed to save claim" };
    }
    claimId = data.id;
  }

  // 1:1 treatment row — UNIQUE on nhs_claim_id at the schema level. Try
  // INSERT first; if it collides because a row already exists, switch to
  // UPDATE. Cheaper than a SELECT-then-decide round-trip.
  const treatmentPayload = {
    practice_id: input.practiceId,
    nhs_claim_id: claimId,
    examination: input.treatments.examination,
    scale_and_polish: input.treatments.scale_and_polish,
    fluoride_varnish: input.treatments.fluoride_varnish,
    fissure_sealants: input.treatments.fissure_sealants,
    fillings_count: input.treatments.fillings_count,
    extractions_count: input.treatments.extractions_count,
    endodontic_count: input.treatments.endodontic_count,
    crowns_count: input.treatments.crowns_count,
    bridges_count: input.treatments.bridges_count,
    dentures_count: input.treatments.dentures_count,
    x_rays_taken: input.treatments.x_rays_taken,
    periodontal_treatment: input.treatments.periodontal_treatment,
    free_repair_or_replacement: input.treatments.free_repair_or_replacement,
    antibiotic_items: input.treatments.antibiotic_items,
    treated_tooth_numbers:
      input.treatments.treated_tooth_numbers &&
      input.treatments.treated_tooth_numbers.length > 0
        ? input.treatments.treated_tooth_numbers
        : null,
  };

  const insertRes = await supabase
    .from("nhs_claim_treatment")
    .insert(treatmentPayload);

  if (insertRes.error) {
    if (insertRes.error.code === "23505") {
      // Existing row — switch to update by nhs_claim_id.
      const updatePayload = { ...treatmentPayload };
      delete (updatePayload as any).nhs_claim_id;
      delete (updatePayload as any).practice_id;
      const updateRes = await supabase
        .from("nhs_claim_treatment")
        .update(updatePayload)
        .eq("nhs_claim_id", claimId);
      if (updateRes.error) {
        logger.error("Failed to update FP17 treatment row", updateRes.error);
        return { success: false, error: updateRes.error.message };
      }
    } else {
      // Friendly hint for the FDI tooth-number CHECK constraint.
      const message = /tooth/i.test(insertRes.error.message ?? "")
        ? "Invalid tooth number — use FDI notation (11–48 adult, 51–85 deciduous)"
        : insertRes.error.message ?? "Failed to save treatment details";
      logger.error("Failed to insert FP17 treatment row", insertRes.error);
      return { success: false, error: message };
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

  const { data: treatment } = await supabase
    .from("nhs_claim_treatment")
    .select("*")
    .eq("nhs_claim_id", claim.id)
    .maybeSingle();

  return { claim, treatment: treatment ?? null };
}

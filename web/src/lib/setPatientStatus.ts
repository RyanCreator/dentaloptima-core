import { supabase } from "@/integrations/supabase/client";

// Patient lifecycle status (mirrors the patient_registration_status enum).
export type PatientLifecycleStatus = "PROSPECT" | "REGISTERED" | "INACTIVE" | "DECEASED";

// Why a patient left active care. DECEASED is its own status, not a reason.
// "Other" is detailed in the free-text note.
export const PATIENT_INACTIVE_REASONS = [
  { code: "MOVED_AWAY", label: "Moved away" },
  { code: "SWITCHED_PRACTICE", label: "Switched to another practice" },
  { code: "DECLINED_CARE", label: "Declined further care" },
  { code: "LOST_CONTACT", label: "Lost contact / unresponsive" },
  { code: "OTHER", label: "Other" },
] as const;

export function inactiveReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return PATIENT_INACTIVE_REASONS.find((r) => r.code === code)?.label ?? code;
}

interface SetPatientStatusInput {
  patientId: string;
  status: PatientLifecycleStatus;
  reason?: string | null;
  note?: string | null;
  actorMemberId?: string | null;
}

// Set a patient's lifecycle status. Moving out of active care (INACTIVE/DECEASED)
// records the reason + cancels the patient's still-open recalls (PENDING /
// REMINDED) so we stop chasing someone who's left. Reactivating (REGISTERED)
// clears the reason. Lifecycle flag only — never deletes data or affects
// retention (that's deleted_at + legal_hold). The patient audit trigger already
// logs the change to clinical_audit.
export async function setPatientStatus(
  input: SetPatientStatusInput,
): Promise<{ recallsCancelled: number }> {
  const nowIso = new Date().toISOString();
  const leavingActive = input.status === "INACTIVE" || input.status === "DECEASED";

  const { error } = await supabase
    .from("patient")
    .update({
      registration_status: input.status,
      status_reason: leavingActive ? input.reason ?? null : null,
      status_note: leavingActive ? input.note?.trim() || null : null,
      status_changed_at: nowIso,
      status_changed_by: input.actorMemberId ?? null,
    })
    .eq("id", input.patientId);
  if (error) throw error;

  if (!leavingActive) return { recallsCancelled: 0 };

  // Cancel open recalls — they've left, so don't keep reminding them.
  const { data, error: rErr } = await supabase
    .from("recall")
    .update({
      status: "CANCELLED",
      cancelled_at: nowIso,
      cancellation_reason: "Patient no longer active",
    })
    .eq("patient_id", input.patientId)
    .in("status", ["PENDING", "REMINDED"])
    .is("deleted_at", null)
    .select("id");
  if (rErr) throw rErr;
  return { recallsCancelled: data?.length ?? 0 };
}

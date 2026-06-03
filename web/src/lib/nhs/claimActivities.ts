import type { ClaimActivityInput } from "@/lib/nhs/validateClaim";
import type { ClaimTreatmentDetails } from "@/lib/createNhsClaim";

// Bridges the friendly "tick what you did" claim form to the NHSBSA 9000-code
// activity-line model (nhs_claim_activity), which is what Compass validates and
// what the future WebEDI serialiser emits.
//
// The form stays simple for reception/clinicians; the stored truth is codes.
// England mapping (current as of the April-2026 dictionary in migration 0054).
//
// Known lossiness (acceptable for v1 — flagged for the future fine-grained
// code-entry UI): a single "endodontic" count maps to 9370 (molar) and a
// "denture" count to 9309 (upper acrylic); both are the correct *band*, so the
// CDS↔band validation is right, but the exact sub-type isn't captured yet.

export interface FriendlyClaimState {
  /** 1 | 2 | 3 banded course; null when only urgent/other. */
  bandNumber: 1 | 2 | 3 | null;
  isUrgent: boolean;
  treatments: ClaimTreatmentDetails;
  /** NICE recall interval in months → code 9172. */
  recallMonths: number | null;
  /** Highest BPE sextant score → code 9378 (mandatory, adult Band 1/2/3). */
  bpeScore: number | null;
  /** Untreated decayed teeth count → code 9379 (mandatory, adult Band 1/2/3). */
  untreatedDecayedTeeth: number | null;
}

export function buildClaimActivities(state: FriendlyClaimState): ClaimActivityInput[] {
  const out: ClaimActivityInput[] = [];
  const t = state.treatments;
  const add = (code: string, value?: number | null) => out.push({ code, value: value ?? null });

  // Band line (9150) — value 1/2/3 banded, 4 urgent.
  if (state.bandNumber) add("9150", state.bandNumber);
  else if (state.isUrgent) add("9150", 4);

  // Clinical Data Set items (count carried as the line value where it applies).
  if (t.examination) add("9317");
  if (t.scale_and_polish) add("9301");
  if (t.fluoride_varnish) add("9302");
  if (t.fissure_sealants) add("9303");
  if (t.x_rays_taken > 0) add("9304", t.x_rays_taken);
  if (t.fillings_count > 0) add("9306", t.fillings_count);
  if (t.extractions_count > 0) add("9307", t.extractions_count);
  if (t.endodontic_count > 0) add("9370", t.endodontic_count); // molar default (lossy)
  if (t.crowns_count > 0) add("9308", t.crowns_count);
  if (t.bridges_count > 0) add("9315", t.bridges_count);
  if (t.dentures_count > 0) add("9309", t.dentures_count); // upper-acrylic default (lossy)
  if (t.periodontal_treatment) add("9339");
  if (t.free_repair_or_replacement) add("9153");
  if (t.antibiotic_items > 0) add("9318", t.antibiotic_items);

  // England mandatory data-set items.
  if (state.recallMonths != null) add("9172", state.recallMonths);
  if (state.bpeScore != null) add("9378", state.bpeScore);
  if (state.untreatedDecayedTeeth != null) add("9379", state.untreatedDecayedTeeth);

  return out;
}

export type CourseType = "1" | "2" | "3" | "URGENT";

export interface FriendlyClaimForm {
  courseType: CourseType;
  treatments: ClaimTreatmentDetails;
  recallMonths: number | null;
  bpeScore: number | null;
  untreatedDecayedTeeth: number | null;
}

const EMPTY_TREATMENTS: ClaimTreatmentDetails = {
  examination: false,
  scale_and_polish: false,
  fluoride_varnish: false,
  fissure_sealants: false,
  fillings_count: 0,
  extractions_count: 0,
  endodontic_count: 0,
  crowns_count: 0,
  bridges_count: 0,
  dentures_count: 0,
  x_rays_taken: 0,
  periodontal_treatment: false,
  free_repair_or_replacement: false,
  antibiotic_items: 0,
  treated_tooth_numbers: null,
};

/** Reverse of buildClaimActivities: reconstruct the friendly form state from
 *  stored 9000-code activity lines, so editing an existing claim re-populates
 *  the toggles/counts. (nhs_claim_activity is the single source of truth now.) */
export function activitiesToFriendly(
  activities: { code: string; value: number | null }[],
): FriendlyClaimForm {
  const present = new Set(activities.map((a) => a.code));
  const val = (code: string) => activities.find((a) => a.code === code)?.value ?? null;
  const has = (code: string) => present.has(code);
  const count = (code: string) => val(code) ?? (has(code) ? 1 : 0);

  const bandValue = val("9150");
  const courseType: CourseType =
    bandValue === 2 ? "2" : bandValue === 3 ? "3" : bandValue === 4 ? "URGENT" : "1";

  return {
    courseType,
    treatments: {
      ...EMPTY_TREATMENTS,
      examination: has("9317"),
      scale_and_polish: has("9301"),
      fluoride_varnish: has("9302"),
      fissure_sealants: has("9303"),
      x_rays_taken: count("9304"),
      fillings_count: count("9306"),
      extractions_count: count("9307"),
      endodontic_count: count("9370"),
      crowns_count: count("9308"),
      bridges_count: count("9315"),
      dentures_count: count("9309"),
      periodontal_treatment: has("9339"),
      free_repair_or_replacement: has("9153"),
      antibiotic_items: count("9318"),
    },
    recallMonths: val("9172"),
    bpeScore: val("9378"),
    untreatedDecayedTeeth: val("9379"),
  };
}

/** MALE/FEMALE patient gender → FP17 'M'/'F'; everything else is null (which
 *  the validator flags, since FP17 requires a binary sex). */
export function genderToFp17Sex(gender: string | null | undefined): "M" | "F" | null {
  if (gender === "MALE") return "M";
  if (gender === "FEMALE") return "F";
  return null;
}

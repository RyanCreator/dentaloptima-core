// ============================================================================
// FP17 pre-submission validator.
//
// A PURE function: it takes a claim + the seeded NHS reference data and returns
// the findings Compass would otherwise return weeks later. No I/O, no React —
// so it's trivially testable and reusable behind the future WebEDI serialiser.
//
// Each finding carries the NHSBSA error/comment code it mirrors, so the UI can
// show the practice the exact problem (and we can map straight onto Compass
// responses). Rules are driven by the dictionary seeded in migration 0054
// (nhs_activity_code / nhs_band_charge), cross-referenced with the rejection
// rules in docs/nhs/spec-text/Dental_Activty_processing_errors_V8.0.
//
// Scope: ENGLAND (matches the seeded reference data). Conservative by design —
// we only raise ERROR when the spec is unambiguous, and WARNING for advisory
// ("comment code") situations, to avoid blocking valid claims.
// ============================================================================

export type Severity = "ERROR" | "WARNING";

export interface ValidationFinding {
  /** NHSBSA error/comment code this mirrors, e.g. "011", "102", "9172". */
  code: string;
  severity: Severity;
  message: string;
  /** Optional hint so the UI can focus the offending field. */
  field?: string;
}

// --- Reference-data shapes (rows from nhs_activity_code / nhs_band_charge) ---
export interface ActivityCodeRef {
  code: string;
  value: number | null;
  country: string;
  label: string;
  cds_band: string | null; // '1' | '2' | '3' | 'ANY' | null
  is_clinical_data_set: boolean;
  governs_uda: boolean;
  valid_from: string; // YYYY-MM-DD
  valid_to: string | null;
}

export interface BandChargeRef {
  country: string;
  band: string; // '1' | '2' | '3' | 'URGENT'
  amount_pence: number;
  valid_from: string;
  valid_to: string | null;
}

export interface NhsReferenceData {
  codes: ActivityCodeRef[];
  bandCharges: BandChargeRef[];
}

// --- Claim input shape ------------------------------------------------------
export interface ClaimActivityInput {
  code: string;
  value?: number | null;
  toothNumber?: number | null;
  dcpGdcNumber?: string | null;
}

export interface ClaimForValidation {
  formType: "FP17" | "FP17O" | "FP17W" | "FP17PR";
  country: "ENGLAND" | "WALES" | "ISLE_OF_MAN";
  dateOfAcceptance: string | null; // YYYY-MM-DD
  dateOfCompletion?: string | null;
  dateOfReferral?: string | null; // FP17O
  patientDob?: string | null;
  patientSex?: "M" | "F" | null;
  patientSurname?: string | null;
  patientForename?: string | null;
  patientEmail?: string | null;
  patientMobile?: string | null;
  /** nhs_exemption_category value, e.g. 'NONE', 'UNDER_18', 'HC3_PARTIAL_HELP'. */
  exemptionCategory: string;
  patientChargePence: number;
  recallIntervalMonths?: number | null;
  activities: ClaimActivityInput[];
}

// ============================================================================
// CDS item code groups used by the Reg 11 (013) and Free Repair (014) checks.
// From CDS_Treatment_Bands_April_25 (England section). Kept here as validation
// logic rather than a dictionary column.
// ============================================================================
const REG_11_CDS_CODES = new Set([
  "9309", // Upper Denture - Acrylic
  "9310", // Lower Denture - Acrylic
  "9311", // Upper Denture - Metal
  "9312", // Lower Denture - Metal
  "9315", // Bridges Fitted
]);

const FREE_REPAIR_CDS_CODES = new Set([
  "9305", // Endodontic Treatment (legacy)
  "9370", // Endodontics - Molar
  "9371", // Endodontics - Non-molar
  "9306", // Permanent Fillings
  "9308", // Crowns Provided
  "9313", // Veneers Applied
  "9314", // Inlays
  "9338", // Number of Pre-Formed Crowns
]);

// Exemption categories that mean the patient pays NOTHING (charge should be 0).
// NONE = pays standard charge; HC3_PARTIAL_HELP = pays a reduced (non-zero)
// charge; OTHER = ambiguous, so we don't charge-check it.
const FULL_EXEMPTION_CATEGORIES = new Set([
  "UNDER_18",
  "UNDER_19_FULL_TIME_EDUCATION",
  "PREGNANT",
  "NURSING_MOTHER_12M",
  "INCOME_SUPPORT",
  "JOBSEEKERS_ALLOWANCE",
  "ESA_INCOME_RELATED",
  "PENSION_CREDIT_GUARANTEE",
  "UNIVERSAL_CREDIT_QUALIFYING",
  "NHS_TAX_CREDIT_EXEMPTION",
  "HC2_FULL_HELP",
]);

// --- small date helpers (YYYY-MM-DD strings sort lexicographically) ---------
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole years between two YYYY-MM-DD dates (age of `dob` at `on`). */
function ageAt(dob: string, on: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ay, am, ad] = on.split("-").map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age -= 1;
  return age;
}

function codeIsValidOn(ref: ActivityCodeRef, on: string): boolean {
  if (ref.valid_from > on) return false;
  if (ref.valid_to && ref.valid_to < on) return false;
  return true;
}

// ============================================================================
// The validator
// ============================================================================
export function validateFp17Claim(
  claim: ClaimForValidation,
  ref: NhsReferenceData,
  todayOverride?: string,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const today = todayOverride ?? isoToday();
  const add = (code: string, severity: Severity, message: string, field?: string) =>
    findings.push({ code, severity, message, field });

  const codesForCountry = ref.codes.filter((c) => c.country === claim.country);
  // Index by code for quick label/band lookup (value-variants share a code, so
  // we keep the first row per code for band/CDS metadata — band/CDS is the same
  // across a code's value-variants in our seed).
  const byCode = new Map<string, ActivityCodeRef>();
  for (const c of codesForCountry) if (!byCode.has(c.code)) byCode.set(c.code, c);

  const present = new Set(claim.activities.map((a) => a.code));
  const has = (code: string) => present.has(code);
  const acceptance = claim.dateOfAcceptance;

  // --- Identity (101) -------------------------------------------------------
  if (!claim.patientSurname?.trim())
    add("101", "ERROR", "Patient surname is missing.", "surname");
  if (!claim.patientForename?.trim())
    add("101", "ERROR", "Patient forename is missing.", "forename");
  if (claim.patientSex !== "M" && claim.patientSex !== "F")
    add("101", "ERROR", "Patient sex (M/F) is missing.", "sex");

  // --- Dates (102/103/104/105) ---------------------------------------------
  if (!acceptance) {
    add("103", "ERROR", "Date of Acceptance is missing.", "dateOfAcceptance");
  } else {
    if (acceptance > today)
      add("103", "ERROR", "Date of Acceptance is in the future.", "dateOfAcceptance");
    // "Too old to process" — England FP17s should reach Compass within ~2
    // months of completion. Advisory only (the exact window is contract-set).
    const ref90 = claim.dateOfCompletion ?? acceptance;
    if (daysBetween(ref90, today) > 62)
      add(
        "105",
        "WARNING",
        "This claim is over 2 months old — Compass may reject it as too old to process.",
        "dateOfCompletion",
      );
  }
  if (claim.dateOfCompletion) {
    if (claim.dateOfCompletion > today)
      add("103", "ERROR", "Date of Completion is in the future.", "dateOfCompletion");
    if (acceptance && claim.dateOfCompletion < acceptance)
      add(
        "104",
        "ERROR",
        "Date of Completion is before Date of Acceptance.",
        "dateOfCompletion",
      );
  }
  if (!claim.patientDob) {
    add("102", "ERROR", "Patient Date of Birth is missing.", "patientDob");
  } else {
    if (claim.patientDob > today)
      add("102", "ERROR", "Patient Date of Birth is in the future.", "patientDob");
    if (acceptance && claim.patientDob > acceptance)
      add(
        "102",
        "ERROR",
        "Patient Date of Birth is after the treatment date.",
        "patientDob",
      );
  }

  // Patient age at the treatment date — drives exemption + mandatory-code rules.
  const ageAtAcceptance =
    claim.patientDob && acceptance ? ageAt(claim.patientDob, acceptance) : null;
  const isAdult = ageAtAcceptance != null && ageAtAcceptance >= 18;

  // --- Exemption sanity (106/109) ------------------------------------------
  if (
    claim.patientSex === "M" &&
    (claim.exemptionCategory === "PREGNANT" ||
      claim.exemptionCategory === "NURSING_MOTHER_12M")
  )
    add(
      "106",
      "ERROR",
      "Expectant/nursing mother exemption claimed for a male patient.",
      "exemptionCategory",
    );

  if (claim.exemptionCategory === "HC3_PARTIAL_HELP" && claim.patientChargePence <= 0)
    add(
      "109",
      "ERROR",
      "HC3 partial-help exemption requires a non-zero patient charge.",
      "patientChargePence",
    );

  // Age-gated exemptions (109 — inappropriate age for the category).
  if (ageAtAcceptance != null) {
    if (claim.exemptionCategory === "UNDER_18" && ageAtAcceptance >= 18)
      add(
        "109",
        "ERROR",
        `Under-18 exemption claimed but the patient is ${ageAtAcceptance} at the treatment date.`,
        "exemptionCategory",
      );
    if (claim.exemptionCategory === "UNDER_19_FULL_TIME_EDUCATION" && ageAtAcceptance >= 19)
      add(
        "109",
        "ERROR",
        `Under-19 (full-time education) exemption claimed but the patient is ${ageAtAcceptance} at the treatment date.`,
        "exemptionCategory",
      );
  }

  // --- Determine claimed band from the 9150 line ---------------------------
  const bandLine = claim.activities.find((a) => a.code === "9150");
  const bandValue = bandLine?.value ?? null; // 1|2|3 = Band, 4 = Urgent
  const claimedBand =
    bandValue === 1 ? "1" : bandValue === 2 ? "2" : bandValue === 3 ? "3" : null;
  const isUrgent = bandValue === 4;
  const regOrReferralOverride = has("9162") || has("9319"); // alter the charge

  // --- Charge checks (108) — only when a standard band is claimed ----------
  if (acceptance && claimedBand && !regOrReferralOverride) {
    const bandCharge = lookupBandCharge(ref.bandCharges, claim.country, claimedBand, acceptance);
    if (bandCharge != null) {
      if (claim.patientChargePence > bandCharge)
        add(
          "108",
          "ERROR",
          `Patient charge (£${pounds(claim.patientChargePence)}) exceeds the Band ${claimedBand} charge (£${pounds(bandCharge)}).`,
          "patientChargePence",
        );
      if (
        FULL_EXEMPTION_CATEGORIES.has(claim.exemptionCategory) &&
        claim.patientChargePence > 0
      )
        add(
          "109",
          "WARNING",
          "Patient is fully exempt but a charge has been recorded.",
          "patientChargePence",
        );
    }
  }

  // --- CDS item ↔ band match (comment codes 011 / 012) ----------------------
  if (claimedBand) {
    const cdsItems = claim.activities
      .map((a) => byCode.get(a.code))
      .filter((c): c is ActivityCodeRef => !!c && c.is_clinical_data_set);

    const matchesClaimed = cdsItems.some(
      (c) => c.cds_band === claimedBand || c.cds_band === "ANY",
    );
    if (!matchesClaimed)
      add(
        "011",
        "ERROR",
        `No Clinical Data Set item for the band claimed (Band ${claimedBand}).`,
      );

    const higher = cdsItems.find(
      (c) => c.cds_band && c.cds_band !== "ANY" && c.cds_band > claimedBand,
    );
    if (higher)
      add(
        "012",
        "ERROR",
        `A higher-band treatment (${higher.label}, Band ${higher.cds_band}) is present on a Band ${claimedBand} claim.`,
      );
  }

  // --- Reg 11 (013) and Free Repair/Replacement (014) ----------------------
  if (has("9162")) {
    const ok = claim.activities.some((a) => REG_11_CDS_CODES.has(a.code));
    if (!ok)
      add(
        "013",
        "ERROR",
        "Regulation 11 claim has no relevant denture/bridge Clinical Data Set item.",
      );
  }
  if (has("9153")) {
    const ok = claim.activities.some((a) => FREE_REPAIR_CDS_CODES.has(a.code));
    if (!ok)
      add(
        "014",
        "ERROR",
        "Free Repair/Replacement claim has no repaired/replaced restoration item.",
      );
    if (!claimedBand && !isUrgent)
      add(
        "9153",
        "ERROR",
        "Free Repair/Replacement must be on a Band 2, Band 3 or Urgent claim.",
      );
  }

  // --- Adult England mandatory codes (9172 / 9378 / 9379) ------------------
  if (claim.country === "ENGLAND" && isAdult && claimedBand) {
    if (!has("9172"))
      add(
        "9172",
        "ERROR",
        "NICE recall interval (9172) is mandatory on adult Band 1/2/3 claims.",
      );
    if (!has("9378"))
      add(
        "9378",
        "ERROR",
        "Highest BPE sextant score (9378) is mandatory on adult Band 1/2/3 claims.",
      );
    if (!has("9379"))
      add(
        "9379",
        "ERROR",
        "Untreated decayed teeth (9379) is mandatory on adult Band 1/2/3 claims.",
      );
  }

  // --- Incomplete treatment (9164) accompaniment ---------------------------
  for (const a of claim.activities.filter((x) => x.code === "9164")) {
    if (isUrgent)
      add("9164", "ERROR", "Incomplete Treatment cannot be used with Urgent Treatment.");
    if (!claimedBand)
      add("9164", "ERROR", "Incomplete Treatment (9164) needs an accompanying 9150 band.");
    else if (a.value && a.value > Number(claimedBand))
      add(
        "9164",
        "ERROR",
        `Incomplete Treatment Band ${a.value} needs an accompanying 9150 of Band ${a.value} or higher.`,
      );
  }

  // --- DCP attribution: 9178 lines need a GDC number -----------------------
  for (const a of claim.activities.filter((x) => x.code === "9178")) {
    if (!a.dcpGdcNumber?.trim())
      add(
        "9178",
        "ERROR",
        "A Dental Care Professional code requires the DCP's GDC number.",
        "dcpGdcNumber",
      );
  }

  // --- Orthodontic (FP17O) rules -------------------------------------------
  if (claim.formType === "FP17O") {
    const isAssessment = has("9012") || has("9013") || has("9014");
    // 9177 Commissioner Approval when ≥18 at Date of Referral
    if (isAssessment && claim.dateOfReferral && claim.patientDob) {
      if (ageAt(claim.patientDob, claim.dateOfReferral) >= 18 && !has("9177"))
        add(
          "9177",
          "ERROR",
          "Commissioner Approval (9177) is required when the patient is 18+ at the Date of Referral.",
        );
    }
    // 9014 appliance fitted needs Treatment Proposed (9415 = 1)
    if (has("9014") && !claim.activities.some((a) => a.code === "9415" && a.value === 1))
      add(
        "9415",
        "ERROR",
        "Assess/Appliance-Fitted claims need Treatment Proposed indicator (9415 = 1).",
      );
    // 9161 completion/abandon/discontinue needs 9415 = 2
    if (has("9161") && !claim.activities.some((a) => a.code === "9415" && a.value === 2))
      add(
        "9415",
        "ERROR",
        "Ortho completion/abandon/discontinue claims need indicator 9415 = 2.",
      );
    // IOTN (9015) generally required on assessment claims
    if (isAssessment && !has("9015"))
      add("9015", "WARNING", "IOTN (9015) is normally required on assessment claims.");
    // Patient declined email/mobile (9175 / 9176) on English FP17O
    if (claim.country === "ENGLAND") {
      if (!claim.patientEmail?.trim() && !has("9175"))
        add(
          "9175",
          "ERROR",
          "English FP17O needs an email address, or code 9175 (patient declined).",
          "patientEmail",
        );
      if (!claim.patientMobile?.trim() && !has("9176"))
        add(
          "9176",
          "ERROR",
          "English FP17O needs a mobile number, or code 9176 (patient declined).",
          "patientMobile",
        );
    }
  }

  // --- Unknown / out-of-date codes -----------------------------------------
  for (const a of claim.activities) {
    const refRow = codesForCountry.find(
      (c) => c.code === a.code && (c.value === (a.value ?? null) || c.value === null),
    );
    if (! refRow) {
      add(
        a.code,
        "WARNING",
        `Code ${a.code}${a.value != null ? ` (value ${a.value})` : ""} is not a recognised ${claim.country} code.`,
      );
      continue;
    }
    if (acceptance && !codeIsValidOn(refRow, acceptance))
      add(
        a.code,
        "ERROR",
        `Code ${a.code} (${refRow.label}) is not valid on ${acceptance} — check its effective dates.`,
      );
  }

  return findings;
}

// --- helpers ----------------------------------------------------------------
function lookupBandCharge(
  charges: BandChargeRef[],
  country: string,
  band: string,
  on: string,
): number | null {
  const row = charges.find(
    (c) =>
      c.country === country &&
      c.band === band &&
      c.valid_from <= on &&
      (!c.valid_to || c.valid_to >= on),
  );
  return row ? row.amount_pence : null;
}

function pounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Convenience: true when there are no blocking (ERROR) findings. */
export function isClaimSubmittable(findings: ValidationFinding[]): boolean {
  return !findings.some((f) => f.severity === "ERROR");
}

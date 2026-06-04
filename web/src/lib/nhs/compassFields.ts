import { format, parseISO } from "date-fns";

// Builds an FP17 claim into an ordered, Compass-form-shaped list of fields for
// the manual submission helper (copy-paste into the Compass online form). Pure
// + presentation-agnostic, so it's also a natural input to the future WebEDI
// serialiser. Values are formatted as a person would type them into Compass.

export interface CompassField {
  label: string;
  value: string;
  /** Render value in a monospace font (numbers/refs). */
  mono?: boolean;
}
export interface CompassSection {
  title: string;
  fields: CompassField[];
}

export interface CompassClaimInput {
  form_type: string;
  treatment_band: string | null;
  date_of_acceptance: string;
  date_of_completion: string | null;
  number_of_visits: number;
  patient_charge_pence: number;
  exemption_category: string;
  patient_signature_received: boolean;
  recall_interval_months: number | null;
  snapshot_title: string | null;
  snapshot_forename: string | null;
  snapshot_surname: string | null;
  snapshot_sex: string | null;
  snapshot_date_of_birth: string | null;
  snapshot_nhs_number: string | null;
  snapshot_address_line1: string | null;
  snapshot_address_line2: string | null;
  snapshot_address_line3: string | null;
  snapshot_postcode: string | null;
  performer: { performer_number: string; provider_number: string } | null;
}

export interface CompassActivity {
  code: string;
  value: number | null;
}

// Compass-facing labels for our exemption enum.
const EXEMPTION_LABELS: Record<string, string> = {
  NONE: "None — patient pays the NHS charge",
  UNDER_18: "Aged under 18",
  UNDER_19_FULL_TIME_EDUCATION: "Aged 18 and in full-time education",
  PREGNANT: "Expectant mother",
  NURSING_MOTHER_12M: "Nursing mother (baby in last 12 months)",
  INCOME_SUPPORT: "Income Support",
  JOBSEEKERS_ALLOWANCE: "Income-based Jobseeker's Allowance",
  ESA_INCOME_RELATED: "Income-related Employment & Support Allowance",
  PENSION_CREDIT_GUARANTEE: "Pension Credit Guarantee Credit",
  UNIVERSAL_CREDIT_QUALIFYING: "Universal Credit (meets criteria)",
  NHS_TAX_CREDIT_EXEMPTION: "NHS Tax Credit Exemption Certificate",
  HC2_FULL_HELP: "HC2 certificate (full help)",
  HC3_PARTIAL_HELP: "HC3 certificate (partial help)",
  OTHER: "Other",
};

const fmtDate = (iso: string | null): string =>
  iso ? format(parseISO(iso), "dd/MM/yyyy") : "";
const fmtMoney = (pence: number): string => (pence / 100).toFixed(2);
const fmtSex = (s: string | null): string =>
  s === "M" ? "Male" : s === "F" ? "Female" : "";

function bandLabel(activities: CompassActivity[], treatmentBand: string | null): string {
  const band = activities.find((a) => a.code === "9150")?.value ?? null;
  if (band === 1) return "Band 1";
  if (band === 2) return "Band 2";
  if (band === 3) return "Band 3";
  if (band === 4) return "Urgent";
  // Fallback to the (deprecated) header column.
  return (treatmentBand ?? "").replace(/_/g, " ").toLowerCase() || "—";
}

export function buildCompassSections(
  claim: CompassClaimInput,
  activities: CompassActivity[],
  codeLabel: (code: string, value: number | null) => string,
): CompassSection[] {
  const onlyTruthy = (fields: CompassField[]) => fields.filter((f) => f.value !== "");

  const patient: CompassField[] = onlyTruthy([
    { label: "Title", value: claim.snapshot_title ?? "" },
    { label: "Forename", value: claim.snapshot_forename ?? "" },
    { label: "Surname", value: claim.snapshot_surname ?? "" },
    { label: "Date of birth", value: fmtDate(claim.snapshot_date_of_birth), mono: true },
    { label: "Sex", value: fmtSex(claim.snapshot_sex) },
    { label: "NHS number", value: claim.snapshot_nhs_number ?? "", mono: true },
    { label: "Address line 1", value: claim.snapshot_address_line1 ?? "" },
    { label: "Address line 2", value: claim.snapshot_address_line2 ?? "" },
    { label: "Address line 3", value: claim.snapshot_address_line3 ?? "" },
    { label: "Postcode", value: claim.snapshot_postcode ?? "", mono: true },
  ]);

  const performer: CompassField[] = onlyTruthy([
    { label: "Performer number", value: claim.performer?.performer_number ?? "", mono: true },
    { label: "Provider / contract number", value: claim.performer?.provider_number ?? "", mono: true },
  ]);

  const course: CompassField[] = onlyTruthy([
    { label: "Date of acceptance", value: fmtDate(claim.date_of_acceptance), mono: true },
    { label: "Date of completion", value: fmtDate(claim.date_of_completion), mono: true },
    { label: "Number of visits", value: String(claim.number_of_visits), mono: true },
  ]);

  // Treatment: band first, then every activity line (except the band itself),
  // labelled from the 9000 dictionary.
  const treatment: CompassField[] = [
    { label: "Band", value: bandLabel(activities, claim.treatment_band) },
    ...activities
      .filter((a) => a.code !== "9150")
      .map((a) => ({
        label: `${codeLabel(a.code, a.value)} (${a.code})`,
        value: a.value != null ? String(a.value) : "Yes",
        mono: a.value != null,
      })),
  ];

  const charge: CompassField[] = onlyTruthy([
    { label: "Exemption / remission", value: EXEMPTION_LABELS[claim.exemption_category] ?? claim.exemption_category },
    { label: "Patient charge (£)", value: fmtMoney(claim.patient_charge_pence), mono: true },
    {
      label: "NICE recall interval (months)",
      value: claim.recall_interval_months != null ? String(claim.recall_interval_months) : "",
      mono: true,
    },
    { label: "Patient signature", value: claim.patient_signature_received ? "Received" : "Not received" },
  ]);

  return [
    { title: "Patient", fields: patient },
    { title: "Performer", fields: performer },
    { title: "Course of treatment", fields: course },
    { title: "Treatment & clinical data set", fields: treatment },
    { title: "Charge & exemption", fields: charge },
  ];
}

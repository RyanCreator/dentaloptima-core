import { describe, it, expect } from "vitest";
import { buildCompassSections, type CompassClaimInput } from "./compassFields";

const BASE: CompassClaimInput = {
  form_type: "FP17",
  treatment_band: "BAND_2",
  date_of_acceptance: "2026-05-13",
  date_of_completion: "2026-05-20",
  number_of_visits: 2,
  patient_charge_pence: 7660,
  exemption_category: "NONE",
  patient_signature_received: true,
  recall_interval_months: 12,
  snapshot_title: "Mr",
  snapshot_forename: "John",
  snapshot_surname: "Sample",
  snapshot_sex: "M",
  snapshot_date_of_birth: "1980-05-12",
  snapshot_nhs_number: "9000000099",
  snapshot_address_line1: "12 Test Street",
  snapshot_address_line2: null,
  snapshot_address_line3: null,
  snapshot_postcode: "LS1 1AA",
  performer: { performer_number: "123456", provider_number: "12345" },
};

const label = (code: string) => `Label-${code}`;
const sections = (over: Partial<CompassClaimInput> = {}, acts = [{ code: "9150", value: 2 }]) =>
  buildCompassSections({ ...BASE, ...over }, acts, label);
const field = (s: ReturnType<typeof sections>, title: string, lbl: string) =>
  s.find((x) => x.title === title)?.fields.find((f) => f.label === lbl);

describe("buildCompassSections", () => {
  it("formats patient fields the way Compass expects", () => {
    const s = sections();
    expect(field(s, "Patient", "Date of birth")?.value).toBe("12/05/1980");
    expect(field(s, "Patient", "Sex")?.value).toBe("Male");
    expect(field(s, "Patient", "Surname")?.value).toBe("Sample");
  });

  it("omits empty snapshot fields", () => {
    const s = sections({ snapshot_address_line2: null, snapshot_title: null });
    const patient = s.find((x) => x.title === "Patient")!;
    expect(patient.fields.some((f) => f.label === "Address line 2")).toBe(false);
    expect(patient.fields.some((f) => f.label === "Title")).toBe(false);
  });

  it("formats dates and money", () => {
    const s = sections();
    expect(field(s, "Course of treatment", "Date of acceptance")?.value).toBe("13/05/2026");
    expect(field(s, "Charge & exemption", "Patient charge (£)")?.value).toBe("76.60");
  });

  it("derives the band from the 9150 line", () => {
    expect(field(sections({}, [{ code: "9150", value: 1 }]), "Treatment & clinical data set", "Band")?.value).toBe("Band 1");
    expect(field(sections({}, [{ code: "9150", value: 4 }]), "Treatment & clinical data set", "Band")?.value).toBe("Urgent");
  });

  it("labels activity lines and shows their value (or 'Yes')", () => {
    const s = sections({}, [{ code: "9150", value: 2 }, { code: "9306", value: 3 }, { code: "9317", value: null }]);
    const treatment = s.find((x) => x.title === "Treatment & clinical data set")!;
    expect(treatment.fields.find((f) => f.label.startsWith("Label-9306"))?.value).toBe("3");
    expect(treatment.fields.find((f) => f.label.startsWith("Label-9317"))?.value).toBe("Yes");
    // The band line itself isn't repeated as an activity row.
    expect(treatment.fields.filter((f) => f.label.startsWith("Label-9150"))).toHaveLength(0);
  });

  it("maps the exemption to its Compass label", () => {
    expect(field(sections({ exemption_category: "PREGNANT" }), "Charge & exemption", "Exemption / remission")?.value)
      .toBe("Expectant mother");
    expect(field(sections({ exemption_category: "NONE" }), "Charge & exemption", "Exemption / remission")?.value)
      .toMatch(/None/);
  });
});

import { describe, it, expect } from "vitest";
import {
  validateFp17Claim,
  isClaimSubmittable,
  type ClaimForValidation,
  type NhsReferenceData,
} from "./validateClaim";

// Minimal England reference set covering the codes the rules touch.
const REF: NhsReferenceData = {
  codes: [
    c("9150", 1, "Band 1", null, false, true),
    c("9150", 2, "Band 2", null, false, true),
    c("9150", 3, "Band 3", null, false, true),
    c("9150", 4, "Urgent", null, false, true, "2006-04-01", "2026-03-31"),
    c("9317", null, "Examination", "1", true, false),
    c("9302", null, "Fluoride Varnish", "1", true, false),
    c("9306", null, "Permanent Fillings", "2", true, false),
    c("9305", null, "Endo (legacy)", "2", true, false, "2006-04-01", "2022-09-30"),
    c("9308", null, "Crowns", "3", true, false),
    c("9318", null, "Antibiotics", "ANY", true, false),
    c("9172", null, "NICE recall", null, false, false),
    c("9378", null, "BPE", null, false, false),
    c("9379", null, "Untreated decay", null, false, false),
    c("9162", null, "Reg 11", null, false, false),
    c("9309", null, "Upper Denture Acrylic", "3", true, false),
    c("9153", null, "Free Repair", null, false, false),
    c("9178", 1, "DCP Therapist", null, false, false),
  ],
  bandCharges: [
    { country: "ENGLAND", band: "1", amount_pence: 2790, valid_from: "2026-04-01", valid_to: null },
    { country: "ENGLAND", band: "2", amount_pence: 7660, valid_from: "2026-04-01", valid_to: null },
    { country: "ENGLAND", band: "3", amount_pence: 33210, valid_from: "2026-04-01", valid_to: null },
  ],
};

function c(
  code: string, value: number | null, label: string, cds_band: string | null,
  is_clinical_data_set: boolean, governs_uda: boolean,
  valid_from = "2006-04-01", valid_to: string | null = null,
) {
  return { code, value, country: "ENGLAND", label, cds_band, is_clinical_data_set, governs_uda, valid_from, valid_to };
}

const TODAY = "2026-06-03";
const adult = {
  formType: "FP17", country: "ENGLAND",
  dateOfAcceptance: "2026-05-01", dateOfCompletion: "2026-05-01",
  patientDob: "1980-01-01", patientSex: "F", patientSurname: "Smith", patientForename: "Jane",
  exemptionCategory: "NONE", patientChargePence: 0, recallIntervalMonths: 6,
} as const;

function run(over: Partial<ClaimForValidation>) {
  return validateFp17Claim({ ...adult, activities: [], ...over } as ClaimForValidation, REF, TODAY);
}
const codesOf = (fs: ReturnType<typeof run>) => fs.map((f) => f.code);

describe("validateFp17Claim — happy path", () => {
  it("a complete adult Band 1 claim is submittable", () => {
    const f = run({
      activities: [{ code: "9150", value: 1 }, { code: "9317" }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }],
    });
    expect(f).toEqual([]);
    expect(isClaimSubmittable(f)).toBe(true);
  });
});

describe("identity + dates (101/102/103/104)", () => {
  it("flags missing surname/forename/sex", () => {
    const f = run({ patientSurname: "", patientForename: "", patientSex: null });
    expect(codesOf(f).filter((c) => c === "101").length).toBe(3);
  });
  it("flags DOB after treatment date", () => {
    expect(codesOf(run({ patientDob: "2027-01-01" }))).toContain("102");
  });
  it("flags completion before acceptance", () => {
    expect(codesOf(run({ dateOfAcceptance: "2026-05-10", dateOfCompletion: "2026-05-01" }))).toContain("104");
  });
  it("flags future acceptance date", () => {
    expect(codesOf(run({ dateOfAcceptance: "2027-01-01" }))).toContain("103");
  });
});

describe("exemptions (106/109)", () => {
  it("106: pregnant/nursing on a male patient", () => {
    expect(codesOf(run({ patientSex: "M", exemptionCategory: "PREGNANT" }))).toContain("106");
  });
  it("109: HC3 partial with zero charge", () => {
    expect(codesOf(run({ exemptionCategory: "HC3_PARTIAL_HELP", patientChargePence: 0 }))).toContain("109");
  });
  it("109: UNDER_18 exemption on an adult", () => {
    expect(codesOf(run({ exemptionCategory: "UNDER_18" }))).toContain("109");
  });
  it("109: UNDER_19_FULL_TIME_EDUCATION on a 19+ patient", () => {
    expect(codesOf(run({ exemptionCategory: "UNDER_19_FULL_TIME_EDUCATION" }))).toContain("109");
  });
  it("a genuine under-18 with UNDER_18 is fine", () => {
    const f = run({
      patientDob: "2015-01-01", exemptionCategory: "UNDER_18",
      activities: [{ code: "9150", value: 1 }, { code: "9317" }],
    });
    expect(codesOf(f)).not.toContain("109");
  });
});

describe("charge (108)", () => {
  it("108: charge exceeds the band charge", () => {
    const f = run({
      patientChargePence: 20000,
      activities: [{ code: "9150", value: 1 }, { code: "9317" }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }],
    });
    expect(codesOf(f)).toContain("108");
  });
});

describe("CDS ↔ band match (011/012)", () => {
  it("011: band claimed with no matching CDS item", () => {
    const f = run({ activities: [{ code: "9150", value: 2 }, { code: "9317" }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }] });
    expect(codesOf(f)).toContain("011"); // exam is Band 1, claim is Band 2
  });
  it("012: a higher-band item on a lower-band claim", () => {
    const f = run({ patientChargePence: 2790, activities: [{ code: "9150", value: 1 }, { code: "9317" }, { code: "9308" }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }] });
    expect(codesOf(f)).toContain("012"); // crown (Band 3) on a Band 1 claim
  });
  it("ANY-band CDS item (antibiotics) satisfies the band requirement", () => {
    const f = run({ activities: [{ code: "9150", value: 1 }, { code: "9318" }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }] });
    expect(codesOf(f)).not.toContain("011");
  });
});

describe("mandatory adult England codes", () => {
  it("requires 9172/9378/9379 on adult banded claims", () => {
    const f = run({ activities: [{ code: "9150", value: 2 }, { code: "9306" }] });
    expect(codesOf(f)).toEqual(expect.arrayContaining(["9172", "9378", "9379"]));
  });
  it("does not require them for a child", () => {
    const f = run({ patientDob: "2015-01-01", activities: [{ code: "9150", value: 1 }, { code: "9317" }] });
    expect(codesOf(f)).not.toContain("9172");
  });
});

describe("code validity by date", () => {
  it("flags a discontinued code (legacy endo 9305 in 2026)", () => {
    const f = run({ activities: [{ code: "9150", value: 2 }, { code: "9305" }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }] });
    expect(codesOf(f)).toContain("9305");
  });
  it("flags an unknown code", () => {
    expect(codesOf(run({ activities: [{ code: "9999" }] }))).toContain("9999");
  });
});

describe("Reg 11 + DCP", () => {
  it("013: Reg 11 without a denture/bridge CDS item", () => {
    const f = run({ activities: [{ code: "9150", value: 3 }, { code: "9162" }, { code: "9308" }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }] });
    expect(codesOf(f)).toContain("013");
  });
  it("9178 DCP code requires a GDC number", () => {
    const f = run({ activities: [{ code: "9150", value: 1 }, { code: "9317" }, { code: "9178", value: 1 }, { code: "9172", value: 6 }, { code: "9378", value: 2 }, { code: "9379", value: 0 }] });
    expect(codesOf(f)).toContain("9178");
  });
});

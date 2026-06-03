import { describe, it, expect } from "vitest";
import {
  buildClaimActivities,
  activitiesToFriendly,
  genderToFp17Sex,
  type FriendlyClaimState,
} from "./claimActivities";
import type { ClaimTreatmentDetails } from "@/lib/createNhsClaim";

const EMPTY: ClaimTreatmentDetails = {
  examination: false, scale_and_polish: false, fluoride_varnish: false, fissure_sealants: false,
  fillings_count: 0, extractions_count: 0, endodontic_count: 0, crowns_count: 0, bridges_count: 0,
  dentures_count: 0, x_rays_taken: 0, periodontal_treatment: false, free_repair_or_replacement: false,
  antibiotic_items: 0, treated_tooth_numbers: null,
};

const find = (acts: { code: string; value?: number | null }[], code: string) =>
  acts.find((a) => a.code === code);

describe("buildClaimActivities", () => {
  it("maps band + flags + counts to 9000 codes", () => {
    const state: FriendlyClaimState = {
      bandNumber: 2, isUrgent: false,
      treatments: { ...EMPTY, examination: true, fillings_count: 3, x_rays_taken: 1 },
      recallMonths: 6, bpeScore: 2, untreatedDecayedTeeth: 0,
    };
    const acts = buildClaimActivities(state);
    expect(find(acts, "9150")?.value).toBe(2);
    expect(find(acts, "9317")).toBeTruthy();
    expect(find(acts, "9306")?.value).toBe(3); // fillings count carried
    expect(find(acts, "9304")?.value).toBe(1);
    expect(find(acts, "9172")?.value).toBe(6);
    expect(find(acts, "9378")?.value).toBe(2);
    expect(find(acts, "9379")?.value).toBe(0);
  });

  it("urgent maps to 9150 value 4 and omits the band line", () => {
    const acts = buildClaimActivities({
      bandNumber: null, isUrgent: true, treatments: { ...EMPTY, examination: true },
      recallMonths: null, bpeScore: null, untreatedDecayedTeeth: null,
    });
    expect(find(acts, "9150")?.value).toBe(4);
  });

  it("omits optional data-set codes when not provided", () => {
    const acts = buildClaimActivities({
      bandNumber: 1, isUrgent: false, treatments: { ...EMPTY, examination: true },
      recallMonths: null, bpeScore: null, untreatedDecayedTeeth: null,
    });
    expect(find(acts, "9172")).toBeUndefined();
    expect(find(acts, "9378")).toBeUndefined();
  });
});

describe("activitiesToFriendly round-trips buildClaimActivities", () => {
  it("reconstructs band, flags, counts and data-set fields", () => {
    const state: FriendlyClaimState = {
      bandNumber: 3, isUrgent: false,
      treatments: { ...EMPTY, examination: true, crowns_count: 2, periodontal_treatment: true },
      recallMonths: 12, bpeScore: 3, untreatedDecayedTeeth: 1,
    };
    const friendly = activitiesToFriendly(
      buildClaimActivities(state).map((a) => ({ code: a.code, value: a.value ?? null })),
    );
    expect(friendly.courseType).toBe("3");
    expect(friendly.treatments.examination).toBe(true);
    expect(friendly.treatments.crowns_count).toBe(2);
    expect(friendly.treatments.periodontal_treatment).toBe(true);
    expect(friendly.recallMonths).toBe(12);
    expect(friendly.bpeScore).toBe(3);
    expect(friendly.untreatedDecayedTeeth).toBe(1);
  });

  it("defaults to Band 1 when no 9150 line is present", () => {
    expect(activitiesToFriendly([]).courseType).toBe("1");
  });
});

describe("genderToFp17Sex", () => {
  it("maps MALE/FEMALE; everything else is null", () => {
    expect(genderToFp17Sex("MALE")).toBe("M");
    expect(genderToFp17Sex("FEMALE")).toBe("F");
    expect(genderToFp17Sex("OTHER")).toBeNull();
    expect(genderToFp17Sex("PREFER_NOT_TO_SAY")).toBeNull();
    expect(genderToFp17Sex(null)).toBeNull();
  });
});

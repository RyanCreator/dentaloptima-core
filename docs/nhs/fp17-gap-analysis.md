# FP17 / Compass readiness — schema gap analysis

**Date:** 2026-06-02
**Author:** Engineering (with Claude)
**Inputs:** the NHSBSA spec PDFs the founder placed in repo root, extracted to `docs/nhs/spec-text/`:

- `Dental_Activity_9000_Codes_V5.1_20260501` — the activity-code dictionary (the data elements that make up a claim)
- `Dental_Activty_processing_errors_V8.0_20260401` — the full rejection-rule set (the validator spec)
- `CDS_Treatment_Bands_April_25v.2.0` — which clinical items belong to which band (England + Wales)
- `Dental_Activity_Comment_Code_List_V6.0_20260401` — advisory/comment codes returned on processed claims

**Purpose:** measure our current `nhs_claim*` schema (migration `0010_nhs_fp17.sql`, plus the
exemption enum in `0009` and appointment capture in `0029`) against what a real FP17/FP17O
submission actually carries, so we know exactly what migration the pre-submission **validator**
needs underneath it.

> Scope note: this covers the **claim data model + validation** (Track A). It does **not** cover the
> WebEDI transport/wire envelope, which is a supplier-gated NHSBSA spec we don't yet hold. Nothing
> here depends on that — it's all upstream of the serialiser and is reusable whatever the transport.

---

## 1. What we already have (and it's a solid base)

`0010_nhs_fp17.sql` gives us:

- **`nhs_performer`** — per-staff NHS registration (performer number, provider number, lifecycle dates). Good.
- **`nhs_claim`** — header: form type, performer FK, acceptance/completion dates, band, patient charge (pence), exemption category, signature capture, a full submission **state machine** (DRAFT → READY → SUBMITTED → ACK → ACCEPTED/REJECTED/DUPLICATE → SCHEDULED → PAID) and rejection capture. This lifecycle is genuinely good and we keep it.
- **`nhs_claim_treatment`** — bespoke treatment flags/counts (examination, fillings_count, extractions_count, …).
- **`nhs_claim_orthodontic`** — IOTN grade + aesthetic component, appliance/treatment/retention dates.
- **`nhs_claim_billing_link`** — claim ↔ billing_item join.
- **`appointment.nhs_exemption_category` / `_evidence_seen`** (migration 0029) — visit-time exemption capture that flows into the claim. Good design.

The **header lifecycle, performer registry, exemption-at-visit capture, and billing linkage are
keepers.** The gaps are concentrated in how we model *clinical activity* and in *what we snapshot*.

---

## 2. The headline structural gap: fixed columns vs. 9000-code lines

**This is the single most important finding.**

A real FP17 is not a fixed set of "fillings = 2, extractions = 1" columns. It is a **set of NHSBSA
"9000" activity codes**, each optionally carrying a *value/number* and (for some) a *tooth/quadrant*.
The 9000 dictionary runs to ~150 codes and grows every April. Examples our current bespoke columns
**cannot represent**:

| Code | Meaning | We can't currently store |
|------|---------|--------------------------|
| 9150 (1/2/3) | Band — **and governs the UDA awarded** | band as a code + its UDA |
| 9162 | Regulation 11 replacement appliance (forces a patient charge even if exempt) | — |
| 9164 (1/2/3) | Incomplete treatment band | — |
| 9163 | Further treatment within 2 months | — |
| 9153 | Free repair/replacement (must be Band 2/3/Urgent) | (we have a bool, not the code) |
| 9172 | NICE recall interval — **mandatory on all adult Band 1/2/3** | — |
| 9173 | Best practice prevention | — |
| 9175 / 9176 | Patient declined email / mobile — **mandatory on English FP17O if absent** | — |
| 9177 | Commissioner approved — mandatory if patient ≥18 at Date of Referral | — |
| 9178 / 9182 | DCP type (therapist/hygienist/nurse/CDT) — **needs DCP GDC number** | — |
| 9179 | ACORN assessment (Wales) | — |
| 9181 | Flexible commissioning flags (1–6) | — |
| 9190 / 9191-9196 | Unscheduled care / care pathways | — |
| 9012–9016 | Ortho assess/review/refuse/fit + IOTN | partially (ortho table) |
| 9025 | Ethnic origin — **mandatory England/Wales** | — |

**Recommendation:** replace the fixed `nhs_claim_treatment` columns with a generic line table:

```
nhs_claim_activity (
  id, practice_id, nhs_claim_id,
  code text,            -- e.g. '9150', '9306'
  value integer,        -- the "Number" column (band, count, flag value), nullable
  tooth_number integer, -- nullable; for tooth-specific items
  quadrant text,        -- nullable
  ...audit
)
```

A small **reference table / seed** maps each 9000 code → label, band, country validity dates, and
rules. We seed it from `Dental_Activity_9000_Codes` and version it (the dictionary is dated, e.g.
`V5.1_20260501`, and changes annually). The bespoke counts can still be offered in the *UI* as a
friendly entry layer that compiles down to codes — but the **stored truth must be the codes**,
because that's what Compass validates and what the wire format carries.

This one change unlocks most of the validation below.

---

## 3. Field-level gaps (what to add)

### 3a. Patient identity must be **snapshotted onto the claim**
Today the claim joins to `patient` for demographics. But a claim is an **immutable historical
record** (we already treat consent records this way). Compass validates these fields and they must
reflect the patient *as submitted*, not as edited later. Error codes that hit these:

- `101` invalid surname/previous surname/forename/gender
- `102` invalid DOB (incl. DOB after treatment date, wrong century)
- (address / NHS number errors elsewhere in the list)

**Add to `nhs_claim` (snapshot at READY/submission):** title, surname, previous_surname, forename,
sex, date_of_birth, full address lines + **postcode**, **NHS number**, **ethnic origin** (code 9025),
patient **email** and **mobile** (or the 9175/9176 "declined" flags).

### 3b. UDA / UOA awarded — **completely missing**
Band code 9150 "governs the UDA awarded"; ortho governs UOA. UDA/UOA performance is the core of an
NHS contract and of payment reconciliation. We store none of it.
**Add:** `uda_awarded numeric`, `uoa_awarded numeric` on `nhs_claim` (or derive + store on activity lines).

### 3c. DCP involvement — missing
9178/9182 require a DCP type **and a DCP GDC number** when a therapist/hygienist/nurse/CDT carried
out treatment. We only have a single `performer_id`.
**Add:** DCP performer linkage + GDC number (likely on the activity line or a small claim-DCP table).

### 3d. Ortho (`nhs_claim_orthodontic`) gaps
- **Date of Referral** — drives the "≥18 at Date of Referral → 9177 commissioner approval" rule. We have `assessment_date` but not `date_of_referral`.
- **PAR scores** (Peer Assessment Rating, start/end) — per `Orthodontic_PAR_Scores` doc; ortho outcome measure. Missing.
- **Treatment proposed indicator** (9415) / completion-reason codes (9409 FTR, 9410 patient requested). Missing.

### 3e. Response can carry **multiple** comment/error codes
We have single `rejection_code` + `rejection_reason` text. Real responses return a *set* of comment
codes (advisory and rejecting) — see the comment-code list.
**Add:** `nhs_claim_response_code (nhs_claim_id, code, severity, message, received_at)` child table.

### 3f. Reference data for charge validation
Error `108` (invalid/excessive patient charge) and `109` (HC3 partial must have non-zero charge)
need the **band charge amounts by date**. These change every April.
**Add:** a small dated `nhs_band_charge` reference (band → £ → valid_from/to), seeded + versioned.

---

## 4. Bug / correctness issues in the current schema

1. **`fp17_form_type` mislabels `FP17W`.** The enum comment says *"FP17W — domiciliary (home visits)"*. That is wrong: **FP17W is the Wales GDS form**. Domiciliary is a service code (9152), not a form type. Left as-is this will misroute every Welsh claim. Fix the comment and the model: form types are FP17 (England GDS), FP17O (ortho), FP17W (Wales GDS) — domiciliary is a flag/code, not a form.
2. **`fp17_treatment_band` enum conflates band with treatment type** (`BAND_1_WITH_X_RAY`, `PRESCRIPTION_ONLY`, `REPAIR_FREE`, `DENTURE_REPAIR` aren't bands). With the 9000-code model, **band should be derived from the 9150 code** and this enum shrinks to the real bands (1/2/3, Urgent, Advice Only, Triage) or is dropped.
3. **`exemption_category` completeness** — our enum is good but should be reconciled against the FP17 form's exact remission/exemption list (e.g. prisoner, care-leaver) and the country-validity rules in error `109` (some exemptions are England-only / Wales-only / IoM-only, and have age windows).

---

## 5. Validation the spec demands (the validator's job)

Built on the 9000-code line model + CDS-band reference, the **pre-submission validator** should
mirror Compass and catch (non-exhaustive, from the error doc):

- **101/102** identity & DOB sanity (DOB before all treatment dates, plausible century).
- **103/104/105** date logic (acceptance ≤ completion, not future, not too old).
- **011–014** (comment codes) **CDS-item ↔ band match** — e.g. a Band 2 claim must include ≥1 Band 2 CDS item; a Band 1 claim mustn't carry Band 3 items. This is exactly what `CDS_Treatment_Bands` encodes; we build a band-membership map and check it.
- **106** expectant/nursing mother flag on a male patient.
- **107** ACORN + "exam not possible" conflict.
- **108/109** charge & remission/exemption rules (incl. HC3 partial needs non-zero charge; age/region validity).
- **9172** present on every adult Band 1/2/3 (NICE recall).
- **9177** present when patient ≥18 at Date of Referral (ortho assess).
- **9175/9176** present when email/mobile absent on English FP17O.
- **9178/9182** DCP GDC number present when a DCP code is used.
- Band-specific accompaniment rules (e.g. 9164 must accompany a 9150 of equal/higher band; 9153 only on Band 2/3/Urgent).

Each rule cites its error/comment code so the UI can show the **exact message the practice would
otherwise get from Compass weeks later** — turning rejections into instant, fixable warnings.

---

## 6. Recommended migration shape (proposal — not yet applied)

A single new migration (next number in sequence) that:

1. Adds `nhs_claim_activity` line table (code/value/tooth/quadrant) + RLS + audit trigger.
2. Adds the patient-snapshot columns to `nhs_claim` (§3a) + UDA/UOA (§3b).
3. Adds `nhs_claim_response_code` child table (§3e).
4. Extends `nhs_claim_orthodontic` (date_of_referral, PAR start/end, completion-reason) (§3d).
5. Adds reference/seed tables: `nhs_activity_code` (dictionary) and `nhs_band_charge`, both dated/versioned.
6. Fixes the `fp17_form_type` FP17W meaning and slims `fp17_treatment_band` (§4).
7. Keeps `nhs_claim_treatment` temporarily as a deprecated friendly-entry mirror, or migrates its
   data into activity lines and drops it. (Decision needed — see open questions.)

Then the validator ships as a pure TS module (`web/src/lib/nhs/validateClaim.ts`) driven by the
seeded reference data, with the error/comment codes as the rule catalogue. It's usable on day one
(pre-submission checks against the Compass web form) and slots behind the future WebEDI serialiser
unchanged.

---

## 7. Open questions before writing the migration

1. **England-only first, or England + Wales (+ IoM) now?** The code set and rules diverge by country (lots of "Wales only from 01/04/2026", "England only"). Recommendation: **model country on every reference row now**, but only seed/validate **England** first to keep scope tight.
2. **Migrate `nhs_claim_treatment` data into activity lines, or keep both during transition?** There's likely little/no real data yet, so a clean cut is probably fine.
3. **April 2026 vs April 2025 rule sets** — the docs are the **April 2026 (V8/V5.1/V6)** editions and several codes change on 01/04/2026. We should target the **2026** rules as current (today is 2026-06-02) and keep the dictionary dated so prior-year claims still validate correctly.
4. **Is the founder's NHSBSA supplier onboarding going to surface an official data dictionary** we should align field names to? If so, we keep our names internal and map at the serialiser. (Track B dependency — doesn't block this work.)

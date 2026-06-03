-- ============================================================================
-- 0053_fp17_activity_model.sql
-- Restructure the FP17 claim model from fixed treatment columns to the real
-- NHSBSA "9000" activity-code line model, so claims map 1:1 to what Compass
-- validates and (later) to the WebEDI wire format.
--
-- See docs/nhs/fp17-gap-analysis.md for the full rationale. In short: a real
-- FP17 is a SET of 9000 activity codes (each with an optional value + tooth/
-- quadrant), not a fixed "fillings=2, extractions=1" record. This migration
-- introduces:
--
--   nhs_activity_code      - GLOBAL reference dictionary of 9000 codes
--                            (dated + country-scoped; seeded in 0054)
--   nhs_band_charge        - GLOBAL reference of patient charge £ per band/date
--   nhs_claim_activity     - per-claim activity lines (code + value + tooth)
--   nhs_claim_response_code- per-claim comment/error codes returned by Compass
--
-- ...plus patient-identity SNAPSHOT columns + UDA/UOA on nhs_claim, and ortho
-- extension fields (Date of Referral, PAR scores, completion reason).
--
-- NON-DESTRUCTIVE: nhs_claim_treatment is retained (marked deprecated) so the
-- existing claim UI keeps working. A later migration drops it once the UI
-- writes activity lines. Scope: ENGLAND first (country modelled on every
-- reference row; only England seeded/validated for now).
-- ============================================================================

-- ============================================================================
-- Country enum (reference rows + future per-claim country routing)
-- ============================================================================
CREATE TYPE public.nhs_country AS ENUM (
  'ENGLAND',
  'WALES',
  'ISLE_OF_MAN'
);

-- ============================================================================
-- nhs_activity_code — GLOBAL reference dictionary of 9000 codes.
-- Not tenant-scoped: this is public NHS reference data shared by all
-- practices. Keyed by (code, value, country, valid_from) because a single
-- code can mean different things per value (e.g. 9178 value 1=Therapist,
-- 2=Hygienist) and codes retire / change each April.
-- ============================================================================
CREATE TABLE public.nhs_activity_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,                       -- e.g. '9150', '9306'
  value integer,                            -- the "Number" column; NULL if code takes no value
  country public.nhs_country NOT NULL,
  label text NOT NULL,                      -- human description
  -- Band this code belongs to, when it is a Clinical Data Set (CDS) item.
  -- NULL for non-CDS codes. '1'/'2'/'3' or 'ANY' per CDS_Treatment_Bands doc.
  cds_band text,
  is_clinical_data_set boolean NOT NULL DEFAULT false,
  -- Whether this code itself carries / governs UDA (e.g. 9150 band codes)
  governs_uda boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL,
  valid_to date,                            -- NULL = still current
  notes text,                               -- accompaniment rules etc (free text from spec)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE public.nhs_activity_code IS
  'GLOBAL reference: NHSBSA 9000 activity-code dictionary. Dated + country-scoped. Seeded from docs/nhs/spec-text. Not tenant data.';

CREATE UNIQUE INDEX uq_nhs_activity_code_key
  ON public.nhs_activity_code (code, country, valid_from, COALESCE(value, -1));

CREATE INDEX idx_nhs_activity_code_lookup
  ON public.nhs_activity_code (country, code);

CREATE INDEX idx_nhs_activity_code_cds
  ON public.nhs_activity_code (country, cds_band)
  WHERE is_clinical_data_set = true;

-- ============================================================================
-- nhs_band_charge — GLOBAL reference: patient charge £ (pence) per band/date.
-- Used to validate error 108 (invalid/excessive charge) + 109 (HC3 partial).
-- ============================================================================
CREATE TABLE public.nhs_band_charge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country public.nhs_country NOT NULL,
  band text NOT NULL,                       -- '1','2','3','URGENT'
  amount_pence integer NOT NULL CHECK (amount_pence >= 0),
  valid_from date NOT NULL,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE public.nhs_band_charge IS
  'GLOBAL reference: NHS patient charge per band, dated. Changes each April. Seeded in 0054.';

CREATE UNIQUE INDEX uq_nhs_band_charge_key
  ON public.nhs_band_charge (country, band, valid_from);

-- ============================================================================
-- nhs_claim_activity — per-claim activity lines. THIS replaces the fixed
-- columns of nhs_claim_treatment. Tenant-scoped.
-- `code` is stored as text (no hard FK to the dictionary, since dictionary
-- rows are dated and codes retire — validity is checked by the validator).
-- ============================================================================
CREATE TABLE public.nhs_claim_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  nhs_claim_id uuid NOT NULL REFERENCES public.nhs_claim(id) ON DELETE RESTRICT,
  code text NOT NULL,                       -- 9000 code, e.g. '9150'
  value integer,                            -- the code's number (band, count, flag value)
  tooth_number integer,                     -- nullable; for tooth-specific items
  quadrant text,                            -- nullable; 'UR','UL','LR','LL'
  -- DCP attribution (codes 9178/9182 require a GDC number)
  dcp_gdc_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (tooth_number IS NULL OR tooth_number BETWEEN 1 AND 85),
  CHECK (quadrant IS NULL OR quadrant IN ('UR','UL','LR','LL'))
);

COMMENT ON TABLE public.nhs_claim_activity IS
  'Per-claim FP17 activity lines (NHSBSA 9000 codes). Replaces nhs_claim_treatment fixed columns.';

CREATE INDEX idx_nhs_claim_activity_claim
  ON public.nhs_claim_activity (practice_id, nhs_claim_id);

CREATE INDEX idx_nhs_claim_activity_code
  ON public.nhs_claim_activity (practice_id, code);

CREATE TRIGGER trg_nhs_claim_activity_audit
  BEFORE INSERT OR UPDATE ON public.nhs_claim_activity
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- nhs_claim_response_code — Compass returns a SET of comment/error codes per
-- processed claim (not a single rejection string). Tenant-scoped.
-- ============================================================================
CREATE TABLE public.nhs_claim_response_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  nhs_claim_id uuid NOT NULL REFERENCES public.nhs_claim(id) ON DELETE RESTRICT,
  code text NOT NULL,                       -- error/comment code e.g. '101','011'
  severity text NOT NULL DEFAULT 'COMMENT', -- 'ERROR' (rejecting) | 'COMMENT' (advisory)
  message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK (severity IN ('ERROR','COMMENT'))
);

COMMENT ON TABLE public.nhs_claim_response_code IS
  'Comment/error codes returned by Compass for a claim. A claim can have many.';

CREATE INDEX idx_nhs_claim_response_code_claim
  ON public.nhs_claim_response_code (practice_id, nhs_claim_id);

-- ============================================================================
-- nhs_claim — patient-identity SNAPSHOT + outcome columns.
-- A claim is an immutable historical record; demographics must reflect what
-- was submitted, not the live (mutable) patient row. Validated by errors
-- 101 (name/gender) and 102 (DOB). Contact email/mobile here; the "patient
-- declined" state is recorded as activity codes 9175/9176, not columns.
-- ============================================================================
ALTER TABLE public.nhs_claim
  ADD COLUMN snapshot_nhs_number text,
  ADD COLUMN snapshot_title text,
  ADD COLUMN snapshot_forename text,
  ADD COLUMN snapshot_surname text,
  ADD COLUMN snapshot_previous_surname text,
  ADD COLUMN snapshot_sex text,             -- 'M' | 'F'
  ADD COLUMN snapshot_date_of_birth date,
  ADD COLUMN snapshot_address_line1 text,
  ADD COLUMN snapshot_address_line2 text,
  ADD COLUMN snapshot_address_line3 text,
  ADD COLUMN snapshot_postcode text,
  ADD COLUMN patient_email text,
  ADD COLUMN patient_mobile text,
  -- Outcome / contract performance (governed by 9150 band / ortho codes)
  ADD COLUMN uda_awarded numeric(6,2),
  ADD COLUMN uoa_awarded numeric(6,2),
  -- Country routing (England first; default England)
  ADD COLUMN country public.nhs_country NOT NULL DEFAULT 'ENGLAND';

ALTER TABLE public.nhs_claim
  ADD CONSTRAINT nhs_claim_snapshot_sex_chk
  CHECK (snapshot_sex IS NULL OR snapshot_sex IN ('M','F'));

COMMENT ON COLUMN public.nhs_claim.snapshot_surname IS
  'Patient surname AS SUBMITTED (immutable snapshot). Validated by Compass error 101.';
COMMENT ON COLUMN public.nhs_claim.uda_awarded IS
  'Units of Dental Activity awarded by this claim (governed by the 9150 band line). Core to NHS contract performance.';

COMMENT ON TABLE public.nhs_claim_treatment IS
  'DEPRECATED: superseded by nhs_claim_activity (9000-code line model, migration 0053). Retained until the claim UI is migrated, then dropped. Do not build new code against this table.';

-- ============================================================================
-- nhs_claim_orthodontic — extension fields the FP17O actually requires.
-- ============================================================================
ALTER TABLE public.nhs_claim_orthodontic
  ADD COLUMN date_of_referral date,         -- drives the ≥18→9177 commissioner-approval rule
  ADD COLUMN par_score_start integer CHECK (par_score_start IS NULL OR par_score_start >= 0),
  ADD COLUMN par_score_end integer CHECK (par_score_end IS NULL OR par_score_end >= 0),
  ADD COLUMN treatment_proposed boolean,    -- code 9415 indicator
  ADD COLUMN completion_reason text;        -- 'PATIENT_FTR' (9409) | 'PATIENT_REQUESTED' (9410) | etc

COMMENT ON COLUMN public.nhs_claim_orthodontic.date_of_referral IS
  'FP17O Date of Referral. Patient age at this date governs whether 9177 Commissioner Approval is mandatory.';

-- ============================================================================
-- fp17_form_type — correct the FP17W meaning (it is the WALES GDS form, NOT
-- domiciliary; domiciliary is service code 9152).
-- ============================================================================
COMMENT ON TYPE public.fp17_form_type IS
  'FP17 = England GDS. FP17O = orthodontic. FP17W = WALES GDS (not domiciliary — domiciliary is activity code 9152). FP17PR = prior approval.';

COMMENT ON TYPE public.fp17_treatment_band IS
  'DEPRECATED denormalised convenience. The authoritative band comes from the 9150 activity line in nhs_claim_activity. Kept for the existing UI; do not extend.';

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.nhs_activity_code       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhs_band_charge         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhs_claim_activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhs_claim_response_code ENABLE ROW LEVEL SECURITY;

-- Reference dictionaries: readable by any authenticated user (public NHS
-- reference data, not tenant-scoped). Writes only via migrations / service role.
CREATE POLICY nhs_activity_code_select ON public.nhs_activity_code
  FOR SELECT TO authenticated USING (true);
CREATE POLICY nhs_band_charge_select ON public.nhs_band_charge
  FOR SELECT TO authenticated USING (true);

-- Per-claim tables: standard practice-scoped pattern.
CREATE POLICY nhs_claim_activity_select ON public.nhs_claim_activity
  FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_activity_insert ON public.nhs_claim_activity
  FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_activity_update ON public.nhs_claim_activity
  FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_activity_delete ON public.nhs_claim_activity
  FOR DELETE TO authenticated USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY nhs_claim_response_code_select ON public.nhs_claim_response_code
  FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_response_code_insert ON public.nhs_claim_response_code
  FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));

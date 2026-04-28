-- ============================================================================
-- 0010_nhs_fp17.sql
-- NHS FP17 (General Dental Services) claim data model. Designed to map
-- cleanly to NHSBSA's eventual schema once we engage them.
--
--   nhs_performer            - per-staff performer registration
--   nhs_claim                - one row per FP17 / FP17O claim
--   nhs_claim_treatment      - clinical banding + treatment flags
--   nhs_claim_orthodontic    - FP17O extension fields
--   nhs_claim_billing_link   - links claim to billing_item rows
--
-- Submission state machine: DRAFT → READY → SUBMITTED → (ACCEPTED|REJECTED|
-- DUPLICATE) → SCHEDULED_FOR_PAYMENT → PAID. Rejection captures reason +
-- error code so the practice can correct + resubmit.
-- ============================================================================

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE public.nhs_claim_status AS ENUM (
  'DRAFT',
  'READY_TO_SUBMIT',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'ACCEPTED',
  'REJECTED',
  'DUPLICATE',
  'SCHEDULED_FOR_PAYMENT',
  'PAID',
  'CANCELLED'
);

CREATE TYPE public.fp17_form_type AS ENUM (
  'FP17',     -- general dental services
  'FP17O',    -- orthodontic
  'FP17W',    -- domiciliary (home visits)
  'FP17PR'    -- prior approval
);

CREATE TYPE public.fp17_treatment_band AS ENUM (
  'BAND_1',
  'BAND_2',
  'BAND_3',
  'URGENT',
  'BAND_1_WITH_X_RAY',
  'PRESCRIPTION_ONLY',
  'REPAIR_FREE',
  'DENTURE_REPAIR'
);

CREATE TYPE public.iotn_grade AS ENUM (
  'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5'
);

CREATE TYPE public.iotn_aesthetic_component AS ENUM (
  'AC_1','AC_2','AC_3','AC_4','AC_5','AC_6','AC_7','AC_8','AC_9','AC_10'
);

-- ============================================================================
-- nhs_performer
-- ============================================================================
CREATE TABLE public.nhs_performer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  -- NHSBSA performer number (typically 6 digits)
  performer_number text NOT NULL,
  -- The provider number of the practice they performed under
  provider_number text NOT NULL,
  -- Lifecycle dates (performers can leave / re-join)
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  UNIQUE (practice_id, staff_id, performer_number, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.nhs_performer IS
  'Per-staff NHS performer registration. Required on every NHS claim.';

CREATE INDEX idx_nhs_performer_practice_staff_active
  ON public.nhs_performer (practice_id, staff_id)
  WHERE is_active = true;

CREATE TRIGGER trg_nhs_performer_audit
  BEFORE INSERT OR UPDATE ON public.nhs_performer
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- nhs_claim
-- ============================================================================
CREATE TABLE public.nhs_claim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  -- Form variant (FP17 default, FP17O for ortho, etc)
  form_type public.fp17_form_type NOT NULL DEFAULT 'FP17',
  -- Performer (FK to nhs_performer table — the NHS-registered identity at time of treatment)
  performer_id uuid NOT NULL REFERENCES public.nhs_performer(id) ON DELETE RESTRICT,
  -- Course of treatment
  course_of_treatment_id text,  -- internal CoT identifier
  date_of_acceptance date NOT NULL,
  date_of_completion date,
  is_urgent_treatment boolean NOT NULL DEFAULT false,
  number_of_visits integer NOT NULL DEFAULT 1 CHECK (number_of_visits > 0),
  referral_received boolean NOT NULL DEFAULT false,
  referral_details text,
  -- Banding
  treatment_band public.fp17_treatment_band,
  -- Patient charge details (snapshotted from billing at submission)
  patient_charge_pence integer NOT NULL DEFAULT 0 CHECK (patient_charge_pence >= 0),
  exemption_category public.nhs_exemption_category NOT NULL DEFAULT 'NONE',
  exemption_evidence_seen boolean NOT NULL DEFAULT false,
  patient_signature_received boolean NOT NULL DEFAULT false,
  patient_signature_method text,  -- 'DIGITAL', 'IPAD', 'PAPER'
  -- Clinical indicators
  oral_health_status text,
  recall_interval_months integer CHECK (recall_interval_months IS NULL OR recall_interval_months BETWEEN 1 AND 24),
  -- Submission lifecycle
  status public.nhs_claim_status NOT NULL DEFAULT 'DRAFT',
  ready_to_submit_at timestamptz,
  submitted_at timestamptz,
  submission_reference text,         -- NHSBSA-issued submission ID
  acknowledged_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_code text,
  rejection_reason text,
  scheduled_for_payment_at timestamptz,
  paid_at timestamptz,
  payment_amount_pence integer,
  -- Linkage
  source_appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (date_of_completion IS NULL OR date_of_completion >= date_of_acceptance)
);

COMMENT ON TABLE public.nhs_claim IS
  'FP17/FP17O claim header. Maps to NHSBSA submission schema. status drives the submission workflow.';

CREATE INDEX idx_nhs_claim_practice_status
  ON public.nhs_claim (practice_id, status, date_of_acceptance DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_nhs_claim_practice_patient
  ON public.nhs_claim (practice_id, patient_id, date_of_acceptance DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_nhs_claim_practice_completion
  ON public.nhs_claim (practice_id, date_of_completion)
  WHERE date_of_completion IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_nhs_claim_performer
  ON public.nhs_claim (performer_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_nhs_claim_audit
  BEFORE INSERT OR UPDATE ON public.nhs_claim
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- nhs_claim_treatment — flags + counts driving the band determination
-- ============================================================================
CREATE TABLE public.nhs_claim_treatment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  nhs_claim_id uuid NOT NULL UNIQUE REFERENCES public.nhs_claim(id) ON DELETE RESTRICT,
  -- Treatment counts
  examination boolean NOT NULL DEFAULT false,
  scale_and_polish boolean NOT NULL DEFAULT false,
  fluoride_varnish boolean NOT NULL DEFAULT false,
  fissure_sealants boolean NOT NULL DEFAULT false,
  -- Restorative
  fillings_count integer NOT NULL DEFAULT 0 CHECK (fillings_count >= 0),
  extractions_count integer NOT NULL DEFAULT 0 CHECK (extractions_count >= 0),
  endodontic_count integer NOT NULL DEFAULT 0 CHECK (endodontic_count >= 0),
  -- Prosthetics
  crowns_count integer NOT NULL DEFAULT 0 CHECK (crowns_count >= 0),
  bridges_count integer NOT NULL DEFAULT 0 CHECK (bridges_count >= 0),
  dentures_count integer NOT NULL DEFAULT 0 CHECK (dentures_count >= 0),
  -- Imaging
  x_rays_taken integer NOT NULL DEFAULT 0 CHECK (x_rays_taken >= 0),
  -- Periodontal
  periodontal_treatment boolean NOT NULL DEFAULT false,
  -- Other
  free_repair_or_replacement boolean NOT NULL DEFAULT false,
  antibiotic_items integer NOT NULL DEFAULT 0 CHECK (antibiotic_items >= 0),
  -- Specific tooth / surface arrays for clinical detail
  treated_tooth_numbers integer[],
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (app_private.fn_is_valid_tooth_array(treated_tooth_numbers))
);

COMMENT ON TABLE public.nhs_claim_treatment IS
  'Treatment-level detail for an FP17 claim. Counts and flags determine the band.';

CREATE INDEX idx_nhs_claim_treatment_practice
  ON public.nhs_claim_treatment (practice_id);

CREATE TRIGGER trg_nhs_claim_treatment_audit
  BEFORE INSERT OR UPDATE ON public.nhs_claim_treatment
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- nhs_claim_orthodontic — FP17O specific
-- ============================================================================
CREATE TABLE public.nhs_claim_orthodontic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  nhs_claim_id uuid NOT NULL UNIQUE REFERENCES public.nhs_claim(id) ON DELETE RESTRICT,
  -- IOTN (Index of Orthodontic Treatment Need)
  iotn_dental_health_grade public.iotn_grade,
  iotn_aesthetic_component public.iotn_aesthetic_component,
  -- Lifecycle
  assessment_date date,
  appliance_fitted_date date,
  treatment_start_date date,
  treatment_completion_date date,
  -- Discontinuation
  discontinued_at date,
  discontinuation_reason text,
  -- Retention phase
  retention_phase_started boolean NOT NULL DEFAULT false,
  retention_phase_started_at date,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.nhs_claim_orthodontic IS
  'FP17O extension. Captures IOTN, appliance dates, retention phase.';

CREATE INDEX idx_nhs_claim_orthodontic_practice
  ON public.nhs_claim_orthodontic (practice_id);

CREATE TRIGGER trg_nhs_claim_orthodontic_audit
  BEFORE INSERT OR UPDATE ON public.nhs_claim_orthodontic
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- nhs_claim_billing_link — connects claim to billing_item rows so we can
-- show "this claim covers these line items"
-- ============================================================================
CREATE TABLE public.nhs_claim_billing_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  nhs_claim_id uuid NOT NULL REFERENCES public.nhs_claim(id) ON DELETE RESTRICT,
  billing_item_id uuid NOT NULL REFERENCES public.billing_item(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nhs_claim_id, billing_item_id)
);

CREATE INDEX idx_nhs_claim_billing_link_claim ON public.nhs_claim_billing_link (nhs_claim_id);
CREATE INDEX idx_nhs_claim_billing_link_billing ON public.nhs_claim_billing_link (billing_item_id);
CREATE INDEX idx_nhs_claim_billing_link_practice ON public.nhs_claim_billing_link (practice_id);

-- ============================================================================
-- RLS — same pattern, all tables practice-scoped
-- ============================================================================
ALTER TABLE public.nhs_performer            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhs_claim                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhs_claim_treatment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhs_claim_orthodontic    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhs_claim_billing_link   ENABLE ROW LEVEL SECURITY;

-- Performer registry: read all, write by admin
CREATE POLICY nhs_performer_select ON public.nhs_performer FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_performer_admin_insert ON public.nhs_performer FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY nhs_performer_admin_update ON public.nhs_performer FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- Claims: read+write by all members (clinicians submit, receptionists check)
CREATE POLICY nhs_claim_select ON public.nhs_claim FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_insert ON public.nhs_claim FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_update ON public.nhs_claim FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY nhs_claim_treatment_select ON public.nhs_claim_treatment FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_treatment_insert ON public.nhs_claim_treatment FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_treatment_update ON public.nhs_claim_treatment FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY nhs_claim_orthodontic_select ON public.nhs_claim_orthodontic FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_orthodontic_insert ON public.nhs_claim_orthodontic FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_orthodontic_update ON public.nhs_claim_orthodontic FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY nhs_claim_billing_link_select ON public.nhs_claim_billing_link FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_billing_link_insert ON public.nhs_claim_billing_link FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY nhs_claim_billing_link_delete ON public.nhs_claim_billing_link FOR DELETE TO authenticated USING (practice_id = (select app_private.current_practice_id()));

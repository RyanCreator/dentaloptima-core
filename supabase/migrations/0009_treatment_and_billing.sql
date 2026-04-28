-- ============================================================================
-- 0009_treatment_and_billing.sql
-- Treatment planning + billing core:
--   treatment_plan         - proposed pathway (DRAFT → PROPOSED → ACCEPTED → IN_PROGRESS → COMPLETED)
--   treatment_plan_item    - line items with tooth_numbers, sequence, optional appointment link
--   referral               - specialist referrals (internal or external)
--   billing_item           - per-appointment line items with NHS exemption + payment status
--   recall                 - auto-created on COMPLETED appointments for services with recall_months
-- ============================================================================

-- ============================================================================
-- Helper: validate FDI tooth numbers (subqueries aren't allowed in CHECK,
-- so we wrap the validation in an IMMUTABLE function).
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.fn_is_valid_tooth_array(t integer[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT t IS NULL OR (
    SELECT bool_and(x BETWEEN 11 AND 48 OR x BETWEEN 51 AND 85)
    FROM unnest(t) AS x
  );
$$;

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE public.treatment_plan_status AS ENUM (
  'DRAFT',
  'PROPOSED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'DECLINED',
  'EXPIRED'
);

CREATE TYPE public.treatment_plan_item_status AS ENUM (
  'PROPOSED',
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE public.referral_status AS ENUM (
  'DRAFT',
  'SENT',
  'ACKNOWLEDGED',
  'ACCEPTED',
  'DECLINED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE public.referral_urgency AS ENUM (
  'ROUTINE', 'URGENT', 'TWO_WEEK_WAIT'
);

CREATE TYPE public.payment_status AS ENUM (
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'REFUNDED',
  'WRITTEN_OFF',
  'NHS_CLAIMED'  -- for NHS billing covered by claim
);

CREATE TYPE public.recall_status AS ENUM (
  'PENDING',
  'REMINDED',
  'BOOKED',
  'COMPLETED',
  'MISSED',
  'CANCELLED'
);

CREATE TYPE public.nhs_exemption_category AS ENUM (
  'NONE',
  'UNDER_18',
  'UNDER_19_FULL_TIME_EDUCATION',
  'PREGNANT',
  'NURSING_MOTHER_12M',
  'INCOME_SUPPORT',
  'JOBSEEKERS_ALLOWANCE',
  'ESA_INCOME_RELATED',
  'PENSION_CREDIT_GUARANTEE',
  'UNIVERSAL_CREDIT_QUALIFYING',
  'NHS_TAX_CREDIT_EXEMPTION',
  'HC2_FULL_HELP',
  'HC3_PARTIAL_HELP',
  'OTHER'
);

-- ============================================================================
-- treatment_plan
-- ============================================================================
CREATE TABLE public.treatment_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  -- The dentist who proposed it
  proposed_by uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  status public.treatment_plan_status NOT NULL DEFAULT 'DRAFT',
  -- Lifecycle
  proposed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  declined_reason text,
  completed_at timestamptz,
  expires_at timestamptz,
  -- Pricing snapshot
  total_estimated_pence integer,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.treatment_plan IS
  'Proposed care pathway for a patient. DRAFT until ready, PROPOSED when shown to patient, ACCEPTED to begin scheduling.';

CREATE INDEX idx_treatment_plan_practice_patient
  ON public.treatment_plan (practice_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_treatment_plan_practice_status
  ON public.treatment_plan (practice_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_treatment_plan_audit
  BEFORE INSERT OR UPDATE ON public.treatment_plan
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- treatment_plan_item
-- ============================================================================
CREATE TABLE public.treatment_plan_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  treatment_plan_id uuid NOT NULL REFERENCES public.treatment_plan(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.service(id) ON DELETE RESTRICT,
  -- FDI notation: ints 11-48 (adult) and 51-85 (deciduous)
  tooth_numbers integer[],
  surface text,  -- e.g. 'MO', 'DOL' etc
  sequence integer NOT NULL DEFAULT 0,
  status public.treatment_plan_item_status NOT NULL DEFAULT 'PROPOSED',
  -- Scheduling
  scheduled_appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  completed_appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  completed_at timestamptz,
  -- Snapshot at proposal time
  price_pence_snapshot integer,
  duration_minutes_snapshot integer,
  notes text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  -- All tooth numbers must be valid FDI (validated via IMMUTABLE helper)
  CHECK (app_private.fn_is_valid_tooth_array(tooth_numbers))
);

COMMENT ON TABLE public.treatment_plan_item IS
  'Line items in a treatment plan. tooth_numbers uses FDI notation. Sequence enforces order of work.';

CREATE INDEX idx_tpi_practice_plan
  ON public.treatment_plan_item (practice_id, treatment_plan_id, sequence)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_tpi_scheduled_appt
  ON public.treatment_plan_item (scheduled_appointment_id)
  WHERE scheduled_appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_tpi_completed_appt
  ON public.treatment_plan_item (completed_appointment_id)
  WHERE completed_appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_tpi_service
  ON public.treatment_plan_item (service_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_tpi_audit
  BEFORE INSERT OR UPDATE ON public.treatment_plan_item
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- referral
-- ============================================================================
CREATE TABLE public.referral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  -- Referring dentist
  referred_by uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  -- The specialist (could be a member of another practice in our DB,
  -- or an external specialist captured as text)
  internal_specialist_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  external_specialist_name text,
  external_specialist_practice text,
  external_specialist_email extensions.citext,
  external_specialist_phone text,
  external_specialist_address text,
  -- The referral
  reason text NOT NULL,
  clinical_summary text,
  urgency public.referral_urgency NOT NULL DEFAULT 'ROUTINE',
  status public.referral_status NOT NULL DEFAULT 'DRAFT',
  -- Lifecycle
  sent_at timestamptz,
  acknowledged_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  declined_reason text,
  completed_at timestamptz,
  -- Document attached (referral letter PDF)
  document_id uuid REFERENCES public.document(id) ON DELETE SET NULL,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (internal_specialist_id IS NOT NULL OR external_specialist_name IS NOT NULL)
);

COMMENT ON TABLE public.referral IS
  'Specialist referrals (internal or external). Status flow: DRAFT → SENT → ACKNOWLEDGED → ACCEPTED → IN_PROGRESS → COMPLETED.';

CREATE INDEX idx_referral_practice_patient
  ON public.referral (practice_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_referral_practice_status
  ON public.referral (practice_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_referral_audit
  BEFORE INSERT OR UPDATE ON public.referral
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- billing_item
-- ============================================================================
CREATE TABLE public.billing_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.appointment(id) ON DELETE RESTRICT,
  treatment_plan_item_id uuid REFERENCES public.treatment_plan_item(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.service(id) ON DELETE SET NULL,
  -- Description (snapshot of service name at time of billing)
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- Pricing in pence
  unit_price_pence integer NOT NULL CHECK (unit_price_pence >= 0),
  total_pence integer NOT NULL CHECK (total_pence >= 0),
  -- NHS context
  is_nhs boolean NOT NULL DEFAULT false,
  nhs_band public.nhs_band,
  nhs_exemption_category public.nhs_exemption_category NOT NULL DEFAULT 'NONE',
  exemption_evidence_seen boolean NOT NULL DEFAULT false,
  -- Payment
  payment_status public.payment_status NOT NULL DEFAULT 'UNPAID',
  amount_paid_pence integer NOT NULL DEFAULT 0 CHECK (amount_paid_pence >= 0),
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (NOT (is_nhs AND nhs_band IS NULL))
);

COMMENT ON TABLE public.billing_item IS
  'Billable line items. NHS items track band + exemption category for FP17 reporting (FP17 claim records come in 0010).';

CREATE INDEX idx_billing_item_practice_patient
  ON public.billing_item (practice_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_billing_item_practice_unpaid
  ON public.billing_item (practice_id, payment_status)
  WHERE payment_status IN ('UNPAID', 'PARTIALLY_PAID') AND deleted_at IS NULL;

CREATE INDEX idx_billing_item_appointment
  ON public.billing_item (appointment_id)
  WHERE appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_billing_item_audit
  BEFORE INSERT OR UPDATE ON public.billing_item
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- recall
-- ============================================================================
CREATE TABLE public.recall (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  service_id uuid REFERENCES public.service(id) ON DELETE SET NULL,
  -- The appointment that triggered this recall (NULL for manually created)
  source_appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  -- Scheduling
  due_date date NOT NULL,
  status public.recall_status NOT NULL DEFAULT 'PENDING',
  -- Lifecycle
  reminded_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  booked_appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  booked_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  notes text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.recall IS
  'Patient recalls. Auto-created via trigger when an appointment with a recall-bearing service is COMPLETED.';

CREATE INDEX idx_recall_practice_due
  ON public.recall (practice_id, due_date)
  WHERE status IN ('PENDING', 'REMINDED') AND deleted_at IS NULL;

CREATE INDEX idx_recall_practice_patient
  ON public.recall (practice_id, patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_recall_source_appt
  ON public.recall (source_appointment_id)
  WHERE source_appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_recall_audit
  BEFORE INSERT OR UPDATE ON public.recall
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- Auto-create recall when appointment is COMPLETED for a recall-bearing service
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.fn_create_recall_on_appt_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_service record;
BEGIN
  -- Only fire on transition INTO completed
  IF NEW.status = 'COMPLETED'
     AND (OLD.status IS NULL OR OLD.status <> 'COMPLETED')
     AND NEW.recall_created = false THEN

    -- For each service on the appointment that has recall_months set,
    -- create a recall (if one doesn't already exist for the same source)
    FOR v_service IN
      SELECT s.id, s.recall_months
      FROM public.appointment_service apsv
      JOIN public.service s ON s.id = apsv.service_id
      WHERE apsv.appointment_id = NEW.id
        AND s.recall_months IS NOT NULL
    LOOP
      INSERT INTO public.recall (
        practice_id, patient_id, service_id, source_appointment_id, due_date
      )
      VALUES (
        NEW.practice_id,
        NEW.patient_id,
        v_service.id,
        NEW.id,
        (NEW.completed_at::date) + (v_service.recall_months || ' months')::interval
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    NEW.recall_created := true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appt_create_recall
  BEFORE UPDATE ON public.appointment
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_create_recall_on_appt_complete();

-- ============================================================================
-- RLS — same pattern as scheduling (members of practice = read+write)
-- ============================================================================
ALTER TABLE public.treatment_plan       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plan_item  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_item         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recall               ENABLE ROW LEVEL SECURITY;

CREATE POLICY tp_select ON public.treatment_plan FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY tp_insert ON public.treatment_plan FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY tp_update ON public.treatment_plan FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY tpi_select ON public.treatment_plan_item FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY tpi_insert ON public.treatment_plan_item FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY tpi_update ON public.treatment_plan_item FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY tpi_delete ON public.treatment_plan_item FOR DELETE TO authenticated USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY referral_select ON public.referral FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY referral_insert ON public.referral FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY referral_update ON public.referral FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY billing_select ON public.billing_item FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY billing_insert ON public.billing_item FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY billing_update ON public.billing_item FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY recall_select ON public.recall FOR SELECT TO authenticated USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY recall_insert ON public.recall FOR INSERT TO authenticated WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY recall_update ON public.recall FOR UPDATE TO authenticated USING (practice_id = (select app_private.current_practice_id())) WITH CHECK (practice_id = (select app_private.current_practice_id()));

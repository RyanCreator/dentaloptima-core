-- ============================================================================
-- 0012_audit_and_retention.sql
-- Audit trail + retention helpers.
--   audit                       - generic audit log (system tables, billing, scheduling)
--   clinical_audit              - clinical record changes (separate so CQC inspector
--                                 has a clean window into clinical activity)
--   fn_audit_log                - generic trigger function, wires onto every
--                                 sensitive table
--   fn_patient_retention_eligible - returns patients past retention, never
--                                   auto-deletes (clinician must approve)
--
-- Retention rules baked in:
--   * Adults: 11 years from last clinical record (or DOD + 11 if deceased)
--   * Under-18s: until age 25 (or 26 if last record at 17)
--   * legal_hold = true blocks all retention deletion
-- ============================================================================

-- ============================================================================
-- audit + clinical_audit
-- ============================================================================
CREATE TYPE public.audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- Generic audit (system + non-clinical)
CREATE TABLE public.audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid REFERENCES public.practice(id) ON DELETE RESTRICT,
  performed_by_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  performed_by_email text,  -- snapshot in case practice_member is later deleted
  action public.audit_action NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_data jsonb,
  after_data jsonb,
  -- Optional context (set via SET LOCAL app.audit_context = '...' before action)
  context text,
  performed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit IS
  'Generic audit log. Append-only — never delete or update rows here. Used by CQC inspector for non-clinical change history.';

CREATE INDEX idx_audit_practice_entity
  ON public.audit (practice_id, entity_type, entity_id, performed_at DESC);

CREATE INDEX idx_audit_practice_actor_time
  ON public.audit (practice_id, performed_by_id, performed_at DESC);

CREATE INDEX idx_audit_practice_time
  ON public.audit (practice_id, performed_at DESC);

-- Clinical audit (patient + clinical tables only)
CREATE TABLE public.clinical_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid REFERENCES public.patient(id) ON DELETE RESTRICT,
  performed_by_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  performed_by_email text,
  action public.audit_action NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_data jsonb,
  after_data jsonb,
  context text,
  performed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clinical_audit IS
  'Clinical record changes only. Separate from generic audit so CQC inspector can scope to clinical activity quickly. Append-only.';

CREATE INDEX idx_clinical_audit_practice_patient_time
  ON public.clinical_audit (practice_id, patient_id, performed_at DESC)
  WHERE patient_id IS NOT NULL;

CREATE INDEX idx_clinical_audit_practice_entity
  ON public.clinical_audit (practice_id, entity_type, entity_id, performed_at DESC);

CREATE INDEX idx_clinical_audit_practice_actor_time
  ON public.clinical_audit (practice_id, performed_by_id, performed_at DESC);

-- ============================================================================
-- Generic audit trigger function
-- Reads NEW/OLD as jsonb so it works without knowing column names.
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_after        jsonb;
  v_before       jsonb;
  v_practice_id  uuid;
  v_patient_id   uuid;
  v_entity_id    uuid;
  v_member_id    uuid;
  v_member_email text;
  v_context      text;
  v_clinical_tables text[] := ARRAY[
    'patient', 'medical_history_entry', 'medical_alert', 'consent_record',
    'note', 'document', 'treatment_plan', 'treatment_plan_item', 'referral',
    'prescription', 'safeguarding_concern'
  ];
BEGIN
  v_after  := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;

  v_practice_id := COALESCE(v_after->>'practice_id', v_before->>'practice_id')::uuid;
  v_entity_id   := COALESCE(v_after->>'id', v_before->>'id')::uuid;

  -- Patient context: either the row IS a patient, or it has a patient_id column
  IF TG_TABLE_NAME = 'patient' THEN
    v_patient_id := v_entity_id;
  ELSE
    v_patient_id := COALESCE(v_after->>'patient_id', v_before->>'patient_id')::uuid;
  END IF;

  -- Resolve actor
  IF auth.uid() IS NOT NULL THEN
    SELECT id, email INTO v_member_id, v_member_email
    FROM public.practice_member
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  -- Optional context (e.g. callers can SET LOCAL app.audit_context = 'IMPORT')
  BEGIN
    v_context := current_setting('app.audit_context', true);
  EXCEPTION WHEN others THEN
    v_context := NULL;
  END;

  IF TG_TABLE_NAME = ANY(v_clinical_tables) THEN
    INSERT INTO public.clinical_audit (
      practice_id, patient_id, performed_by_id, performed_by_email,
      action, entity_type, entity_id, before_data, after_data, context
    ) VALUES (
      v_practice_id, v_patient_id, v_member_id, v_member_email,
      TG_OP::public.audit_action, TG_TABLE_NAME, v_entity_id,
      v_before, v_after, v_context
    );
  ELSE
    INSERT INTO public.audit (
      practice_id, performed_by_id, performed_by_email,
      action, entity_type, entity_id, before_data, after_data, context
    ) VALUES (
      v_practice_id, v_member_id, v_member_email,
      TG_OP::public.audit_action, TG_TABLE_NAME, v_entity_id,
      v_before, v_after, v_context
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================================
-- Wire audit trigger to sensitive tables. AFTER trigger so the row exists
-- before we capture it (matters for INSERTs).
-- ============================================================================
DO $$
DECLARE
  t text;
  audited_tables text[] := ARRAY[
    -- Identity
    'practice', 'practice_member',
    -- Clinical
    'patient', 'medical_history_entry', 'medical_alert', 'consent_record',
    'document', 'note',
    -- Scheduling
    'appointment', 'booking_request',
    -- Treatment + billing
    'treatment_plan', 'treatment_plan_item', 'referral', 'billing_item', 'recall',
    -- NHS
    'nhs_performer', 'nhs_claim', 'nhs_claim_treatment', 'nhs_claim_orthodontic',
    -- Governance
    'incident_report', 'complaint', 'safeguarding_concern', 'prescription',
    'policy', 'policy_acknowledgement'
  ];
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%I_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.fn_audit_log()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- patient.last_visited_at maintainer
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.fn_patient_last_visited()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'COMPLETED'
     AND (OLD.status IS NULL OR OLD.status <> 'COMPLETED') THEN
    UPDATE public.patient
    SET last_visited_at = NEW.completed_at
    WHERE id = NEW.patient_id
      AND (last_visited_at IS NULL OR last_visited_at < NEW.completed_at);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appt_patient_last_visited
  AFTER UPDATE ON public.appointment
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_patient_last_visited();

-- ============================================================================
-- Retention helpers — read-only flagging. NEVER auto-deletes clinical data.
-- An admin must explicitly invoke a separate hard-delete RPC after review.
-- ============================================================================

-- Returns true if a patient is past retention and eligible for hard delete
-- (subject to legal_hold = false override).
CREATE OR REPLACE FUNCTION app_private.fn_patient_retention_eligible(p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_patient        record;
  v_last_clinical  timestamptz;
  v_min_keep_until timestamptz;
BEGIN
  SELECT * INTO v_patient
  FROM public.patient
  WHERE id = p_patient_id;

  IF v_patient IS NULL OR v_patient.legal_hold THEN
    RETURN false;
  END IF;

  -- Find the most recent clinical activity (last_visited_at, or any
  -- clinical_audit / appointment record). Use the latest timestamp.
  SELECT GREATEST(
    COALESCE(v_patient.last_visited_at, '-infinity'::timestamptz),
    COALESCE((SELECT MAX(performed_at) FROM public.clinical_audit WHERE patient_id = p_patient_id), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(starts_at) FROM public.appointment WHERE patient_id = p_patient_id AND deleted_at IS NULL), '-infinity'::timestamptz),
    v_patient.created_at
  ) INTO v_last_clinical;

  -- Adult rule: 11 years after last clinical activity
  v_min_keep_until := v_last_clinical + interval '11 years';

  -- Under-18 rule: also keep until age 25 (or age 26 if last entry at 17)
  IF v_patient.dob IS NOT NULL THEN
    -- Age at last activity
    DECLARE
      v_age_at_last_entry integer := extract(year from age(v_last_clinical, v_patient.dob));
      v_min_age_target integer;
    BEGIN
      IF v_age_at_last_entry < 18 THEN
        IF v_age_at_last_entry = 17 THEN
          v_min_age_target := 26;
        ELSE
          v_min_age_target := 25;
        END IF;
        v_min_keep_until := GREATEST(
          v_min_keep_until,
          v_patient.dob::timestamptz + (v_min_age_target || ' years')::interval
        );
      END IF;
    END;
  END IF;

  -- Deceased rule: 11 years after death
  IF v_patient.registration_status = 'DECEASED' THEN
    -- We don't have a date_of_death column yet; fall back to last_visited_at + 11 years
    v_min_keep_until := GREATEST(v_min_keep_until, COALESCE(v_patient.last_visited_at, v_patient.updated_at) + interval '11 years');
  END IF;

  RETURN now() > v_min_keep_until;
END;
$$;

GRANT EXECUTE ON FUNCTION app_private.fn_patient_retention_eligible(uuid) TO authenticated;

-- Listing helper for the admin UI
CREATE OR REPLACE FUNCTION app_private.fn_list_retention_eligible_patients(p_practice_id uuid)
RETURNS TABLE (
  patient_id uuid,
  patient_number integer,
  full_name text,
  dob date,
  last_visited_at timestamptz,
  registration_status public.patient_registration_status
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    p.id,
    p.patient_number,
    p.full_name,
    p.dob,
    p.last_visited_at,
    p.registration_status
  FROM public.patient p
  WHERE p.practice_id = p_practice_id
    AND p.legal_hold = false
    AND app_private.fn_patient_retention_eligible(p.id)
  ORDER BY p.last_visited_at NULLS FIRST;
$$;

GRANT EXECUTE ON FUNCTION app_private.fn_list_retention_eligible_patients(uuid) TO authenticated;

-- ============================================================================
-- RLS — audit + clinical_audit
-- READ ONLY for members. No INSERT/UPDATE/DELETE policies (audit is written
-- only by the trigger, which runs as SECURITY DEFINER and bypasses RLS).
-- ============================================================================
ALTER TABLE public.audit          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_select ON public.audit FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY clinical_audit_select ON public.clinical_audit FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

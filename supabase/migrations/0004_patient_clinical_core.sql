-- ============================================================================
-- 0004_patient_clinical_core.sql
-- Patient identity, medical history, alerts, consent records, documents,
-- and clinical notes. All practice-scoped via practice_id RLS.
--
-- Design notes:
--   * Per-practice patient_number (e.g. "P00042") assigned via advisory-lock
--     trigger so concurrent INSERTs don't collide
--   * Polymorphic note table with parent_type+parent_id. is_confidential
--     restricts read to admin + author
--   * Medical alerts are a separate, banner-prominent table — not just a
--     red flag column on patient — so they can have severity, expiry,
--     and an audit trail
--   * Document table holds metadata only; files live in Supabase Storage
--     at patient-files/{practice_id}/{patient_id}/{type}/{filename}
--     (Storage bucket + RLS in 0008)
--   * `legal_hold = true` on a patient blocks the retention auto-delete
--     cron (added in 0007) — required when there's an open complaint,
--     CQC inspection, or solicitor request
-- ============================================================================

-- Extensions: case-insensitive email + trigram search for fast name lookup
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ============================================================================
-- Helpers (added to app_private from 0001)
-- ============================================================================

-- Resolve the calling user's practice_member.id (not just their practice_id).
-- Used by audit-column triggers and by RLS policies that need to compare
-- against author_id / created_by.
CREATE OR REPLACE FUNCTION app_private.current_member_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM public.practice_member
  WHERE user_id = auth.uid()
    AND is_active = true
    AND deleted_at IS NULL
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION app_private.current_member_id() TO authenticated;

-- Trigger function: maintain created_by, updated_by, updated_at on any
-- table that has those columns. SECURITY DEFINER so it can read
-- practice_member regardless of caller's RLS.
CREATE OR REPLACE FUNCTION app_private.fn_set_audit_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_member_id uuid;
BEGIN
  NEW.updated_at := now();

  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_member_id
    FROM public.practice_member
    WHERE user_id = auth.uid()
      AND is_active = true
      AND deleted_at IS NULL
    LIMIT 1;

    NEW.updated_by := v_member_id;

    IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
      NEW.created_by := v_member_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE public.patient_registration_status AS ENUM (
  'PROSPECT',     -- enquiry only, not yet registered
  'REGISTERED',   -- active patient
  'INACTIVE',     -- no recent activity, not formally deregistered
  'DECEASED'
);

CREATE TYPE public.gender AS ENUM (
  'MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'
);

CREATE TYPE public.medical_history_entry_type AS ENUM (
  'CONDITION', 'MEDICATION', 'ALLERGY', 'PROCEDURE', 'EVENT'
);

CREATE TYPE public.severity AS ENUM (
  'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
);

CREATE TYPE public.medical_alert_type AS ENUM (
  'ALLERGY',
  'MEDICAL_CONDITION',
  'ANTICOAGULANT',
  'PREGNANCY',
  'LATEX_ALLERGY',
  'INFECTION_RISK',
  'DRUG_INTERACTION',
  'SAFEGUARDING',
  'OTHER'
);

CREATE TYPE public.consent_type AS ENUM (
  'PRIVACY_NOTICE',
  'TREATMENT_GENERAL',
  'TREATMENT_SPECIFIC',
  'X_RAY',
  'SEDATION',
  'PHOTOGRAPHY',
  'NHS_TERMS',
  'MARKETING',
  'DATA_SHARING'
);

CREATE TYPE public.consent_method AS ENUM (
  'DIGITAL_SIGNATURE',
  'IPAD_SIGNATURE',
  'PAPER',
  'VERBAL'
);

CREATE TYPE public.document_type AS ENUM (
  'X_RAY',
  'INTRA_ORAL_PHOTO',
  'CONSENT_FORM',
  'REFERRAL_LETTER',
  'ID_DOCUMENT',
  'INSURANCE_DOCUMENT',
  'MEDICAL_REPORT',
  'TREATMENT_PLAN_PDF',
  'OTHER'
);

CREATE TYPE public.note_parent_type AS ENUM (
  'PATIENT',
  'APPOINTMENT',
  'BOOKING_REQUEST',
  'TREATMENT_PLAN',
  'MEDICAL_HISTORY_ENTRY',
  'CONSENT_RECORD',
  'REFERRAL',
  'INCIDENT_REPORT',
  'COMPLAINT'
);

CREATE TYPE public.note_type AS ENUM (
  'CLINICAL',
  'ADMIN',
  'COMMUNICATION',
  'CONSULTATION',
  'OBSERVATION'
);

-- ============================================================================
-- patient
-- ============================================================================
CREATE TABLE public.patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_number integer,  -- per-practice human-friendly ID, assigned by trigger
  -- Names
  title text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_name text,
  full_name text GENERATED ALWAYS AS (
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) STORED,
  -- Demographics
  dob date,
  gender public.gender,
  ethnicity text,
  -- NHS
  nhs_number text CHECK (nhs_number IS NULL OR nhs_number ~ '^[0-9]{10}$'),
  -- Contact
  email extensions.citext,
  phone text,
  phone_alt text,
  -- Address
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  country text NOT NULL DEFAULT 'GB',
  -- Emergency contact
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  -- GP (their general practitioner — not us)
  gp_name text,
  gp_practice_name text,
  gp_practice_address text,
  -- Care assignment
  preferred_dentist_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  -- Recall
  recall_months_override integer CHECK (recall_months_override IS NULL OR recall_months_override BETWEEN 1 AND 24),
  next_recall_date date,
  last_visited_at timestamptz,
  -- Lifecycle
  registration_status public.patient_registration_status NOT NULL DEFAULT 'PROSPECT',
  registered_at timestamptz,
  -- Marketing consent (GDPR)
  marketing_consent_email boolean NOT NULL DEFAULT false,
  marketing_consent_sms boolean NOT NULL DEFAULT false,
  marketing_consent_post boolean NOT NULL DEFAULT false,
  marketing_consent_recorded_at timestamptz,
  communication_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Profile photo (storage path; bucket created in 0008)
  profile_photo_path text,
  -- Retention guard: blocks auto-delete cron in 0007
  legal_hold boolean NOT NULL DEFAULT false,
  legal_hold_reason text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  -- Constraints
  UNIQUE (practice_id, patient_number)
);

COMMENT ON TABLE public.patient IS
  'Patient record. (practice_id, patient_number) is the human-friendly key; id is the global UUID. legal_hold blocks retention auto-delete.';

-- Indexes for common queries (all leading with practice_id for tenant pruning)
CREATE INDEX idx_patient_practice_lastname
  ON public.patient (practice_id, last_name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_patient_practice_status
  ON public.patient (practice_id, registration_status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_patient_practice_recall
  ON public.patient (practice_id, next_recall_date)
  WHERE deleted_at IS NULL AND next_recall_date IS NOT NULL;

CREATE INDEX idx_patient_practice_email
  ON public.patient (practice_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_patient_practice_phone
  ON public.patient (practice_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_patient_practice_nhs
  ON public.patient (practice_id, nhs_number)
  WHERE nhs_number IS NOT NULL AND deleted_at IS NULL;

-- Trigram index on full_name for ilike '%search%' searches
CREATE INDEX idx_patient_full_name_trgm
  ON public.patient
  USING gin (full_name extensions.gin_trgm_ops);

-- Per-practice patient_number assignment via advisory lock (cheap, scoped to
-- the practice — won't block patient_number assignments for other practices)
CREATE OR REPLACE FUNCTION app_private.fn_assign_patient_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.patient_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('patient_number:' || NEW.practice_id::text));
    SELECT COALESCE(MAX(patient_number), 0) + 1
      INTO NEW.patient_number
      FROM public.patient
      WHERE practice_id = NEW.practice_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_patient_assign_number
  BEFORE INSERT ON public.patient
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_assign_patient_number();

CREATE TRIGGER trg_patient_audit
  BEFORE INSERT OR UPDATE ON public.patient
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- medical_history_entry
-- ============================================================================
CREATE TABLE public.medical_history_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  entry_type public.medical_history_entry_type NOT NULL,
  description text NOT NULL,
  severity public.severity,
  is_active boolean NOT NULL DEFAULT true,
  onset_date date,
  resolved_date date,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (resolved_date IS NULL OR resolved_date >= onset_date)
);

COMMENT ON TABLE public.medical_history_entry IS
  'Structured medical history. CQC requires this be append-only in spirit — use deleted_at + new entries for corrections, never UPDATE the description.';

CREATE INDEX idx_mhe_practice_patient
  ON public.medical_history_entry (practice_id, patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_mhe_active_critical
  ON public.medical_history_entry (practice_id, patient_id)
  WHERE is_active = true AND severity IN ('HIGH', 'CRITICAL') AND deleted_at IS NULL;

CREATE TRIGGER trg_mhe_audit
  BEFORE INSERT OR UPDATE ON public.medical_history_entry
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- medical_alert — banner-prominent flags shown at top of patient record
-- ============================================================================
CREATE TABLE public.medical_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  alert_type public.medical_alert_type NOT NULL,
  severity public.severity NOT NULL DEFAULT 'HIGH',
  title text NOT NULL,
  detail text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,  -- e.g. pregnancy alert auto-expires
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.medical_alert IS
  'Banner-level patient warnings (allergies, anticoagulants, pregnancy, latex). Shown at top of patient record. Separate from medical_history_entry to support expiry + severity.';

CREATE INDEX idx_alert_practice_patient_active
  ON public.medical_alert (practice_id, patient_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE TRIGGER trg_medical_alert_audit
  BEFORE INSERT OR UPDATE ON public.medical_alert
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- document — metadata for files stored in Supabase Storage
-- ============================================================================
CREATE TABLE public.document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid REFERENCES public.patient(id) ON DELETE RESTRICT,
  document_type public.document_type NOT NULL,
  title text NOT NULL,
  description text,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  -- Storage path. Convention: practices/{practice_id}/{patient_id}/{type}/{filename}
  -- Storage bucket + RLS added in 0008.
  storage_bucket text NOT NULL DEFAULT 'patient-files',
  storage_path text NOT NULL,
  -- Audit
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  UNIQUE (storage_bucket, storage_path)
);

COMMENT ON TABLE public.document IS
  'File metadata only. Actual files in Supabase Storage at storage_bucket/storage_path. Storage RLS in 0008 parses practice_id from path.';

CREATE INDEX idx_document_practice_patient
  ON public.document (practice_id, patient_id)
  WHERE deleted_at IS NULL AND patient_id IS NOT NULL;

CREATE INDEX idx_document_practice_type
  ON public.document (practice_id, document_type)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_document_audit
  BEFORE INSERT OR UPDATE ON public.document
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- consent_record
-- ============================================================================
CREATE TABLE public.consent_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  consent_type public.consent_type NOT NULL,
  consent_version text NOT NULL,  -- e.g. "PRIVACY_NOTICE_v3.2"
  consent_text text NOT NULL,     -- frozen text the patient agreed to
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_method public.consent_method NOT NULL,
  -- True if patient signed; false if guardian (under-16 etc)
  granted_by_patient boolean NOT NULL DEFAULT true,
  guardian_name text,
  guardian_relation text,
  -- Witnessing staff member
  witnessed_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  -- Optional signed PDF in storage
  document_id uuid REFERENCES public.document(id) ON DELETE SET NULL,
  -- Some consents expire (e.g. specific procedure)
  valid_until timestamptz,
  -- Revocation
  revoked_at timestamptz,
  revoked_reason text,
  revoked_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  -- Soft-delete only; CQC needs the record retrievable
  deleted_at timestamptz,
  CHECK (granted_by_patient = true OR guardian_name IS NOT NULL)
);

COMMENT ON TABLE public.consent_record IS
  'Frozen consent records. consent_text is captured at grant time so future text edits do not retroactively change what the patient agreed to.';

CREATE INDEX idx_consent_practice_patient
  ON public.consent_record (practice_id, patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_consent_active
  ON public.consent_record (practice_id, patient_id, consent_type)
  WHERE revoked_at IS NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_consent_audit
  BEFORE INSERT OR UPDATE ON public.consent_record
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- note — polymorphic clinical/admin notes
-- ============================================================================
CREATE TABLE public.note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  parent_type public.note_parent_type NOT NULL,
  parent_id uuid NOT NULL,
  -- Denormalized for fast "show me all notes for this patient" queries
  patient_id uuid REFERENCES public.patient(id) ON DELETE RESTRICT,
  author_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  note_type public.note_type NOT NULL DEFAULT 'CLINICAL',
  body text NOT NULL,
  is_confidential boolean NOT NULL DEFAULT false,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.note IS
  'Polymorphic note. parent_type+parent_id reference any other entity (PATIENT, APPOINTMENT, etc). is_confidential restricts SELECT to admin + author.';

CREATE INDEX idx_note_practice_parent
  ON public.note (practice_id, parent_type, parent_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_note_practice_patient
  ON public.note (practice_id, patient_id)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_note_author
  ON public.note (author_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_note_audit
  BEFORE INSERT OR UPDATE ON public.note
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- RLS — pattern: practice_id = current_practice_id, with role/author
-- exceptions for confidential records
-- ============================================================================

ALTER TABLE public.patient                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_history_entry  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_alert          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_record         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note                   ENABLE ROW LEVEL SECURITY;

-- ---------- patient ----------
CREATE POLICY patient_select
  ON public.patient FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY patient_insert
  ON public.patient FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY patient_update
  ON public.patient FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- No DELETE policy → soft delete via deleted_at only

-- ---------- medical_history_entry ----------
CREATE POLICY mhe_select
  ON public.medical_history_entry FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY mhe_insert
  ON public.medical_history_entry FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY mhe_update
  ON public.medical_history_entry FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- ---------- medical_alert ----------
CREATE POLICY alert_select
  ON public.medical_alert FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY alert_insert
  ON public.medical_alert FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY alert_update
  ON public.medical_alert FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- ---------- document ----------
CREATE POLICY document_select
  ON public.document FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY document_insert
  ON public.document FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY document_update
  ON public.document FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- ---------- consent_record ----------
CREATE POLICY consent_select
  ON public.consent_record FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY consent_insert
  ON public.consent_record FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

CREATE POLICY consent_update
  ON public.consent_record FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- ---------- note ----------
-- SELECT: practice members can read all non-confidential notes; confidential
-- ones only visible to author + admin.
CREATE POLICY note_select
  ON public.note FOR SELECT TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      is_confidential = false
      OR author_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  );

CREATE POLICY note_insert
  ON public.note FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- UPDATE: only author or admin
CREATE POLICY note_update
  ON public.note FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      author_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  )
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

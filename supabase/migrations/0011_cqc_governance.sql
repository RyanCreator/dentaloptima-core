-- ============================================================================
-- 0011_cqc_governance.sql
-- CQC governance tables — what inspectors look for during a CQC visit:
--   incident_report          - clinical/operational incidents
--   complaint                - patient complaints (CQC requires policy + log)
--   safeguarding_concern     - adult/child safeguarding referrals
--   prescription             - prescription record (separate from notes)
--   policy                   - practice policies (the documents)
--   policy_acknowledgement   - staff sign-off on policies
-- ============================================================================

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE public.incident_type AS ENUM (
  'CLINICAL',
  'NEAR_MISS',
  'EQUIPMENT_FAILURE',
  'NEEDLESTICK',
  'INFECTION_CONTROL',
  'MEDICATION_ERROR',
  'PATIENT_FALL',
  'DATA_BREACH',
  'STAFF_INJURY',
  'OTHER'
);

CREATE TYPE public.incident_severity AS ENUM (
  'NO_HARM', 'LOW', 'MODERATE', 'SEVERE', 'DEATH'
);

CREATE TYPE public.incident_status AS ENUM (
  'REPORTED',
  'UNDER_INVESTIGATION',
  'ACTION_REQUIRED',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE public.complaint_status AS ENUM (
  'NEW',
  'ACKNOWLEDGED',
  'UNDER_INVESTIGATION',
  'RESPONDED',
  'RESOLVED',
  'ESCALATED_TO_OMBUDSMAN',
  'CLOSED'
);

CREATE TYPE public.complaint_method AS ENUM (
  'IN_PERSON', 'PHONE', 'EMAIL', 'LETTER', 'WEBSITE', 'SOCIAL_MEDIA', 'OTHER'
);

CREATE TYPE public.safeguarding_concern_type AS ENUM (
  'CHILD', 'ADULT_AT_RISK', 'DOMESTIC_ABUSE', 'MENTAL_CAPACITY', 'NEGLECT', 'PHYSICAL_ABUSE', 'OTHER'
);

CREATE TYPE public.safeguarding_status AS ENUM (
  'IDENTIFIED',
  'INTERNAL_REVIEW',
  'REFERRED_LOCAL_AUTHORITY',
  'REFERRED_POLICE',
  'CLOSED_NO_ACTION',
  'CLOSED_ACTIONED'
);

CREATE TYPE public.prescription_status AS ENUM (
  'DRAFT',
  'ISSUED',
  'COLLECTED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE public.policy_category AS ENUM (
  'INFECTION_CONTROL',
  'SAFEGUARDING',
  'COMPLAINTS',
  'INFORMATION_GOVERNANCE',
  'EQUALITY_DIVERSITY',
  'HEALTH_SAFETY',
  'CLINICAL_GOVERNANCE',
  'WHISTLEBLOWING',
  'CONSENT',
  'BUSINESS_CONTINUITY',
  'OTHER'
);

-- ============================================================================
-- incident_report
-- ============================================================================
CREATE TABLE public.incident_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  -- Optional patient link (some incidents are staff-only)
  patient_id uuid REFERENCES public.patient(id) ON DELETE RESTRICT,
  reported_by uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  incident_type public.incident_type NOT NULL,
  severity public.incident_severity NOT NULL,
  status public.incident_status NOT NULL DEFAULT 'REPORTED',
  occurred_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  -- Where + what
  location text,
  summary text NOT NULL,
  description text NOT NULL,
  -- People
  staff_involved uuid[],  -- array of practice_member.id
  witnesses text,
  -- Investigation
  investigation_lead uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  investigation_notes text,
  root_cause text,
  -- Action + closure
  immediate_action_taken text,
  preventive_action text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  closed_at timestamptz,
  -- External reporting
  reported_to_external_body boolean NOT NULL DEFAULT false,
  external_body_name text,
  external_reference text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.incident_report IS
  'CQC-required incident log. Append-friendly: investigation notes append, summary stays as filed. Severity drives external reporting requirements (RIDDOR for staff injuries, NRLS for clinical).';

CREATE INDEX idx_incident_practice_status_severity
  ON public.incident_report (practice_id, status, severity)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_incident_practice_occurred
  ON public.incident_report (practice_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_incident_patient
  ON public.incident_report (patient_id)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_incident_audit
  BEFORE INSERT OR UPDATE ON public.incident_report
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- complaint
-- ============================================================================
CREATE TABLE public.complaint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid REFERENCES public.patient(id) ON DELETE RESTRICT,
  -- Complainant (may not be a patient — could be relative, guardian)
  complainant_name text NOT NULL,
  complainant_relation text,
  complainant_email extensions.citext,
  complainant_phone text,
  -- Receipt
  received_at timestamptz NOT NULL,
  received_via public.complaint_method NOT NULL,
  received_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  -- Substance
  summary text NOT NULL,
  detail text NOT NULL,
  staff_named uuid[],  -- staff members named in the complaint
  -- Lifecycle
  status public.complaint_status NOT NULL DEFAULT 'NEW',
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  investigation_lead uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  investigation_notes text,
  response_summary text,
  responded_at timestamptz,
  resolved_at timestamptz,
  resolution_summary text,
  -- Escalation
  escalated_to_ombudsman boolean NOT NULL DEFAULT false,
  ombudsman_reference text,
  ombudsman_outcome text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.complaint IS
  'Patient complaint log. CQC requires a policy + searchable log + response timeframes. Practice must acknowledge within 3 working days.';

CREATE INDEX idx_complaint_practice_status
  ON public.complaint (practice_id, status, received_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_complaint_practice_patient
  ON public.complaint (practice_id, patient_id)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_complaint_audit
  BEFORE INSERT OR UPDATE ON public.complaint
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- safeguarding_concern
-- ============================================================================
CREATE TABLE public.safeguarding_concern (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid REFERENCES public.patient(id) ON DELETE RESTRICT,
  -- The concern
  concern_type public.safeguarding_concern_type NOT NULL,
  raised_by uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  raised_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  immediate_risk_assessment text,
  -- Lifecycle
  status public.safeguarding_status NOT NULL DEFAULT 'IDENTIFIED',
  -- Internal review
  reviewed_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  -- External referral
  referred_at timestamptz,
  referred_to text,
  external_reference text,
  external_outcome text,
  -- Closure
  closed_at timestamptz,
  closed_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  closure_summary text,
  -- Audit. Confidentiality is paramount: only admins see these by default
  -- (RLS below). Soft-delete preserves the record for inspection.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.safeguarding_concern IS
  'Safeguarding concerns (child / adult-at-risk / domestic abuse). RLS restricts visibility to OWNER/ADMIN + the staff member who raised it.';

CREATE INDEX idx_safeguarding_practice_status
  ON public.safeguarding_concern (practice_id, status, raised_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_safeguarding_audit
  BEFORE INSERT OR UPDATE ON public.safeguarding_concern
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- prescription
-- ============================================================================
CREATE TABLE public.prescription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  prescriber_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  -- Drug
  drug_name text NOT NULL,
  dose text NOT NULL,
  frequency text NOT NULL,
  duration text NOT NULL,
  quantity text NOT NULL,
  route text,  -- 'ORAL', 'TOPICAL', 'INJECTION'
  is_repeat boolean NOT NULL DEFAULT false,
  is_controlled_drug boolean NOT NULL DEFAULT false,
  -- Indication
  indication text NOT NULL,
  -- Counselling
  patient_counselled boolean NOT NULL DEFAULT false,
  warnings_given text,
  -- Lifecycle
  status public.prescription_status NOT NULL DEFAULT 'DRAFT',
  issued_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

COMMENT ON TABLE public.prescription IS
  'Prescription record. Separate from notes for CQC retrieval. Controlled drugs have stricter retention requirements (handled by retention cron in 0012).';

CREATE INDEX idx_prescription_practice_patient
  ON public.prescription (practice_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_prescription_practice_controlled
  ON public.prescription (practice_id, is_controlled_drug, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_prescription_prescriber
  ON public.prescription (prescriber_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_prescription_audit
  BEFORE INSERT OR UPDATE ON public.prescription
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- policy + policy_acknowledgement
-- ============================================================================
CREATE TABLE public.policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  category public.policy_category NOT NULL,
  title text NOT NULL,
  version text NOT NULL,
  content text NOT NULL,
  document_id uuid REFERENCES public.document(id) ON DELETE SET NULL,
  effective_from date NOT NULL DEFAULT current_date,
  next_review_date date,
  is_active boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES public.policy(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  UNIQUE (practice_id, category, version)
);

COMMENT ON TABLE public.policy IS
  'Practice policies. CQC inspects these. Versioning preserves what was current at any past point.';

CREATE INDEX idx_policy_practice_category_active
  ON public.policy (practice_id, category)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE TRIGGER trg_policy_audit
  BEFORE INSERT OR UPDATE ON public.policy
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

CREATE TABLE public.policy_acknowledgement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES public.policy(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  -- Signed PDF if applicable
  document_id uuid REFERENCES public.document(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, staff_id)
);

COMMENT ON TABLE public.policy_acknowledgement IS
  'Audit trail of staff sign-off on policies. CQC will check this during inspection.';

CREATE INDEX idx_policy_ack_practice_staff ON public.policy_acknowledgement (practice_id, staff_id);
CREATE INDEX idx_policy_ack_policy ON public.policy_acknowledgement (policy_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.incident_report          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safeguarding_concern     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acknowledgement   ENABLE ROW LEVEL SECURITY;

-- Incidents: all members read + insert; admin updates
CREATE POLICY incident_select ON public.incident_report FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY incident_insert ON public.incident_report FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY incident_update ON public.incident_report FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      reported_by = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  )
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- Complaints: all members read + insert; admin updates
CREATE POLICY complaint_select ON public.complaint FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY complaint_insert ON public.complaint FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY complaint_update ON public.complaint FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  )
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- Safeguarding: tightly restricted. Only admin OR the raiser can read/update.
CREATE POLICY safeguarding_select ON public.safeguarding_concern FOR SELECT TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      raised_by = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  );
CREATE POLICY safeguarding_insert ON public.safeguarding_concern FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY safeguarding_update ON public.safeguarding_concern FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      raised_by = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  )
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- Prescription: members read + write (only DENTIST/HYGIENIST role can prescribe
-- but we enforce that at the app layer for now; RLS just ensures practice scope)
CREATE POLICY prescription_select ON public.prescription FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY prescription_insert ON public.prescription FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY prescription_update ON public.prescription FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      prescriber_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  )
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- Policy: all read; admin writes
CREATE POLICY policy_select ON public.policy FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY policy_admin_insert ON public.policy FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY policy_admin_update ON public.policy FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- Policy acknowledgement: all read (so admin can see who's signed); self-insert
CREATE POLICY policy_ack_select ON public.policy_acknowledgement FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY policy_ack_self_insert ON public.policy_acknowledgement FOR INSERT TO authenticated
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND staff_id = (select app_private.current_member_id())
  );

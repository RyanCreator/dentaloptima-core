-- ============================================================================
-- 0008_appointments_and_bookings.sql
-- The booking heart:
--   appointment              - actual scheduled appointments
--   appointment_service      - M:N appointment ↔ service (appts can have many)
--   booking_request          - public-form enquiries
--   waiting_list             - prioritised waitlist
--
-- Critical: appointment overlap is prevented at the DB level via a GiST
-- exclusion constraint. Two non-cancelled appointments for the same staff
-- in the same practice cannot have overlapping time ranges. Application
-- code can also check, but the DB is the source of truth.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE public.appointment_status AS ENUM (
  'SCHEDULED',
  'CONFIRMED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'RESCHEDULED'
);

CREATE TYPE public.booking_request_status AS ENUM (
  'NEW',
  'VIEWED',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'WAITLIST'
);

CREATE TYPE public.waiting_list_priority AS ENUM (
  'URGENT',
  'HIGH',
  'NORMAL',
  'LOW'
);

CREATE TYPE public.cancellation_reason AS ENUM (
  'PATIENT_REQUEST',
  'PATIENT_NO_RESPONSE',
  'STAFF_UNAVAILABLE',
  'PRACTICE_CLOSURE',
  'EQUIPMENT_FAILURE',
  'EMERGENCY',
  'OTHER'
);

CREATE TYPE public.booking_source AS ENUM (
  'INTERNAL',
  'PUBLIC_FORM',
  'PHONE',
  'EMAIL',
  'WALK_IN',
  'IMPORTED'
);

CREATE TYPE public.preferred_time_of_day AS ENUM (
  'MORNING', 'AFTERNOON', 'EVENING', 'ANY'
);

-- ============================================================================
-- appointment
-- ============================================================================
CREATE TABLE public.appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'SCHEDULED',
  -- Lifecycle timestamps (each transition stamps its own moment)
  confirmed_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason public.cancellation_reason,
  cancellation_notes text,
  no_show_recorded_at timestamptz,
  -- Clinical wrap-up
  treatment_summary text,
  completed_by_staff_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  -- Idempotency: prevent double-creating recall
  recall_created boolean NOT NULL DEFAULT false,
  -- Provenance
  booking_source public.booking_source NOT NULL DEFAULT 'INTERNAL',
  booking_request_id uuid,  -- FK added below after booking_request exists
  rescheduled_from_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  rescheduled_to_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  -- Reminder tracking
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at timestamptz,
  post_appointment_followup_sent_at timestamptz,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (ends_at > starts_at),
  -- Hard prevent overlapping non-cancelled appointments for same staff in
  -- same practice. Postgres rejects the second INSERT/UPDATE with a
  -- conflict error rather than letting the booking succeed.
  EXCLUDE USING gist (
    staff_id WITH =,
    practice_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status NOT IN ('CANCELLED', 'NO_SHOW') AND deleted_at IS NULL)
);

COMMENT ON TABLE public.appointment IS
  'Scheduled appointments. GiST exclusion constraint enforces no-overlap per staff in same practice.';

CREATE INDEX idx_appointment_practice_starts
  ON public.appointment (practice_id, starts_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_appointment_practice_staff_starts
  ON public.appointment (practice_id, staff_id, starts_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_appointment_patient
  ON public.appointment (patient_id, starts_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_appointment_practice_status
  ON public.appointment (practice_id, status, starts_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_appointment_reminders_due_24h
  ON public.appointment (practice_id, starts_at)
  WHERE reminder_24h_sent_at IS NULL AND status IN ('SCHEDULED', 'CONFIRMED') AND deleted_at IS NULL;

CREATE TRIGGER trg_appointment_audit
  BEFORE INSERT OR UPDATE ON public.appointment
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- appointment_service
-- ============================================================================
CREATE TABLE public.appointment_service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  appointment_id uuid NOT NULL REFERENCES public.appointment(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.service(id) ON DELETE RESTRICT,
  display_order integer NOT NULL DEFAULT 0,
  -- Snapshot at booking time so future price/duration changes don't
  -- retroactively change historical appointments
  price_pence_snapshot integer,
  duration_minutes_snapshot integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, service_id)
);

COMMENT ON TABLE public.appointment_service IS
  'M:N appointment↔service. Snapshots price+duration at booking time.';

CREATE INDEX idx_appt_service_appt ON public.appointment_service (appointment_id);
CREATE INDEX idx_appt_service_service ON public.appointment_service (service_id);
CREATE INDEX idx_appt_service_practice ON public.appointment_service (practice_id);

-- ============================================================================
-- booking_request
-- ============================================================================
CREATE TABLE public.booking_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  status public.booking_request_status NOT NULL DEFAULT 'NEW',
  -- Patient (may not yet exist as a patient record — public form submits raw fields)
  patient_id uuid REFERENCES public.patient(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email extensions.citext,
  phone text,
  is_new_patient boolean NOT NULL DEFAULT true,
  -- The request
  preferred_dentist_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.service(id) ON DELETE SET NULL,
  service_text text,  -- free-text if no service selected
  preferred_starts_at timestamptz,
  preferred_ends_at timestamptz,
  alternative_times text,
  notes text,
  reason text,
  is_emergency boolean NOT NULL DEFAULT false,
  -- Provenance / abuse prevention
  source public.booking_source NOT NULL DEFAULT 'PUBLIC_FORM',
  source_url text,
  ip_address inet,
  user_agent text,
  -- Lifecycle
  viewed_at timestamptz,
  viewed_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  responded_at timestamptz,
  responded_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  resulting_appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  rejection_reason text,
  -- Audit (no created_by — public form is unauthenticated)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

COMMENT ON TABLE public.booking_request IS
  'Public-form enquiries. INSERT happens via service-role edge function (with rate limiting + captcha). Authenticated staff can also create on behalf of phone callers.';

CREATE INDEX idx_booking_request_practice_status
  ON public.booking_request (practice_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_booking_request_patient
  ON public.booking_request (patient_id)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_booking_request_email
  ON public.booking_request (practice_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- For booking_request we use the simpler updated_at trigger (no created_by)
CREATE TRIGGER trg_booking_request_updated_at
  BEFORE UPDATE ON public.booking_request
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- Now wire the FK back from appointment to booking_request
ALTER TABLE public.appointment
  ADD CONSTRAINT appointment_booking_request_id_fkey
  FOREIGN KEY (booking_request_id) REFERENCES public.booking_request(id) ON DELETE SET NULL;

CREATE INDEX idx_appointment_booking_request
  ON public.appointment (booking_request_id)
  WHERE booking_request_id IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- waiting_list
-- ============================================================================
CREATE TABLE public.waiting_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patient(id) ON DELETE RESTRICT,
  preferred_dentist_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.service(id) ON DELETE SET NULL,
  service_text text,
  priority public.waiting_list_priority NOT NULL DEFAULT 'NORMAL',
  -- Window
  earliest_date date,
  latest_date date,
  preferred_days_of_week public.weekday[],
  preferred_time_of_day public.preferred_time_of_day,
  notes text,
  -- Lifecycle
  is_active boolean NOT NULL DEFAULT true,
  fulfilled_at timestamptz,
  fulfilled_appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (latest_date IS NULL OR earliest_date IS NULL OR latest_date >= earliest_date)
);

COMMENT ON TABLE public.waiting_list IS
  'Prioritised waiting list. Cancellation cron pings these patients in priority order.';

CREATE INDEX idx_waiting_list_practice_priority
  ON public.waiting_list (practice_id, priority, created_at)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_waiting_list_patient
  ON public.waiting_list (patient_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_waiting_list_audit
  BEFORE INSERT OR UPDATE ON public.waiting_list
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.appointment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_service   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_request       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiting_list          ENABLE ROW LEVEL SECURITY;

-- appointment: any active member of the practice can read + write
-- (receptionists need to book/edit, dentists need to update status etc)
CREATE POLICY appointment_select ON public.appointment FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY appointment_insert ON public.appointment FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY appointment_update ON public.appointment FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- appointment_service: same
CREATE POLICY appt_service_select ON public.appointment_service FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY appt_service_insert ON public.appointment_service FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY appt_service_delete ON public.appointment_service FOR DELETE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

-- booking_request: members read + update (handle requests). INSERT also allowed
-- so staff can create on behalf of phone callers. Public-form INSERTs go via
-- service-role edge function (which bypasses RLS).
CREATE POLICY booking_request_select ON public.booking_request FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY booking_request_insert ON public.booking_request FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY booking_request_update ON public.booking_request FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- waiting_list: members read + write
CREATE POLICY waiting_list_select ON public.waiting_list FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY waiting_list_insert ON public.waiting_list FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY waiting_list_update ON public.waiting_list FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

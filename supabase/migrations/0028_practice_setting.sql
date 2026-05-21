-- ============================================================================
-- 0028_practice_setting.sql
-- Per-practice configuration that doesn't fit on the `practice` identity row:
-- booking window timing, reminder cadences, notification toggles, outbound
-- email identity, and the message templates used by the booking flow.
--
-- One row per practice, keyed by practice_id directly (no separate id), so
-- lookups are practice_id = current_practice_id() with no join.
--
-- Templates may include {clinic_name}, {patient_name}, {date}, {time}, etc.
-- Placeholder substitution happens in the booking app at send time, not in
-- the DB. NULL means "use the system-wide default baked into the app";
-- saving a string overrides for this practice only.
--
-- Identity-level fields (clinic name, address, phone, timezone) stay on
-- `practice` from migration 0001. The Settings UI loads + saves both
-- tables and stitches them together for the operator.
-- ============================================================================

CREATE TABLE public.practice_setting (
  practice_id uuid PRIMARY KEY REFERENCES public.practice(id) ON DELETE RESTRICT,

  -- Outbound email identity. Used as the From: header on patient mailings.
  from_email extensions.citext,
  from_name text,

  -- Marketing / outbound URLs the booking app drops into templates.
  google_review_url text,
  practice_website text,

  -- Booking window
  default_appt_duration_minutes integer NOT NULL DEFAULT 30
    CHECK (default_appt_duration_minutes BETWEEN 5 AND 480),
  min_booking_notice_hours integer NOT NULL DEFAULT 24
    CHECK (min_booking_notice_hours BETWEEN 0 AND 720),
  max_advance_booking_days integer NOT NULL DEFAULT 90
    CHECK (max_advance_booking_days BETWEEN 1 AND 365),

  -- Reminder cadence. NULL = don't send that reminder at all.
  reminder_days_before integer
    CHECK (reminder_days_before IS NULL OR reminder_days_before BETWEEN 1 AND 60),
  reminder_hours_before integer
    CHECK (reminder_hours_before IS NULL OR reminder_hours_before BETWEEN 1 AND 168),
  post_appointment_hours_after integer
    CHECK (post_appointment_hours_after IS NULL OR post_appointment_hours_after BETWEEN 1 AND 168),
  recall_reminder_lead_days integer NOT NULL DEFAULT 30
    CHECK (recall_reminder_lead_days BETWEEN 1 AND 90),

  -- Operator-side notification toggles: should we email the practice when
  -- these things happen?
  notify_on_enquiry_received boolean NOT NULL DEFAULT true,
  notify_on_appointment_confirmed boolean NOT NULL DEFAULT false,
  notify_on_appointment_cancelled boolean NOT NULL DEFAULT true,
  notify_on_appointment_rescheduled boolean NOT NULL DEFAULT true,
  notify_on_request_rejected boolean NOT NULL DEFAULT false,
  notify_on_waitlist_added boolean NOT NULL DEFAULT false,
  notify_on_recall_due boolean NOT NULL DEFAULT true,

  -- Billing
  auto_send_invoice_on_completion boolean NOT NULL DEFAULT false,

  -- Message templates. NULL = use the default baked into the booking app.
  -- Anything else is a per-practice override.
  enquiry_received_subject text,
  enquiry_received_body text,
  appointment_confirmed_subject text,
  appointment_confirmed_body text,
  appointment_cancelled_subject text,
  appointment_cancelled_body text,
  appointment_rescheduled_subject text,
  appointment_rescheduled_body text,
  request_rejected_subject text,
  request_rejected_body text,
  added_to_waitlist_subject text,
  added_to_waitlist_body text,
  first_reminder_subject text,
  first_reminder_body text,
  second_reminder_subject text,
  second_reminder_body text,
  post_appointment_subject text,
  post_appointment_body text,
  recall_reminder_subject text,
  recall_reminder_body text,

  -- Audit. created_by/updated_by filled by the standard audit trigger.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.practice_setting IS
  'Per-practice configuration. One row per practice. Templates are NULL when using the system default; populated when an admin overrides the system text.';

CREATE TRIGGER trg_practice_setting_audit
  BEFORE INSERT OR UPDATE ON public.practice_setting
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- Backfill: every existing practice gets a default settings row. ON CONFLICT
-- DO NOTHING makes this rerun-safe.
INSERT INTO public.practice_setting (practice_id)
SELECT id FROM public.practice
ON CONFLICT (practice_id) DO NOTHING;

-- Auto-create a settings row for every new practice. SECURITY DEFINER so it
-- works regardless of the inserter's RLS context (e.g. the
-- create-practice-with-owner edge function running as service_role).
CREATE OR REPLACE FUNCTION app_private.fn_create_practice_setting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.practice_setting (practice_id) VALUES (NEW.id)
  ON CONFLICT (practice_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_practice_create_setting
  AFTER INSERT ON public.practice
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_create_practice_setting();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.practice_setting ENABLE ROW LEVEL SECURITY;

-- Read by any active member of the practice (settings drive UI everywhere).
CREATE POLICY practice_setting_select
  ON public.practice_setting FOR SELECT
  TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

-- Update by OWNER/ADMIN only — these are practice-wide knobs, not personal.
CREATE POLICY practice_setting_admin_update
  ON public.practice_setting FOR UPDATE
  TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  );

-- No INSERT or DELETE policy: rows are managed by the system (backfill +
-- per-practice trigger). Authenticated callers don't need to insert/delete.

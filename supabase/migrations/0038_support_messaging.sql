-- ============================================================================
-- 0038_support_messaging.sql
-- Practice ↔ Dentaloptima two-way support messaging, native to core.
--
-- Why this lives here (not on tenant-registry like before):
--   - Support is per-practice tenant data — every other tenant table already
--     lives here with practice_id RLS isolation.
--   - The booking app is already authed against core, so RLS gates the
--     practice-side surface natively. No more cross-project HTTP hop, no
--     more X-Tenant-Url proxy auth, no more support-action edge function.
--   - Realtime works for free — practice members see new replies live,
--     operators see new inbound messages live (in admin via service role).
--
-- Schema mirrors the registry's three tables (thread / message / attachment)
-- but with practice_id instead of opaque tenant_id, plus an updated trigger
-- that keeps last_message_at + status in sync on every message insert.
--
-- Storage: a `support-attachments` bucket with path-prefix RLS so each
-- practice can only read/write under {practice_id}/...
--
-- The 3 threads + 6 messages on registry are test data (RESOLVED + a
-- "Welcome…" auto-message) and aren't copied. If we need them later they
-- can be backfilled by mapping registry.tenant.custom_hostname →
-- core.practice.id.
-- ============================================================================

-- 1. Enums --------------------------------------------------------------------

CREATE TYPE public.support_thread_status AS ENUM (
  'OPEN',
  'AWAITING_DENTALOPTIMA',  -- practice has replied; we owe them an answer
  'AWAITING_TENANT',         -- we've replied; waiting on practice
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE public.support_direction AS ENUM (
  'INBOUND',   -- from practice → Dentaloptima
  'OUTBOUND'   -- from Dentaloptima → practice
);

-- 2. Tables -------------------------------------------------------------------

CREATE TABLE public.support_thread (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  subject         text NOT NULL,
  status          public.support_thread_status NOT NULL DEFAULT 'OPEN',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- The operator currently replying. Stored as email snapshot because
  -- operators live in tenant-registry's admin_user table — no cross-project
  -- FK is possible. claimed_at lets the UI flag stale claims later.
  claimed_by_email text,
  claimed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX support_thread_practice_last_msg_idx
  ON public.support_thread (practice_id, last_message_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.support_thread IS
  'Practice ↔ Dentaloptima support conversations. One row per topic.';
COMMENT ON COLUMN public.support_thread.claimed_by_email IS
  'Snapshot of the operator email currently working this thread. Cross-project so not a FK.';

CREATE TABLE public.support_message (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES public.support_thread(id) ON DELETE CASCADE,
  -- Denormalised so RLS policy is a single column comparison and doesn't
  -- need to JOIN support_thread on every query.
  practice_id     uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  direction       public.support_direction NOT NULL,
  -- auth.uid() of the sender. Practice member's user_id when INBOUND;
  -- NULL when OUTBOUND (operators auth against tenant-registry, not core).
  author_user_id  uuid,
  author_email    text NOT NULL,
  author_name     text,
  body            text NOT NULL,
  -- Read tracking is asymmetric:
  --   - OUTBOUND: practice marks read when they open the thread
  --   - INBOUND: operators mark read on the admin side
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_message_thread_idx
  ON public.support_message (thread_id, created_at);

CREATE INDEX support_message_practice_unread_idx
  ON public.support_message (practice_id, direction, read_at)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.support_message IS
  'Individual messages in a support thread. INBOUND = from practice, OUTBOUND = from Dentaloptima.';

CREATE TABLE public.support_attachment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES public.support_thread(id) ON DELETE CASCADE,
  -- Two-step upload: row created with NULL message_id when file is uploaded
  -- to storage, then linked to a message at send time. Once linked it's
  -- immutable.
  message_id      uuid REFERENCES public.support_message(id) ON DELETE CASCADE,
  practice_id     uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  file_path       text NOT NULL,
  file_name       text NOT NULL,
  file_size_bytes bigint NOT NULL,
  mime_type       text,
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_attachment_thread_idx
  ON public.support_attachment (thread_id);
CREATE INDEX support_attachment_practice_idx
  ON public.support_attachment (practice_id);

COMMENT ON TABLE public.support_attachment IS
  'File attachments on support messages. file_path is the storage object name in the support-attachments bucket.';

-- 3. RLS ---------------------------------------------------------------------

ALTER TABLE public.support_thread     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_message    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachment ENABLE ROW LEVEL SECURITY;

-- support_thread ------------------------------------------------------------

-- Operators get full access via JWT app_metadata. RLS for them in the admin
-- app is moot because admin uses the service-role key, but the policy is
-- here for correctness if/when an operator session ever becomes JWT-based.
CREATE POLICY support_thread_operator_select ON public.support_thread
  FOR SELECT TO authenticated
  USING ((select app_private.is_operator()));

CREATE POLICY support_thread_operator_insert ON public.support_thread
  FOR INSERT TO authenticated
  WITH CHECK ((select app_private.is_operator()));

CREATE POLICY support_thread_operator_update ON public.support_thread
  FOR UPDATE TO authenticated
  USING ((select app_private.is_operator()))
  WITH CHECK ((select app_private.is_operator()));

-- Practice members: see + create threads in their own practice. Status and
-- claim fields stay operator-only for tamper resistance — members can't
-- self-resolve a thread to make it disappear from operator queues.
CREATE POLICY support_thread_member_select ON public.support_thread
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY support_thread_member_insert ON public.support_thread
  FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- support_message -----------------------------------------------------------

CREATE POLICY support_message_operator_select ON public.support_message
  FOR SELECT TO authenticated
  USING ((select app_private.is_operator()));

CREATE POLICY support_message_operator_insert ON public.support_message
  FOR INSERT TO authenticated
  WITH CHECK ((select app_private.is_operator()));

CREATE POLICY support_message_operator_update ON public.support_message
  FOR UPDATE TO authenticated
  USING ((select app_private.is_operator()))
  WITH CHECK ((select app_private.is_operator()));

CREATE POLICY support_message_member_select ON public.support_message
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

-- Practice members can only insert INBOUND messages in their own practice.
CREATE POLICY support_message_member_insert ON public.support_message
  FOR INSERT TO authenticated
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND direction = 'INBOUND'
  );

-- Practice members can mark OUTBOUND (Dentaloptima → practice) messages as
-- read in their practice. Trusting the booking-app client to only update
-- read_at; column-level immutability isn't enforced at the policy layer.
CREATE POLICY support_message_member_mark_read ON public.support_message
  FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND direction = 'OUTBOUND'
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND direction = 'OUTBOUND'
  );

-- support_attachment --------------------------------------------------------

CREATE POLICY support_attachment_operator_select ON public.support_attachment
  FOR SELECT TO authenticated
  USING ((select app_private.is_operator()));

CREATE POLICY support_attachment_operator_insert ON public.support_attachment
  FOR INSERT TO authenticated
  WITH CHECK ((select app_private.is_operator()));

CREATE POLICY support_attachment_operator_update ON public.support_attachment
  FOR UPDATE TO authenticated
  USING ((select app_private.is_operator()))
  WITH CHECK ((select app_private.is_operator()));

CREATE POLICY support_attachment_member_select ON public.support_attachment
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

CREATE POLICY support_attachment_member_insert ON public.support_attachment
  FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- Members can link an attachment to a message during the two-step upload.
CREATE POLICY support_attachment_member_update ON public.support_attachment
  FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- 4. Trigger to keep thread metadata fresh -----------------------------------

-- Whenever a message lands, bump last_message_at and flip the thread's
-- status to whichever side is now waiting. Don't reopen RESOLVED/CLOSED
-- threads — those need an explicit operator action to reactivate.
CREATE OR REPLACE FUNCTION app_private.fn_support_message_touch_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.support_thread
     SET last_message_at = NEW.created_at,
         status = CASE
           WHEN NEW.direction = 'INBOUND'  THEN 'AWAITING_DENTALOPTIMA'::support_thread_status
           WHEN NEW.direction = 'OUTBOUND' THEN 'AWAITING_TENANT'::support_thread_status
         END,
         updated_at = now()
   WHERE id = NEW.thread_id
     AND status NOT IN ('RESOLVED', 'CLOSED');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.fn_support_message_touch_thread() FROM PUBLIC;

CREATE TRIGGER trg_support_message_touch_thread
  AFTER INSERT ON public.support_message
  FOR EACH ROW
  EXECUTE FUNCTION app_private.fn_support_message_touch_thread();

-- updated_at on support_thread itself, when an operator changes status etc.
CREATE OR REPLACE FUNCTION app_private.fn_support_thread_bump_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_thread_updated_at
  BEFORE UPDATE ON public.support_thread
  FOR EACH ROW
  EXECUTE FUNCTION app_private.fn_support_thread_bump_updated_at();

-- 5. Storage bucket ----------------------------------------------------------

-- Object name format: <practice_id>/<thread_id>/<random>-<filename>
-- so the path-prefix policy below scopes by practice membership.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('support-attachments', 'support-attachments', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY support_storage_operator ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (select app_private.is_operator())
  )
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (select app_private.is_operator())
  );

CREATE POLICY support_storage_member_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = (select app_private.current_practice_id())::text
  );

CREATE POLICY support_storage_member_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = (select app_private.current_practice_id())::text
  );

-- 6. Realtime ----------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.support_thread,
  public.support_message;

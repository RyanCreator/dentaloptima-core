-- ============================================================================
-- 0039_admin_gated_member_edits_and_nhs_request.sql
-- Two related tightenings:
--
--   1. practice_member UPDATE is now admin-only (OWNER/ADMIN of the same
--      practice). Previously any member could update their own row,
--      which let a DENTIST self-promote to OWNER — a privilege escalation
--      hole. Personal fields (calendar colour, phone, etc.) become
--      admin-managed too, by design.
--
--   2. New `nhs_performer_request` table — when a clinician needs an NHS
--      performer registration set up, they raise a request. Admins see
--      a pending count in the booking-app sidebar and a "Pending requests"
--      tab on Staff. When an admin actually creates an `nhs_performer`
--      row for that staff member, a trigger marks any PENDING request
--      for that staff member as COMPLETED automatically.
--
-- Why a dedicated table rather than a generic notification table:
--   - Structured queue we can COUNT for the badge.
--   - Auto-resolution trigger has a clear target.
--   - Status transitions are explicit (PENDING → COMPLETED / CANCELLED).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tighten practice_member updates
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS practice_member_update ON public.practice_member;

CREATE POLICY practice_member_admin_update ON public.practice_member
  FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  );

COMMENT ON POLICY practice_member_admin_update ON public.practice_member IS
  'Only OWNER/ADMIN can update practice_member rows. Closes the self-promotion hole where any member could update their own row including the role column.';

-- ---------------------------------------------------------------------------
-- 2. nhs_performer_request
-- ---------------------------------------------------------------------------

CREATE TYPE public.nhs_performer_request_status AS ENUM (
  'PENDING',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE public.nhs_performer_request (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  -- The clinician asking to be set up. Stored as practice_member.id so
  -- when an admin clicks the request they go straight to that profile.
  staff_id        uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE CASCADE,
  -- Who actually pressed the button. Often the same as staff_id when a
  -- clinician self-requests, but an admin could raise one on behalf.
  requested_by    uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  status          public.nhs_performer_request_status NOT NULL DEFAULT 'PENDING',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Set by the auto-resolution trigger when an nhs_performer row is
  -- inserted for the same staff_id, OR by an admin clicking "Cancel".
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES public.practice_member(id) ON DELETE SET NULL
);

-- Practice_id-leading index (RLS pruning), and a partial index for the
-- pending-count query that the sidebar badge will run constantly.
CREATE INDEX nhs_performer_request_practice_idx
  ON public.nhs_performer_request (practice_id, created_at DESC);

CREATE INDEX nhs_performer_request_pending_idx
  ON public.nhs_performer_request (practice_id)
  WHERE status = 'PENDING';

-- One open request per staff at a time — pressing the button when one's
-- already pending is a no-op rather than a duplicate row.
CREATE UNIQUE INDEX nhs_performer_request_one_pending_per_staff
  ON public.nhs_performer_request (staff_id)
  WHERE status = 'PENDING';

COMMENT ON TABLE public.nhs_performer_request IS
  'Clinician-raised request to be set up as an NHS performer. Auto-completed when the corresponding nhs_performer row is created.';

-- RLS
ALTER TABLE public.nhs_performer_request ENABLE ROW LEVEL SECURITY;

-- Read: any member of the practice can see requests in their practice.
-- Lets a clinician see whether their own request is still pending, and
-- lets admins see the queue.
CREATE POLICY nhs_performer_request_select ON public.nhs_performer_request
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

-- Insert: any member can raise a request for THEIR OWN practice_member
-- row. Admins can raise on behalf of someone else.
CREATE POLICY nhs_performer_request_insert ON public.nhs_performer_request
  FOR INSERT TO authenticated
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (
      -- self-request
      staff_id IN (SELECT id FROM public.practice_member WHERE user_id = (select auth.uid()))
      -- or admin raising on behalf
      OR (select app_private.is_practice_admin())
    )
  );

-- Update / cancel: admins only. Auto-completion happens via trigger
-- below (SECURITY DEFINER) and bypasses this policy.
CREATE POLICY nhs_performer_request_admin_update ON public.nhs_performer_request
  FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  );

-- ---------------------------------------------------------------------------
-- 3. Auto-resolve trigger
-- ---------------------------------------------------------------------------

-- When an admin inserts an nhs_performer row for a staff member that has a
-- PENDING request, mark the request COMPLETED in the same transaction so
-- the badge clears and the queue stays accurate. SECURITY DEFINER because
-- the inserting admin has UPDATE privilege via RLS anyway, but doing it in
-- a definer function means we don't depend on policy evaluation.
CREATE OR REPLACE FUNCTION app_private.fn_nhs_performer_resolve_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.nhs_performer_request
     SET status      = 'COMPLETED',
         resolved_at = now(),
         resolved_by = (
           SELECT id FROM public.practice_member
            WHERE user_id = auth.uid()
              AND practice_id = NEW.practice_id
              AND deleted_at IS NULL
            LIMIT 1
         )
   WHERE staff_id = NEW.staff_id
     AND practice_id = NEW.practice_id
     AND status = 'PENDING';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.fn_nhs_performer_resolve_request() FROM PUBLIC;

CREATE TRIGGER trg_nhs_performer_resolve_request
  AFTER INSERT ON public.nhs_performer
  FOR EACH ROW
  EXECUTE FUNCTION app_private.fn_nhs_performer_resolve_request();

COMMENT ON TRIGGER trg_nhs_performer_resolve_request ON public.nhs_performer IS
  'Auto-marks the matching PENDING nhs_performer_request as COMPLETED when an nhs_performer row is created.';

-- ---------------------------------------------------------------------------
-- 4. Add to realtime publication so the badge updates live
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.nhs_performer_request;

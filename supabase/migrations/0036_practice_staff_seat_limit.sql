-- ============================================================================
-- 0036_practice_staff_seat_limit.sql
-- Per-practice seat limit for active practice_member rows.
--
-- Two layers of enforcement:
--
--   1. The `practice.staff_seat_limit` column (nullable). Operators set it
--      from admin. NULL means unlimited (e.g. enterprise plan, internal
--      practice, untriaged trial). A non-null integer caps the number of
--      active practice_member rows allowed for that practice.
--
--   2. A BEFORE INSERT/UPDATE trigger on `practice_member`. This is the
--      hard guarantee — the edge function pre-check is for friendly errors,
--      not security. The trigger:
--        - Only fires when the row will end up active (deleted_at IS NULL).
--        - On UPDATE, only fires when the row is being restored
--          (was deleted, becoming active). Plain role/name updates skip.
--        - Locks the practice row with SELECT ... FOR UPDATE so two
--          concurrent invites can't both pass the count check and overrun
--          the limit. Postgres serialises them on the practice row's lock.
--        - Lowering the limit while currently over it is allowed —
--          existing members stay; new invites are blocked until the
--          active count drops below the new limit. (Operators don't get
--          to silently kick people out by tweaking a number.)
--
-- Why a SECURITY DEFINER trigger function in app_private:
--   - Same pattern as fn_set_audit_columns / fn_audit_log (CLAUDE.md rule:
--     SECURITY DEFINER lives in app_private, never in public).
--   - Allows the function to read practice.staff_seat_limit even from a
--     context where the inserting user has no SELECT privilege on practice.
--
-- Out of scope (deliberate):
--   - Per-role caps (e.g. "max 2 dentists"). The seat limit is a flat
--     headcount across active members regardless of role.
--   - Auto-expiry of seats. The limit applies at insert/restore time only.
-- ============================================================================

-- 1. Column ------------------------------------------------------------------

ALTER TABLE public.practice
  ADD COLUMN staff_seat_limit integer NULL;

ALTER TABLE public.practice
  ADD CONSTRAINT practice_staff_seat_limit_nonneg
  CHECK (staff_seat_limit IS NULL OR staff_seat_limit >= 0);

COMMENT ON COLUMN public.practice.staff_seat_limit IS
  'Max number of active practice_member rows allowed for this practice. NULL = unlimited. Enforced by trigger trg_enforce_staff_seat_limit on practice_member.';

-- 2. Trigger function --------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.fn_enforce_staff_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_limit         integer;
  v_active_count  integer;
BEGIN
  -- Only enforce when the row will end up active. Soft-deletes,
  -- role changes on already-active rows, etc. don't grow the headcount.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if the row was already active — only restores grow
  -- the count. (INSERT always counts as growth.)
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lock the practice row to serialise concurrent inserts/restores into
  -- the same practice. Without this, two simultaneous invites could both
  -- read count = N - 1 and both insert, ending at N + 1.
  SELECT staff_seat_limit
    INTO v_limit
    FROM public.practice
    WHERE id = NEW.practice_id
    FOR UPDATE;

  -- NULL = unlimited.
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count OTHER currently-active members (exclude this row, which is
  -- either being inserted or restored). Adding 1 gives the projected
  -- post-operation count.
  SELECT COUNT(*)
    INTO v_active_count
    FROM public.practice_member
    WHERE practice_id = NEW.practice_id
      AND deleted_at IS NULL
      AND id <> NEW.id;

  IF v_active_count + 1 > v_limit THEN
    RAISE EXCEPTION
      'Staff seat limit reached: this practice allows % active member(s). Remove or deactivate an existing member first, or ask Dentaloptima to raise the seat limit.',
      v_limit
      USING ERRCODE = 'P0001',
            HINT = 'Edit the practice from the operator dashboard to change staff_seat_limit.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.fn_enforce_staff_seat_limit() FROM PUBLIC;

COMMENT ON FUNCTION app_private.fn_enforce_staff_seat_limit() IS
  'BEFORE trigger fn enforcing practice.staff_seat_limit on practice_member inserts and restores. SECURITY DEFINER — needs to read practice.staff_seat_limit regardless of caller privileges.';

-- 3. Trigger -----------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_enforce_staff_seat_limit ON public.practice_member;

CREATE TRIGGER trg_enforce_staff_seat_limit
  BEFORE INSERT OR UPDATE OF deleted_at ON public.practice_member
  FOR EACH ROW
  EXECUTE FUNCTION app_private.fn_enforce_staff_seat_limit();

COMMENT ON TRIGGER trg_enforce_staff_seat_limit ON public.practice_member IS
  'Enforces practice.staff_seat_limit. Fires only on inserts and on updates of deleted_at (i.e. restores). Plain row updates skip the trigger entirely.';

-- ============================================================================
-- 0040_admin_gated_patient_fields.sql
-- Lock specific patient columns so only OWNER/ADMIN can change them.
--
-- Most patient fields (name, contact, GP, marketing consent) are
-- legitimately edited by clinicians and receptionists during the day —
-- the existing RLS policy is correct that any practice member can UPDATE
-- their practice's patient rows. But a few columns carry regulatory or
-- cross-practice weight and shouldn't be writable by every member:
--
--   legal_hold / legal_hold_reason
--     Blocks retention auto-delete. Lifting a legal hold without admin
--     review could destroy evidence in a complaint or regulatory case.
--
--   deleted_at
--     Soft-delete. Hides the patient from the clinical UI; should sit
--     with admin so a clinician can't make a problematic record vanish.
--
--   practice_id
--     Cross-tenant move. Should never happen via the booking app — if
--     it does, RLS would also reject the row, but enforcing here too
--     makes the intent explicit.
--
-- We could split UPDATE into a column-level GRANT, but Postgres
-- column-level grants don't combine well with RLS roles (the booking app
-- uses one `authenticated` role for both members and admins). A BEFORE
-- UPDATE trigger that compares OLD/NEW and gates on is_practice_admin()
-- is the cleanest fit.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_private.fn_enforce_patient_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_changed_admin_field text := NULL;
BEGIN
  -- Identify the first locked-down field that changed. We surface it in
  -- the error so the booking app can show a useful toast rather than a
  -- generic "permission denied".
  IF NEW.legal_hold IS DISTINCT FROM OLD.legal_hold THEN
    v_changed_admin_field := 'legal_hold';
  ELSIF NEW.legal_hold_reason IS DISTINCT FROM OLD.legal_hold_reason THEN
    v_changed_admin_field := 'legal_hold_reason';
  ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    v_changed_admin_field := 'deleted_at';
  ELSIF NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    v_changed_admin_field := 'practice_id';
  END IF;

  IF v_changed_admin_field IS NULL THEN
    -- No sensitive change — let it through.
    RETURN NEW;
  END IF;

  IF app_private.is_practice_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Only practice OWNER/ADMIN can change %.', v_changed_admin_field
    USING ERRCODE = 'P0001',
          HINT = 'Ask a practice admin to make this change, or contact Dentaloptima.';
END;
$$;

REVOKE ALL ON FUNCTION app_private.fn_enforce_patient_admin_fields() FROM PUBLIC;

COMMENT ON FUNCTION app_private.fn_enforce_patient_admin_fields() IS
  'BEFORE UPDATE on patient — blocks non-admin changes to legal_hold, deleted_at, and practice_id. Other patient fields are unrestricted (subject to RLS).';

DROP TRIGGER IF EXISTS trg_enforce_patient_admin_fields ON public.patient;

CREATE TRIGGER trg_enforce_patient_admin_fields
  BEFORE UPDATE ON public.patient
  FOR EACH ROW
  EXECUTE FUNCTION app_private.fn_enforce_patient_admin_fields();

COMMENT ON TRIGGER trg_enforce_patient_admin_fields ON public.patient IS
  'Gates legal_hold, legal_hold_reason, deleted_at and practice_id to OWNER/ADMIN only. The base UPDATE policy stays open for all members so day-to-day patient edits keep working.';

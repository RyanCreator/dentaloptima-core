-- ============================================================================
-- 0014_operator_role.sql
-- Operator role for the admin dashboard.
--
-- An "operator" is a Dentaloptima staff member (Ryan + future colleagues)
-- who needs cross-tenant visibility — list all practices, see audit logs
-- across the platform, manage subscriptions, etc. Operators are NOT
-- members of any practice (no practice_member row).
--
-- Marker: `auth.users.raw_app_meta_data->>'is_operator' = 'true'`. Per
-- Supabase guidance, app_metadata (raw_app_meta_data) is service-role-only,
-- so users can't elevate themselves via the user_metadata back-door.
--
-- Tables operators can see across practices:
--   * practice (list all)
--   * practice_member (list members of any practice)
--   * audit + clinical_audit (forensics across the platform)
--
-- Tables that REMAIN strictly practice-scoped even for operators:
--   * patient + all clinical tables — operators must "impersonate" via a
--     separate session-mode helper (added later) to view clinical data.
--     This keeps clinical access narrowly auditable.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_private.is_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_operator')::boolean,
    false
  );
$$;

GRANT EXECUTE ON FUNCTION app_private.is_operator() TO authenticated;

-- ============================================================================
-- Update policies to allow operators
-- ============================================================================

-- practice — operators see all
DROP POLICY IF EXISTS practice_select_own ON public.practice;
CREATE POLICY practice_select
  ON public.practice FOR SELECT TO authenticated
  USING (
    (select app_private.is_operator())
    OR id = (select app_private.current_practice_id())
  );

DROP POLICY IF EXISTS practice_update_admin ON public.practice;
CREATE POLICY practice_update
  ON public.practice FOR UPDATE TO authenticated
  USING (
    (select app_private.is_operator())
    OR (id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  )
  WITH CHECK (
    (select app_private.is_operator())
    OR id = (select app_private.current_practice_id())
  );

-- Operators can also INSERT practices (though they typically use the edge function)
CREATE POLICY practice_operator_insert
  ON public.practice FOR INSERT TO authenticated
  WITH CHECK ((select app_private.is_operator()));

-- practice_member — operators see all
DROP POLICY IF EXISTS practice_member_select_own_practice ON public.practice_member;
CREATE POLICY practice_member_select
  ON public.practice_member FOR SELECT TO authenticated
  USING (
    (select app_private.is_operator())
    OR practice_id = (select app_private.current_practice_id())
  );

-- audit — operators see all
DROP POLICY IF EXISTS audit_select ON public.audit;
CREATE POLICY audit_select
  ON public.audit FOR SELECT TO authenticated
  USING (
    (select app_private.is_operator())
    OR practice_id = (select app_private.current_practice_id())
  );

-- clinical_audit — operators see all (forensics on clinical changes)
DROP POLICY IF EXISTS clinical_audit_select ON public.clinical_audit;
CREATE POLICY clinical_audit_select
  ON public.clinical_audit FOR SELECT TO authenticated
  USING (
    (select app_private.is_operator())
    OR practice_id = (select app_private.current_practice_id())
  );

-- ============================================================================
-- 0003_consolidate_member_update_policies.sql
-- Address performance advisor warnings from 0001:
--   1. `practice_member_self_update` calls auth.uid() directly, which Postgres
--      re-evaluates per row. Wrapping in `(select auth.uid())` lets the
--      planner cache it as an InitPlan.
--   2. `practice_member_self_update` + `practice_member_admin_update` are
--      both permissive UPDATE policies on the same table+role. Postgres
--      runs both for every row. Merging into a single OR-policy halves
--      the per-row evaluation.
-- Also wrap SECURITY DEFINER helpers in (select ...) on all policies for
-- the same InitPlan caching benefit.
-- ============================================================================

DROP POLICY IF EXISTS practice_member_self_update ON public.practice_member;
DROP POLICY IF EXISTS practice_member_admin_update ON public.practice_member;
DROP POLICY IF EXISTS practice_member_admin_insert ON public.practice_member;
DROP POLICY IF EXISTS practice_member_select_own_practice ON public.practice_member;
DROP POLICY IF EXISTS practice_select_own ON public.practice;
DROP POLICY IF EXISTS practice_update_admin ON public.practice;

-- practice
CREATE POLICY practice_select_own
  ON public.practice FOR SELECT
  TO authenticated
  USING (id = (select app_private.current_practice_id()));

CREATE POLICY practice_update_admin
  ON public.practice FOR UPDATE
  TO authenticated
  USING (id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (id = (select app_private.current_practice_id()));

-- practice_member
CREATE POLICY practice_member_select_own_practice
  ON public.practice_member FOR SELECT
  TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

-- Merged: a member can update either their own row, or any row in their
-- practice if they're an admin. Single permissive policy = one evaluation
-- per row instead of two. The role-escalation trigger (0001) still
-- prevents non-admins from changing role/practice_id.
CREATE POLICY practice_member_update
  ON public.practice_member FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  )
  WITH CHECK (
    user_id = (select auth.uid())
    OR (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  );

CREATE POLICY practice_member_admin_insert
  ON public.practice_member FOR INSERT
  TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

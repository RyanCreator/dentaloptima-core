-- ============================================================================
-- 0007_split_for_all_policies.sql
-- Address multiple_permissive_policies WARN from 0006.
-- FOR ALL policies overlap with the dedicated *_select policies for the
-- SELECT action, so Postgres evaluates two permissive policies per row.
-- Splitting FOR ALL into explicit FOR INSERT and FOR UPDATE removes the
-- overlap. (No DELETE policies — soft-delete via deleted_at only.)
-- ============================================================================

-- service
DROP POLICY IF EXISTS service_admin_write ON public.service;
CREATE POLICY service_admin_insert ON public.service FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY service_admin_update ON public.service FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- staff_service
DROP POLICY IF EXISTS staff_service_admin_write ON public.staff_service;
CREATE POLICY staff_service_admin_insert ON public.staff_service FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY staff_service_admin_update ON public.staff_service FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY staff_service_admin_delete ON public.staff_service FOR DELETE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- practice_hours
DROP POLICY IF EXISTS practice_hours_admin_write ON public.practice_hours;
CREATE POLICY practice_hours_admin_insert ON public.practice_hours FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY practice_hours_admin_update ON public.practice_hours FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- practice_closure
DROP POLICY IF EXISTS practice_closure_admin_write ON public.practice_closure;
CREATE POLICY practice_closure_admin_insert ON public.practice_closure FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY practice_closure_admin_update ON public.practice_closure FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY practice_closure_admin_delete ON public.practice_closure FOR DELETE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- staff_availability
DROP POLICY IF EXISTS staff_availability_write ON public.staff_availability;
CREATE POLICY staff_availability_insert ON public.staff_availability FOR INSERT TO authenticated
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  );
CREATE POLICY staff_availability_update ON public.staff_availability FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  );
CREATE POLICY staff_availability_delete ON public.staff_availability FOR DELETE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  );

-- staff_break
DROP POLICY IF EXISTS staff_break_write ON public.staff_break;
CREATE POLICY staff_break_insert ON public.staff_break FOR INSERT TO authenticated
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  );
CREATE POLICY staff_break_update ON public.staff_break FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  );
CREATE POLICY staff_break_delete ON public.staff_break FOR DELETE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (staff_id = (select app_private.current_member_id()) OR (select app_private.is_practice_admin()))
  );

-- blocked_time
DROP POLICY IF EXISTS blocked_time_write ON public.blocked_time;
CREATE POLICY blocked_time_insert ON public.blocked_time FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY blocked_time_update ON public.blocked_time FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));
CREATE POLICY blocked_time_delete ON public.blocked_time FOR DELETE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

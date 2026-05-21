-- ============================================================================
-- 0037_lookup_practice_seat_limit.sql
-- Surface practice.staff_seat_limit through the bootstrap RPC so the booking
-- app can render the "X / Y seats used" chip on StaffManagement and disable
-- the self-service invite button when the practice is at capacity.
--
-- DROP+CREATE because the row signature changes (same pattern as 0033 did
-- when adding booking_app_enabled).
-- ============================================================================

DROP FUNCTION IF EXISTS public.lookup_practice_by_hostname(text);

CREATE FUNCTION public.lookup_practice_by_hostname(p_hostname text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  country text,
  timezone text,
  marketing_site_enabled boolean,
  booking_app_enabled boolean,
  staff_seat_limit integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    p.id,
    p.name,
    p.slug,
    p.status::text,
    p.country,
    p.timezone,
    p.marketing_site_enabled,
    p.booking_app_enabled,
    p.staff_seat_limit
  FROM public.practice p
  WHERE p.custom_hostname = lower(p_hostname)
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_practice_by_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_practice_by_hostname(text) TO anon, authenticated;

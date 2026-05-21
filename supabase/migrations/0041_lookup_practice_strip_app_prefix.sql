-- ============================================================================
-- 0041_lookup_practice_strip_app_prefix.sql
-- Make the practice lookup tolerate the `app.` subdomain.
--
-- Convention:
--   <practice>.co.uk        → marketing site
--   app.<practice>.co.uk    → booking app
--
-- The marketing site and booking app share one practice row, identified by
-- a single `custom_hostname`. We store the marketing-side host (the bare
-- practice domain) in that column and have the lookup match either form:
--
--   exact: custom_hostname = 'demo.dentaloptima.co.uk'
--          requested = 'demo.dentaloptima.co.uk'      ✓
--
--   stripped: custom_hostname = 'demo.dentaloptima.co.uk'
--             requested = 'app.demo.dentaloptima.co.uk' (strip 'app.')  ✓
--
-- This means a practice doesn't need to register two hostnames — they
-- register their marketing domain and the booking app at app.<that>
-- resolves to the same practice automatically.
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
  WITH normalised AS (
    SELECT
      lower(p_hostname) AS exact_host,
      -- Strip a leading `app.` subdomain only — keep `www.` etc untouched
      -- since those are usually genuinely different deployments.
      regexp_replace(lower(p_hostname), '^app\.', '') AS stripped_host
  )
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
  FROM public.practice p, normalised n
  WHERE p.deleted_at IS NULL
    AND (
      p.custom_hostname = n.exact_host
      OR p.custom_hostname = n.stripped_host
    )
  -- Prefer the exact match when both forms exist for different practices —
  -- e.g. someone registered both bare and app-prefixed hostnames separately.
  ORDER BY (p.custom_hostname = n.exact_host) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_practice_by_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_practice_by_hostname(text) TO anon, authenticated;

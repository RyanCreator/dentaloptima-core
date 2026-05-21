-- 0022_lookup_practice_by_hostname.sql
--
-- The booking app boots BEFORE auth (the operator/practice-member hasn't
-- logged in yet) and needs to know which practice the current hostname maps
-- to so it can render branding + decide whether to show login or a "domain
-- not configured" page.
--
-- RLS on `public.practice` is `authenticated`-only, so a direct SELECT from
-- anon returns zero rows. We expose a minimal, hostname-keyed lookup via a
-- SECURITY DEFINER RPC that returns only the fields the booting app needs:
-- id, name, slug, status, country, timezone. Sensitive columns (primary
-- email, NHS contract IDs, etc.) are not returned by this RPC.
--
-- Returning a SETOF row instead of a single row simplifies the type story
-- on the client (zero rows = "not configured", one row = found, never more
-- than one because custom_hostname is UNIQUE).

CREATE OR REPLACE FUNCTION public.lookup_practice_by_hostname(p_hostname text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  country text,
  timezone text
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
    p.timezone
  FROM public.practice p
  WHERE p.custom_hostname = lower(p_hostname)
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_practice_by_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_practice_by_hostname(text) TO anon, authenticated;

COMMENT ON FUNCTION public.lookup_practice_by_hostname(text) IS
  'Anon-callable lookup used by the booking app at boot to resolve window.location.hostname to a practice. Returns minimal non-sensitive fields. Empty result means the hostname has no tenant configured yet.';

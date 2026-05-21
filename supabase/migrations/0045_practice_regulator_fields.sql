-- 0045_practice_regulator_fields.sql
--
-- Add regulator-display fields to public.practice + republish the
-- marketing-site lookup RPC so the new fields flow through to the public
-- footer.
--
-- Why these three:
--   - ico_registration_number: UK GDPR requires every dental practice to
--     register as a data controller with the ICO, AND to display the
--     registration number on their public site. Was previously not in
--     the schema at all.
--   - cqc_rating: latest published CQC inspection rating. Commonly
--     displayed on practice websites as a trust signal. Constrained to
--     the four official outcomes.
--   - cqc_rating_date: lets the public site say "Rated Good (March 2024)"
--     instead of just "Good", which is more credible.

ALTER TABLE public.practice
  ADD COLUMN IF NOT EXISTS ico_registration_number text,
  ADD COLUMN IF NOT EXISTS cqc_rating text
    CHECK (cqc_rating IS NULL OR cqc_rating IN ('OUTSTANDING','GOOD','REQUIRES_IMPROVEMENT','INADEQUATE')),
  ADD COLUMN IF NOT EXISTS cqc_rating_date date;

COMMENT ON COLUMN public.practice.ico_registration_number IS
  'ICO data-controller registration number (e.g. Z1234567). Legally required to display on the public practice site.';
COMMENT ON COLUMN public.practice.cqc_rating IS
  'Latest CQC inspection rating. One of OUTSTANDING, GOOD, REQUIRES_IMPROVEMENT, INADEQUATE.';
COMMENT ON COLUMN public.practice.cqc_rating_date IS
  'Date the cqc_rating was published. Lets the public site say "Rated Good (March 2024)".';

-- Republish the marketing-site lookup RPC so the new fields flow through.
-- The function returns a fixed-shape TABLE so we have to drop+recreate
-- when the shape changes.
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
  staff_seat_limit integer,
  ico_registration_number text,
  cqc_provider_id text,
  cqc_rating text,
  cqc_rating_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH normalised AS (
    SELECT
      lower(p_hostname) AS exact_host,
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
    p.staff_seat_limit,
    p.ico_registration_number,
    p.cqc_provider_id,
    p.cqc_rating,
    p.cqc_rating_date
  FROM public.practice p, normalised n
  WHERE p.deleted_at IS NULL
    AND (
      p.custom_hostname = n.exact_host
      OR p.custom_hostname = n.stripped_host
    )
  ORDER BY (p.custom_hostname = n.exact_host) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_practice_by_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_practice_by_hostname(text) TO anon, authenticated;

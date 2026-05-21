-- 0047_practice_principal_dentist.sql
--
-- Make the Principal Dentist's name + GDC number live-editable from the
-- booking app. Currently sourced from the marketing site's static
-- practice.config.ts (the "Dr Sarah Chen / 245678" demo content), which
-- means changing the principal requires a code change + redeploy. The
-- public site footer's Regulatory Information block displays this, so
-- it needs to be operator-editable like ICO + CQC already are.
--
-- The rest of the team (photos, bios, secondary clinicians) stays in
-- the marketing config — that's handcrafted content per-deployment.
-- Only the regulator-facing principal lives in the DB.

ALTER TABLE public.practice
  ADD COLUMN IF NOT EXISTS principal_dentist_name text,
  ADD COLUMN IF NOT EXISTS principal_dentist_gdc_number text;

COMMENT ON COLUMN public.practice.principal_dentist_name IS
  'Display name of the Principal Dentist (e.g. "Dr Sarah Chen"). Shown in the public site footer Regulatory Information block alongside the GDC number.';
COMMENT ON COLUMN public.practice.principal_dentist_gdc_number IS
  'GDC registration number of the Principal Dentist. Usually 6 digits. Stored as text to preserve any leading zeros and avoid integer overflow concerns.';

-- Republish the marketing-site lookup RPC to include the new fields.
-- Function returns a fixed-shape TABLE, so a shape change requires drop+recreate.
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
  cqc_rating_date date,
  complaints_procedure jsonb,
  principal_dentist_name text,
  principal_dentist_gdc_number text
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
    p.cqc_rating_date,
    p.complaints_procedure,
    p.principal_dentist_name,
    p.principal_dentist_gdc_number
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

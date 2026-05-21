-- ============================================================================
-- 0032_practice_marketing_site_enabled.sql
-- Operator-controlled toggle for the public marketing site. Defaults to
-- false (opt-in) so a brand-new practice doesn't immediately publish a site
-- with placeholder content; the operator flips it on once the practice has
-- supplied logo/branding/services.
--
-- Public surface impact:
--   - lookup_practice_by_hostname now returns the flag so the marketing app
--     can render a "coming soon" state without a separate round-trip.
--   - list_public_services + submit_public_booking_request both refuse when
--     the site is disabled. The web app's authenticated paths
--     (practice members creating booking requests internally) are unaffected
--     because they don't go through these RPCs.
--
-- Why a separate flag rather than re-using `practice.status`:
--   status drives whether the practice CAN operate at all (TRIAL, ACTIVE,
--   SUSPENDED, OFFBOARDED). The marketing site is a distinct surface a
--   practice may not want yet — e.g. a practice that's paying customers
--   and using the calendar but isn't ready to publish a public site.
-- ============================================================================

ALTER TABLE public.practice
  ADD COLUMN marketing_site_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.practice.marketing_site_enabled IS
  'Operator/practice-admin toggle that publishes (or unpublishes) the public marketing site at the practice''s custom hostname. False by default — must be explicitly enabled.';

-- ----------------------------------------------------------------------------
-- Update lookup_practice_by_hostname to return the flag.
-- The signature changes (extra column), so the marketing app's tenantLoader
-- needs to be aware of it. Web/admin clients still work — they ignore
-- columns they don't reference.
-- ----------------------------------------------------------------------------

-- DROP + recreate because the return signature changes — Postgres won''t
-- let CREATE OR REPLACE alter a function''s row type.
DROP FUNCTION IF EXISTS public.lookup_practice_by_hostname(text);

CREATE FUNCTION public.lookup_practice_by_hostname(p_hostname text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  country text,
  timezone text,
  marketing_site_enabled boolean
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
    p.marketing_site_enabled
  FROM public.practice p
  WHERE p.custom_hostname = lower(p_hostname)
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_practice_by_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_practice_by_hostname(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Tighten the public RPCs: refuse when the marketing site is disabled.
-- The marketing site''s tenantLoader will short-circuit before calling these,
-- but we belt-and-brace at the DB level too — anyone with the practice_id
-- could otherwise still POST submissions.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_public_services(p_practice_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  duration_minutes integer,
  is_nhs boolean,
  nhs_band text,
  price_pence integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  -- nhs_band is a custom enum (`BAND_1`..`BAND_3`, `URGENT`, etc) — cast
  -- to text for a simpler type story on the JS client. Marketing site is
  -- gated by practice.marketing_site_enabled in addition to practice.status.
  SELECT
    s.id,
    s.name,
    s.duration_minutes,
    s.is_nhs,
    s.nhs_band::text,
    s.price_pence
  FROM public.service s
  JOIN public.practice p ON p.id = s.practice_id
  WHERE s.practice_id = p_practice_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND p.status IN ('TRIAL', 'ACTIVE')
    AND p.marketing_site_enabled = true
    AND p.deleted_at IS NULL
  ORDER BY s.name;
$$;

REVOKE ALL ON FUNCTION public.list_public_services(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_services(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_booking_request(
  p_practice_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_id uuid DEFAULT NULL,
  p_preferred_starts_at timestamptz DEFAULT NULL,
  p_alternative_times text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_new_patient boolean DEFAULT true,
  p_is_emergency boolean DEFAULT false,
  p_source_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_request_id uuid;
  v_practice_ok boolean;
  v_service_ok boolean;
BEGIN
  -- Practice must exist, be live, AND have the marketing site enabled.
  -- Internal booking_request inserts (web app, authenticated) bypass this
  -- RPC entirely so they aren''t affected by the toggle.
  SELECT TRUE INTO v_practice_ok
  FROM public.practice
  WHERE id = p_practice_id
    AND status IN ('TRIAL', 'ACTIVE')
    AND marketing_site_enabled = true
    AND deleted_at IS NULL;

  IF v_practice_ok IS NULL THEN
    RAISE EXCEPTION 'Practice not available for online booking'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT TRUE INTO v_service_ok
    FROM public.service
    WHERE id = p_service_id
      AND practice_id = p_practice_id
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_service_ok IS NULL THEN
      RAISE EXCEPTION 'Service not available'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.booking_request (
    practice_id,
    status,
    first_name,
    last_name,
    email,
    phone,
    service_id,
    preferred_starts_at,
    alternative_times,
    notes,
    is_new_patient,
    is_emergency,
    source,
    source_url
  )
  VALUES (
    p_practice_id,
    'NEW',
    btrim(left(p_first_name, 120)),
    btrim(left(p_last_name, 120)),
    NULLIF(btrim(left(p_email, 200)), '')::citext,
    NULLIF(btrim(left(p_phone, 40)), ''),
    p_service_id,
    p_preferred_starts_at,
    NULLIF(btrim(left(p_alternative_times, 1000)), ''),
    NULLIF(btrim(left(p_notes, 4000)), ''),
    p_is_new_patient,
    p_is_emergency,
    'PUBLIC_FORM',
    NULLIF(btrim(left(p_source_url, 500)), '')
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_booking_request(
  uuid, text, text, text, text, uuid, timestamptz, text, text, boolean, boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_public_booking_request(
  uuid, text, text, text, text, uuid, timestamptz, text, text, boolean, boolean, text
) TO anon, authenticated;

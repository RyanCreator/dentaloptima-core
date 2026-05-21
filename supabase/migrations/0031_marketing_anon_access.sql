-- ============================================================================
-- 0031_marketing_anon_access.sql
-- Anon-callable surface for the public marketing site (`marketing/`).
-- Two SECURITY DEFINER RPCs gate exactly what's reachable from the patient-
-- facing site without auth:
--
--   public.list_public_services(p_practice_id) — bookable services list
--   public.submit_public_booking_request(...)   — write-only booking form
--
-- We deliberately use RPCs (not direct table policies) so the surface is
-- explicit and narrow. Adding a column to `service` doesn't accidentally
-- leak it to the public; adding a column to `booking_request` doesn't
-- accidentally let the public set it. Both functions revoke ALL from PUBLIC
-- and explicitly GRANT EXECUTE to anon.
--
-- The hostname → practice lookup (`lookup_practice_by_hostname`) was already
-- exposed in 0022. The marketing site uses it to resolve practice_id at boot;
-- subsequent calls into these RPCs pass that practice_id explicitly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- list_public_services — minimal, public-safe slice of the service table.
-- Only `is_active = true AND deleted_at IS NULL` rows are returned. Columns
-- exposed are the ones the booking form needs to render a service picker:
-- id, name, duration, NHS flags, price.
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
  -- to text for a simpler type story on the JS client.
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
    AND p.deleted_at IS NULL
  ORDER BY s.name;
$$;

REVOKE ALL ON FUNCTION public.list_public_services(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_services(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.list_public_services(uuid) IS
  'Anon-callable list of bookable services for a practice''s public site. Only active, non-deleted services on a live practice.';

-- ----------------------------------------------------------------------------
-- submit_public_booking_request — single entry point for the marketing site''s
-- booking + contact forms. Server-side guarantees:
--   1. practice_id references a live (TRIAL or ACTIVE) practice
--   2. service_id (if provided) belongs to the same practice and is active
--   3. row is stamped with status='NEW' and source='PUBLIC_FORM' regardless of
--      what the client tries to send
--   4. all the privileged fields (viewed_*, responded_*, resulting_appointment_id,
--      rejection_reason) stay null
--
-- Light input hygiene: TRIM + length caps. We deliberately don''t do email/
-- phone format validation here — that's the client''s job, and a malformed
-- value still records the user''s intent for the practice to see. Returns the
-- new request''s id so the form can show a confirmation reference.
-- ----------------------------------------------------------------------------

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
  -- Practice must exist + be live. We check explicitly so the error is
  -- clear ("Practice unavailable") rather than a foreign-key cryptic.
  SELECT TRUE INTO v_practice_ok
  FROM public.practice
  WHERE id = p_practice_id
    AND status IN ('TRIAL', 'ACTIVE')
    AND deleted_at IS NULL;

  IF v_practice_ok IS NULL THEN
    RAISE EXCEPTION 'Practice not available for online booking'
      USING ERRCODE = 'check_violation';
  END IF;

  -- If a service was specified, it must belong to this practice and be active.
  -- A null service_id is fine — covers contact-form-style enquiries with no
  -- specific service.
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

COMMENT ON FUNCTION public.submit_public_booking_request(
  uuid, text, text, text, text, uuid, timestamptz, text, text, boolean, boolean, text
) IS
  'Anon-callable booking-request submission for the public marketing site. Validates practice + service are live, sanitises input, stamps status=NEW and source=PUBLIC_FORM. Returns the new booking_request id.';

-- ============================================================================
-- 0042_fix_submit_booking_citext_cast.sql
-- The submit_public_booking_request RPC casts the email argument to
-- citext, but the citext extension lives in the `extensions` schema and
-- the function's search_path is `pg_catalog, public, pg_temp`. The bare
-- `::citext` cast can't resolve the type at execution time and fails with
-- error 42704 "type \"citext\" does not exist".
--
-- Two fixes possible:
--   1. Add `extensions` to the function's search_path
--   2. Schema-qualify the cast: `::extensions.citext`
--
-- Option 2 is more explicit and doesn't depend on search_path order, so
-- we go with that. Function body is otherwise unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_public_booking_request(
  p_practice_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_id uuid DEFAULT NULL::uuid,
  p_preferred_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_alternative_times text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_is_new_patient boolean DEFAULT true,
  p_is_emergency boolean DEFAULT false,
  p_source_url text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_request_id uuid;
  v_practice_ok boolean;
  v_service_ok boolean;
BEGIN
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
    practice_id, status, first_name, last_name, email, phone,
    service_id, preferred_starts_at, alternative_times, notes,
    is_new_patient, is_emergency, source, source_url
  )
  VALUES (
    p_practice_id, 'NEW',
    btrim(left(p_first_name, 120)),
    btrim(left(p_last_name, 120)),
    -- Schema-qualify the citext cast — the extensions schema isn't on
    -- this function's search_path so a bare `::citext` errors with 42704.
    NULLIF(btrim(left(p_email, 200)), '')::extensions.citext,
    NULLIF(btrim(left(p_phone, 40)), ''),
    p_service_id, p_preferred_starts_at,
    NULLIF(btrim(left(p_alternative_times, 1000)), ''),
    NULLIF(btrim(left(p_notes, 4000)), ''),
    p_is_new_patient, p_is_emergency, 'PUBLIC_FORM',
    NULLIF(btrim(left(p_source_url, 500)), '')
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

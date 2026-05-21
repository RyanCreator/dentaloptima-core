-- ============================================================================
-- 0033_practice_booking_app_enabled.sql
-- Operator-controlled toggle for the practice-management booking app (web/).
-- Distinct from `marketing_site_enabled` — together they describe the
-- product the practice has bought:
--   marketing_site=on  + booking_app=on   → full package
--   marketing_site=on  + booking_app=off  → website-only plan
--   marketing_site=off + booking_app=on   → internal scheduling only
--   marketing_site=off + booking_app=off  → nothing public yet (new tenant)
--
-- DEFAULT true so existing practices keep working through the migration —
-- they''ve been using the booking app and shouldn''t lose access overnight.
-- New practices can be flipped to false from admin if they''re a
-- website-only customer.
--
-- The flag gates three places:
--   1. web/ — practice members can sign in but hit a wall page when this
--      is off. Login still happens so the operator can see who tried.
--   2. marketing/ Book.tsx — wizard form when on, simple enquiry form when off.
--   3. list_public_services RPC — empty when off (the wizard isn''t
--      rendering, so there''s no reason to expose services).
--
-- submit_public_booking_request stays callable regardless — when booking
-- is off, the marketing site still posts simpler enquiries to the same
-- table, and the operator/admin reviews them out-of-band (no in-app inbox
-- yet for website-only customers — that''s a future piece).
-- ============================================================================

ALTER TABLE public.practice
  ADD COLUMN booking_app_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.practice.booking_app_enabled IS
  'Operator toggle that gates access to the booking + practice management app (web/). Default true. When false, practice members hit a wall page after sign-in and the marketing site renders a simple enquiry form instead of the booking wizard.';

-- ----------------------------------------------------------------------------
-- Add the flag to lookup_practice_by_hostname''s return type. DROP+CREATE
-- because the row signature changes.
-- ----------------------------------------------------------------------------

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
  booking_app_enabled boolean
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
    p.booking_app_enabled
  FROM public.practice p
  WHERE p.custom_hostname = lower(p_hostname)
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_practice_by_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_practice_by_hostname(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- list_public_services additionally gated on booking_app_enabled. When the
-- booking app is off, the marketing site renders a simple enquiry form
-- and never calls this RPC; this is defence in depth in case someone hits
-- the RPC directly with a known practice_id.
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
    AND p.booking_app_enabled = true
    AND p.deleted_at IS NULL
  ORDER BY s.name;
$$;

REVOKE ALL ON FUNCTION public.list_public_services(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_services(uuid) TO anon, authenticated;

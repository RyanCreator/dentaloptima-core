-- 0046_practice_complaints_procedure.sql
--
-- Store each practice's complaints procedure as a single JSONB column on
-- public.practice. One per practice, edited from the booking app's
-- Settings → Complaints Procedure section, and rendered publicly on the
-- marketing site's /complaints page.
--
-- Shape (TypeScript-style):
--   {
--     "complaints_manager_name": string,           // named person
--     "complaints_manager_role": string | null,    // e.g. "Practice Manager"
--     "complaints_manager_email": string | null,   // falls back to practice primary_email
--     "ack_verbal_hours": number,                  // default 24
--     "ack_written_days": number,                  // default 3 working days
--     "update_cadence_days": number,               // default 10 working days
--     "accepts_nhs": boolean,                      // hides NHS ICB block if false
--     "local_icb": {                               // local NHS escalation, region-specific
--       "name": string,
--       "address": string,                         // multi-line, "\n"-separated
--       "email": string | null,
--       "phone": string | null
--     } | null,
--     "additional_notes": string | null,           // free-text addendum
--     "last_reviewed_at": string | null            // ISO date — surfaces as "Last reviewed dd mmm yyyy"
--   }
--
-- Why JSONB and not a dedicated table:
--   - Exactly one per practice. A separate table would be a 1:1 join for
--     no payoff.
--   - The shape is small + we don't query individual fields server-side.
--   - National regulator contacts (GDC, CQC, Ombudsman) are NOT stored —
--     they're hardcoded in the shared renderer because they're identical
--     for every UK practice and centralising them means one place to
--     update if any contact details change.
--
-- NULL on the column means "no procedure published yet" — the editor
-- detects that and offers a one-click "Use defaults" template.

ALTER TABLE public.practice
  ADD COLUMN IF NOT EXISTS complaints_procedure jsonb;

COMMENT ON COLUMN public.practice.complaints_procedure IS
  'CQC-compliant patient complaints procedure. Edited via booking app Settings, rendered publicly on the marketing site /complaints page. NULL when the practice has not yet published a procedure.';

-- Republish the marketing-site lookup RPC to include the new field.
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
  complaints_procedure jsonb
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
    p.complaints_procedure
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

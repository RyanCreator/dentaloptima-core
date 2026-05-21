-- 0044_outreach_contact_practice_fields.sql
--
-- Reshape outreach_contact for practice-prospect-list use (vs the email-
-- marketing-list shape it started with in 0017). The outreach_* tables
-- live in the tenant-registry project's `public` schema — the `ops`
-- schema was dropped in 0034 and these moved to public during that
-- consolidation. Apply this against tenant-registry, not core.
--
-- Changes:
--   - Add postcode, website, principal_dentist columns
--   - Make email nullable — we now prospect practices that may not have a
--     direct email yet, and dedupe by (practice_name, postcode) instead
--   - Drop the email-unique constraint, replace with a partial unique
--     that still prevents email duplicates *when* an email is set
--   - Add a partial unique on (lower(practice_name), upper(postcode)) so
--     duplicate-practice rows can't sneak in at the DB level even if the
--     import code's dedupe check has a race

ALTER TABLE public.outreach_contact
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS principal_dentist text;

-- Email is no longer the primary identifier — some prospects we know
-- only by practice name + postcode at first. Existing email rows are
-- unaffected; the column just stops being required.
ALTER TABLE public.outreach_contact
  ALTER COLUMN email DROP NOT NULL;

-- The legacy email_key was a hard UNIQUE. Replace with a partial unique
-- that still catches accidental email duplicates but allows multiple
-- rows with NULL email (they're identified by practice_name+postcode).
ALTER TABLE public.outreach_contact
  DROP CONSTRAINT IF EXISTS outreach_contact_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_outreach_email_when_present
  ON public.outreach_contact (email)
  WHERE email IS NOT NULL AND archived_at IS NULL;

-- Primary dedupe key. Case-insensitive on practice name, whitespace
-- removed on postcode (UK postcodes vary in spacing). Active rows only —
-- archived prospects don't block new imports of the same practice.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_outreach_practice_postcode
  ON public.outreach_contact (
    lower(trim(practice_name)),
    upper(regexp_replace(postcode, '\s+', '', 'g'))
  )
  WHERE archived_at IS NULL
    AND practice_name IS NOT NULL
    AND postcode IS NOT NULL;

-- Filter index for postcode-search in the UI.
CREATE INDEX IF NOT EXISTS idx_outreach_contact_postcode
  ON public.outreach_contact (postcode)
  WHERE archived_at IS NULL;

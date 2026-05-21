-- 0004_drop_outreach_email_unique.sql
--
-- Drop the partial unique index that prevented two outreach contacts
-- from sharing an email address. This was a relic from when email was
-- the dedupe identity; the current identity is (practice_name, postcode)
-- (see uniq_outreach_practice_postcode), and many real-world dental
-- practice chains use a shared reception email across branches. Keeping
-- the email constraint actively blocks importing those.
--
-- Email is now supplementary contact info, not an identity. CSV imports
-- in the admin app already dedupe by (practice_name, postcode); the
-- secondary email check was rejecting legitimate rows on the second
-- branch of a chain.

DROP INDEX IF EXISTS public.uniq_outreach_email_when_present;

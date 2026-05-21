-- 0005_outreach_contact_tag.sql
--
-- Add a free-text `tag` column to outreach_contact for the operator's
-- prospecting workflow state. Distinct from `status` (which is the
-- email-deliverability enum: ACTIVE | UNSUBSCRIBED | BOUNCED | COMPLAINED).
--
-- Typical values seen in real spreadsheets:
--   - "Target"            — good prospect, OK to email
--   - "NF" / "Not found"  — couldn't locate them
--   - "Closed"            — practice no longer trading
--   - "Group" / "Portman" / "BUPA" / "Rodericks" / ...  — corporate chains
--   - "NHS"               — NHS-only practice
--   - "Ryan - check"      — TODO note for a specific operator
--   - "???"               — uncertain, needs review
--
-- We deliberately store as plain text rather than an enum so operators
-- can introduce new tag values without a schema migration. The list view
-- will surface a "filter by tag" dropdown built from distinct values.

ALTER TABLE public.outreach_contact
  ADD COLUMN IF NOT EXISTS tag text;

COMMENT ON COLUMN public.outreach_contact.tag IS
  'Operator prospecting workflow tag (e.g. "Target", "NF", "Closed", "Portman"). Distinct from email-deliverability status. Free-text by design — operators can introduce new tags without a schema change.';

-- Useful for fast filter-by-tag in the admin list. NULL-safe partial
-- index since most queries explicitly look for non-null tags.
CREATE INDEX IF NOT EXISTS idx_outreach_contact_tag
  ON public.outreach_contact (tag)
  WHERE tag IS NOT NULL AND archived_at IS NULL;

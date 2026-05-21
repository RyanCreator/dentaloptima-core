-- 0021_practice_custom_hostname.sql
--
-- Per-tenant booking-app hostname. Each practice's booking app lives at
-- `app.<their-domain>` and is served by the single canonical deployment at
-- `app.dentaloptima.co.uk`. The practice CNAMEs their `app.` subdomain to
-- ours; SiteGround provisions SSL.
--
-- Stored as the full hostname (e.g. `app.optimadental.co.uk`) so the booking
-- app can do a direct `where custom_hostname = window.location.hostname`
-- lookup with no string manipulation.
--
-- Nullable while a tenant is being onboarded — the booking app refuses
-- requests for any hostname that doesn't resolve to a practice, so a tenant
-- with no hostname assigned simply has no booking surface yet (which is
-- fine — they're not paying or using it yet).
--
-- UNIQUE prevents two practices accidentally claiming the same hostname.
-- Indexed for the bootstrap lookup on every booking-app request.

ALTER TABLE public.practice
  ADD COLUMN custom_hostname text;

-- Citext would be ideal here but adds an extension dependency for one column.
-- Instead enforce lowercase via a CHECK + the application layer should
-- lowercase before insert.
ALTER TABLE public.practice
  ADD CONSTRAINT practice_custom_hostname_lowercase
  CHECK (custom_hostname IS NULL OR custom_hostname = lower(custom_hostname));

-- Basic syntax check — must look like a hostname. Belt-and-braces; the
-- admin app validates more strictly before insert.
ALTER TABLE public.practice
  ADD CONSTRAINT practice_custom_hostname_format
  CHECK (
    custom_hostname IS NULL
    OR custom_hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  );

CREATE UNIQUE INDEX practice_custom_hostname_key
  ON public.practice (custom_hostname)
  WHERE custom_hostname IS NOT NULL;

COMMENT ON COLUMN public.practice.custom_hostname IS
  'Full hostname the booking app is reachable at, e.g. app.optimadental.co.uk. NULL until DNS + SSL are configured for the tenant. Enforced unique across active tenants.';

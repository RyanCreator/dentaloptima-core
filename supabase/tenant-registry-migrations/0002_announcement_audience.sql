-- ============================================================================
-- 0002_announcement_audience.sql  (tenant-registry)
-- Targeting columns for platform_announcement.
--
-- Existing rows broadcast to every tenant (the only behaviour the schema
-- supported until now). We keep that as the default — `audience_kind = 'ALL'`
-- on every existing row — so this migration is non-disruptive.
--
-- Three audience modes:
--   ALL      — broadcast to every active tenant (current behaviour)
--   STATUS   — apply when tenant.status IN audience_status
--              (e.g. just TRIAL practices, or just ACTIVE+TRIAL)
--   TENANTS  — apply when tenant.id IN audience_tenant_ids
--              (one-off bespoke messaging)
--
-- The booking-app side reads its target practice's id and status at boot,
-- so the filter on the consumer side is a single OR over these three
-- predicates. We're not adding the consumer-side query yet — when the
-- in-app banner returns, it'll do the filtering.
-- ============================================================================

CREATE TYPE public.announcement_audience_kind AS ENUM (
  'ALL',
  'STATUS',
  'TENANTS'
);

ALTER TABLE public.platform_announcement
  ADD COLUMN audience_kind public.announcement_audience_kind NOT NULL DEFAULT 'ALL',
  ADD COLUMN audience_status text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN audience_tenant_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

COMMENT ON COLUMN public.platform_announcement.audience_kind IS
  'How the audience is selected. ALL = every tenant. STATUS = practices whose status is in audience_status. TENANTS = practices whose id is in audience_tenant_ids.';
COMMENT ON COLUMN public.platform_announcement.audience_status IS
  'Tenant statuses this announcement applies to. Only consulted when audience_kind = STATUS.';
COMMENT ON COLUMN public.platform_announcement.audience_tenant_ids IS
  'Specific tenant ids this announcement applies to. Only consulted when audience_kind = TENANTS. Cross-project ids — no FK because tenant lives on this registry but practice ids are sourced from dentaloptima-core.';

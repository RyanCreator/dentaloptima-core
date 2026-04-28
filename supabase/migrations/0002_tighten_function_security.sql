-- ============================================================================
-- 0002_tighten_function_security.sql
-- Address advisor warnings from 0001:
--   1. app_private.fn_set_updated_at — set search_path explicitly so it can't
--      be hijacked by a malicious search_path mutator.
--   2. public.rls_auto_enable — Supabase-installed event trigger auto-enabling
--      RLS on new public tables. It's harmless to call via REST (the
--      pg_event_trigger_ddl_commands() call only returns rows during a DDL
--      event), but advisor flags the EXECUTE grants as risky surface area.
--      Revoke from anon + authenticated; the event trigger machinery doesn't
--      need EXECUTE granted to those roles to fire.
-- ============================================================================

ALTER FUNCTION app_private.fn_set_updated_at()
  SET search_path = pg_catalog, pg_temp;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, PUBLIC;

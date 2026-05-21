-- ============================================================================
-- 0035_recreate_empty_ops_schema.sql
--
-- This project's PostgREST is configured at the Supabase project level
-- (db-schemas: public,ops,graphql_public) to introspect the `ops` schema.
-- Migration 0034 dropped that schema once we moved its data to the
-- tenant-registry project — but that broke PostgREST's startup:
--
--   "Failed to load the schema cache using db-schemas=public,ops,graphql_public
--    {"code":"3F000","message":"schema \"ops\" does not exist"}"
--
-- Symptom: every /rest/v1/* request returned 503 PGRST002 ("Could not query
-- the database for the schema cache") and the dashboard showed "Postgres
-- unhealthy". A project restart didn't fix it because the underlying issue
-- was that PostgREST's required schema list referenced a now-missing schema.
--
-- Fix: recreate `ops` as an empty placeholder. Nothing in it — no tables,
-- no functions. It just needs to EXIST so PostgREST's introspection
-- doesn't fail. The real ops/operator data still lives in tenant-registry.
--
-- Long-term: the project's PostgREST db-schemas setting should be updated
-- to drop `ops` from the list, and then this migration can be reverted.
-- That setting can only be changed via the Supabase dashboard or
-- management API, so for now we keep the empty schema here.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS ops;

GRANT USAGE ON SCHEMA ops TO anon, authenticated, service_role;

COMMENT ON SCHEMA ops IS
  'Empty placeholder. Real ops/operator data lives in the tenant-registry project (hbsuhalvececxvusrqlh). This schema exists only because the project''s PostgREST db-schemas setting still lists it; without this, schema cache fails to build (PGRST002). See migration 0034 for context on why ops was emptied here.';

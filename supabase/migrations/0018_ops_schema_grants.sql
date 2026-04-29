-- ============================================================================
-- 0018_ops_schema_grants.sql
-- Surfaced during data migration: when 0017 created the ops schema we only
-- granted USAGE to authenticated + service_role. service_role also needs
-- INSERT/SELECT/UPDATE/DELETE on the tables so the migration script (and
-- any future server-side admin operations) can bypass RLS.
--
-- Locked down `anon` for safety: anon must NEVER reach ops tables.
-- Operators (authenticated + is_operator() = true) work via RLS policies
-- defined in 0017.
-- ============================================================================

-- service_role: full DML on existing + future tables
GRANT ALL ON ALL TABLES IN SCHEMA ops TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA ops TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops GRANT ALL ON SEQUENCES TO service_role;

-- authenticated: SELECT/INSERT/UPDATE/DELETE — RLS gates by is_operator()
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ops TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ops TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops GRANT USAGE ON SEQUENCES TO authenticated;

-- anon: explicitly revoked. ops is operator-only, never reachable
-- through unauthenticated PostgREST calls.
REVOKE ALL ON ALL TABLES IN SCHEMA ops FROM anon;
REVOKE ALL ON SCHEMA ops FROM anon;

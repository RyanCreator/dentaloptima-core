-- 0020_public_is_operator_wrapper.sql
--
-- Expose `is_operator()` to PostgREST.
--
-- The implementation lives in `app_private.is_operator()` (SECURITY DEFINER,
-- reads auth.jwt() -> 'app_metadata' ->> 'is_operator'). PostgREST only sees
-- the `public` schema, so the admin app's `supabase.rpc("is_operator")` call
-- 404s without a wrapper here.
--
-- This wrapper is SECURITY INVOKER on purpose — only the inner function
-- needs definer rights, and CLAUDE.md prohibits SECURITY DEFINER functions
-- in `public` (Supabase advisor flags them, and they're reachable via PostgREST).

CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT app_private.is_operator();
$$;

REVOKE ALL ON FUNCTION public.is_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_operator() TO anon, authenticated;

COMMENT ON FUNCTION public.is_operator() IS
  'PostgREST-exposed wrapper around app_private.is_operator(). Returns true if the caller''s JWT app_metadata has is_operator=true.';

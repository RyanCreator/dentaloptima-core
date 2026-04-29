-- ============================================================================
-- 0019_list_operators_rpc.sql
-- list_operators() RPC for the Admins page in the new admin app.
--
-- We never want to expose auth.users directly to PostgREST (security boundary)
-- so we wrap the operator query in a SECURITY DEFINER function. It's
-- callable by any authenticated user, but the function itself returns
-- NULL/empty unless the caller is also an operator — enforced inside.
--
-- Returns: id, email, full_name, is_operator, created_at, last_sign_in_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_operators()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  is_operator boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Operator-only access; non-operators get an empty result set.
  IF NOT (SELECT app_private.is_operator()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')::text AS full_name,
    COALESCE((u.raw_app_meta_data->>'is_operator')::boolean, false) AS is_operator,
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  WHERE COALESCE((u.raw_app_meta_data->>'is_operator')::boolean, false) = true
  ORDER BY u.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_operators() TO authenticated;

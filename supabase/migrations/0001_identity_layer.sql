-- ============================================================================
-- 0001_identity_layer.sql
-- Tenant identity foundation for the shared multi-tenant DB.
--
-- Establishes:
--   * `practice` — tenant root (one row per dental practice)
--   * `practice_role` enum — staff role within a practice
--   * `practice_member` — user → practice mapping with role
--   * `app_private` schema — security-definer helpers used by every RLS
--     policy in later migrations
--   * RLS on `practice` + `practice_member`
--
-- Design rules every later migration must follow:
--   1. Every tenant table has `practice_id uuid NOT NULL REFERENCES practice(id)`
--   2. Every tenant index leads with `practice_id`
--   3. Every RLS USING clause is `practice_id = app_private.current_practice_id()`
--      (or `app_private.is_member_of(practice_id)` for cross-practice helpers)
--   4. SECURITY DEFINER functions ONLY in `app_private`, never `public`
-- ============================================================================

-- Private schema: out of PostgREST exposed_schemas so anon/authenticated
-- can't reach SECURITY DEFINER functions through the Data API.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

-- ============================================================================
-- practice — tenant root
-- ============================================================================
CREATE TABLE public.practice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'TRIAL'
    CHECK (status IN ('TRIAL', 'ACTIVE', 'SUSPENDED', 'OFFBOARDED')),
  -- NHS GDS contract identifiers (null until practice goes through PIN)
  nhs_contract_number text,
  nhs_location_id text,
  -- CQC registration (null until practice is registered)
  cqc_provider_id text,
  cqc_location_id text,
  -- Subscription / lifecycle
  plan text NOT NULL DEFAULT 'TRIAL',
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz,
  -- Contact
  primary_email text,
  primary_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  country text NOT NULL DEFAULT 'GB',
  -- Operating
  timezone text NOT NULL DEFAULT 'Europe/London',
  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_practice_status_active
  ON public.practice (status)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.practice IS
  'Tenant root. One row per dental practice. All clinical/scheduling data hangs off practice_id with RLS isolation.';

-- ============================================================================
-- practice_role enum + practice_member
-- ============================================================================
CREATE TYPE public.practice_role AS ENUM (
  'OWNER',
  'ADMIN',
  'DENTIST',
  'HYGIENIST',
  'NURSE',
  'RECEPTIONIST'
);

-- One user belongs to exactly one practice (UNIQUE on user_id). Per the
-- 2026-04-27 design call: locum dentists working at multiple practices use
-- separate auth.users rows, not a many-to-many.
CREATE TABLE public.practice_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  role public.practice_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Profile
  full_name text,
  email text NOT NULL,
  phone text,
  -- Clinical staff specifics
  gdc_number text,
  specialism text,
  available_for_booking boolean NOT NULL DEFAULT false,
  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_practice_member_practice
  ON public.practice_member (practice_id)
  WHERE is_active = true AND deleted_at IS NULL;

COMMENT ON TABLE public.practice_member IS
  'User-to-practice mapping with role. UNIQUE(user_id) enforces one user = one practice.';

-- ============================================================================
-- updated_at maintainer
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_practice_updated_at
  BEFORE UPDATE ON public.practice
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

CREATE TRIGGER trg_practice_member_updated_at
  BEFORE UPDATE ON public.practice_member
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- Security-definer helpers
-- These bypass RLS internally so practice_member lookups don't recurse on
-- their own RLS policies. Every later RLS USING clause calls into these.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_private.current_practice_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT practice_id
  FROM public.practice_member
  WHERE user_id = auth.uid()
    AND is_active = true
    AND deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_private.is_member_of(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_member
    WHERE user_id = auth.uid()
      AND practice_id = p_practice_id
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION app_private.has_role(p_role public.practice_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_member
    WHERE user_id = auth.uid()
      AND role = p_role
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_practice_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_member
    WHERE user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION app_private.current_practice_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_member_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(public.practice_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_practice_admin() TO authenticated;

-- ============================================================================
-- Role-escalation + last-owner protection
-- RLS USING/WITH CHECK can't compare OLD vs NEW. A trigger handles the
-- subtle cases: only admins can change roles, the last OWNER can't be
-- demoted, practice_id can't be reassigned via UPDATE.
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.fn_protect_member_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Practice can never be reassigned via UPDATE — re-create the row instead.
  IF NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    RAISE EXCEPTION 'practice_id is immutable on practice_member; delete + re-create';
  END IF;

  -- Role changes require admin. Service role bypasses RLS but this trigger
  -- still fires; service-role callers are trusted (signup edge function).
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NOT NULL AND NOT app_private.is_practice_admin() THEN
      RAISE EXCEPTION 'Only OWNER or ADMIN can change a member role';
    END IF;
  END IF;

  -- The last OWNER of a practice can't be demoted or deactivated.
  IF OLD.role = 'OWNER'
     AND (NEW.role <> 'OWNER' OR NEW.is_active = false OR NEW.deleted_at IS NOT NULL) THEN
    IF (SELECT COUNT(*)
        FROM public.practice_member
        WHERE practice_id = OLD.practice_id
          AND role = 'OWNER'
          AND is_active = true
          AND deleted_at IS NULL
          AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'Cannot demote or deactivate the last OWNER of a practice';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_practice_member_invariants
  BEFORE UPDATE ON public.practice_member
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_protect_member_invariants();

-- ============================================================================
-- RLS — practice
-- ============================================================================
ALTER TABLE public.practice ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_select_own
  ON public.practice FOR SELECT
  TO authenticated
  USING (id = app_private.current_practice_id());

CREATE POLICY practice_update_admin
  ON public.practice FOR UPDATE
  TO authenticated
  USING (id = app_private.current_practice_id() AND app_private.is_practice_admin())
  WITH CHECK (id = app_private.current_practice_id());

-- No INSERT or DELETE policy → denied by default for authenticated users.
-- New practices are created via service-role (signup edge function later).
-- Hard delete is forbidden; use status='OFFBOARDED' + deleted_at instead.

-- ============================================================================
-- RLS — practice_member
-- ============================================================================
ALTER TABLE public.practice_member ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_member_select_own_practice
  ON public.practice_member FOR SELECT
  TO authenticated
  USING (practice_id = app_private.current_practice_id());

-- Self-update of own profile fields. The role-protection trigger above
-- prevents a member from promoting themselves.
CREATE POLICY practice_member_self_update
  ON public.practice_member FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owners/admins can update any member in their own practice.
CREATE POLICY practice_member_admin_update
  ON public.practice_member FOR UPDATE
  TO authenticated
  USING (practice_id = app_private.current_practice_id() AND app_private.is_practice_admin())
  WITH CHECK (practice_id = app_private.current_practice_id());

-- Owners/admins can invite (insert) new members into their practice.
CREATE POLICY practice_member_admin_insert
  ON public.practice_member FOR INSERT
  TO authenticated
  WITH CHECK (practice_id = app_private.current_practice_id() AND app_private.is_practice_admin());

-- No DELETE policy → use is_active=false / deleted_at instead.

-- 0049_practice_document.sql
--
-- Phase 3 of the Documents area: per-practice assignment of admin-team
-- documents into the booking app, with viewed + acknowledged tracking.
--
-- Architecture note: admin_document lives in the tenant-registry project
-- (operator data); this table lives in dentaloptima-core (tenant data).
-- We DENORMALISE the assigned doc's content here — title + body +
-- source_version_id are frozen at assignment time. The booking app reads
-- only this table; it never queries tenant-registry. Re-publishing the
-- source doc does NOT auto-update the practice's copy — the operator
-- must explicitly re-assign to push a new version (preserves the "what
-- the practice has actually seen" trail).
--
-- source_document_id / source_version_id are bare UUIDs (no FK) because
-- the target lives in a different Supabase project.
--
-- Insert/delete is operator-only (admin app uses the service-role key,
-- which bypasses RLS). Practice members can update only the two tracking
-- columns (viewed_at, acknowledged_at + acknowledged_by_member_id) — RLS
-- restricts the rows, column-level GRANT restricts the columns.

CREATE TABLE public.practice_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,

  -- Origin tracking — links back to admin_document in tenant-registry.
  -- Plain UUIDs, no FK across project boundaries.
  source_document_id uuid NOT NULL,
  source_version_id uuid,

  -- Frozen content. Set on insert, not modified after.
  title text NOT NULL,
  body_markdown text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CLIENT_FACING', 'INTERNAL')),

  -- Audit (assigning operator)
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_admin_email text,

  -- Tracking — practice members write these.
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by_member_id uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,

  -- Lifecycle
  archived_at timestamptz
);

COMMENT ON TABLE public.practice_document IS
  'Admin-team documents pushed to a specific practice. Content frozen at assignment time. Tracks viewed_at + acknowledged_at on behalf of the whole practice.';

-- RLS-pruning index. Always lead with practice_id.
CREATE INDEX idx_practice_document_practice_active
  ON public.practice_document (practice_id, assigned_at DESC)
  WHERE archived_at IS NULL;

-- Used by the admin app to find "which practices have this doc assigned?"
CREATE INDEX idx_practice_document_source
  ON public.practice_document (source_document_id);

-- Used by the unread/unacknowledged badge query on the sidebar.
CREATE INDEX idx_practice_document_unack
  ON public.practice_document (practice_id)
  WHERE archived_at IS NULL AND acknowledged_at IS NULL;

ALTER TABLE public.practice_document ENABLE ROW LEVEL SECURITY;

-- All practice members can read their practice's docs.
CREATE POLICY practice_document_select
  ON public.practice_document FOR SELECT
  USING (practice_id = (SELECT app_private.current_practice_id()));

-- Members can update tracking columns (column-level GRANT below clamps
-- which columns are writable). Insert/delete are deliberately not
-- policied — the admin app uses the service-role key.
CREATE POLICY practice_document_update_tracking
  ON public.practice_document FOR UPDATE
  USING (practice_id = (SELECT app_private.current_practice_id()))
  WITH CHECK (practice_id = (SELECT app_private.current_practice_id()));

-- Column-level UPDATE: members can only set the tracking columns; the
-- content (title/body/kind) is frozen at assignment.
REVOKE UPDATE ON public.practice_document FROM authenticated;
GRANT UPDATE (viewed_at, acknowledged_at, acknowledged_by_member_id)
  ON public.practice_document TO authenticated;

-- Audit log — kind = 'practice_document' so it's filterable.
CREATE TRIGGER trg_practice_document_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.practice_document
  FOR EACH ROW
  EXECUTE FUNCTION app_private.fn_audit_log();

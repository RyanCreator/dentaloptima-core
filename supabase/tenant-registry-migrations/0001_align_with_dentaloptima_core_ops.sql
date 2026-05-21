-- ============================================================================
-- 0001_align_with_dentaloptima_core_ops.sql
--
-- Applied to: tenant-registry (project ref hbsuhalvececxvusrqlh)
--
-- Brings tenant-registry's public schema up to spec with the improvements
-- that had been built in dentaloptima-core's `ops` schema by mistake.
-- After this, tenant-registry is the single source of truth for all
-- operator/internal data and dentaloptima-core's ops schema can be dropped.
--
-- Changes:
--   * platform_announcement: + deleted_at (soft-delete), + created_by_email
--     (audit snapshot that survives account deletion)
--   * support_thread: + claimed_by_email, + claimed_at; relax tenant_id NOT NULL
--   * email_thread: + claimed_by_email, + claimed_at
--   * email_account: relax postmark_signature_id NOT NULL
--   * payment_event: relax tenant_id NOT NULL
--
-- All additive. No data migrated or dropped.
-- ============================================================================

-- ── platform_announcement ─────────────────────────────────────────────────

ALTER TABLE public.platform_announcement
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_email text;

COMMENT ON COLUMN public.platform_announcement.deleted_at IS
  'Soft-delete timestamp. NULL = visible. Preserves audit trail of platform-wide broadcasts.';

COMMENT ON COLUMN public.platform_announcement.created_by_email IS
  'Operator email at insert time. Survives later email changes / account deletion.';

CREATE INDEX IF NOT EXISTS idx_platform_announcement_visible
  ON public.platform_announcement (active, starts_at DESC)
  WHERE deleted_at IS NULL;

-- ── support_thread ────────────────────────────────────────────────────────

ALTER TABLE public.support_thread
  ADD COLUMN IF NOT EXISTS claimed_by_email text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN public.support_thread.claimed_by_email IS
  'Operator who is actively handling this thread. NULL = unclaimed.';

COMMENT ON COLUMN public.support_thread.claimed_at IS
  'When the current claim was set. Used to surface stale claims.';

ALTER TABLE public.support_thread
  ALTER COLUMN tenant_id DROP NOT NULL;

-- ── email_thread ──────────────────────────────────────────────────────────

ALTER TABLE public.email_thread
  ADD COLUMN IF NOT EXISTS claimed_by_email text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN public.email_thread.claimed_by_email IS
  'Operator who is actively handling this email thread. NULL = unclaimed. Newer signal than assigned_to_admin_id; the latter stays for backward compatibility.';

COMMENT ON COLUMN public.email_thread.claimed_at IS
  'When the current claim was set.';

-- ── email_account ─────────────────────────────────────────────────────────

ALTER TABLE public.email_account
  ALTER COLUMN postmark_signature_id DROP NOT NULL;

-- ── payment_event ─────────────────────────────────────────────────────────

ALTER TABLE public.payment_event
  ALTER COLUMN tenant_id DROP NOT NULL;

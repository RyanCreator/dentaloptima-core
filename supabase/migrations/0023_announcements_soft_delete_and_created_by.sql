-- 0023_announcements_soft_delete_and_created_by.sql
--
-- Two improvements to ops.platform_announcement:
--
-- 1. SOFT DELETE — operators currently hard-delete platform announcements
--    via the admin UI's trash button. That destroys the audit trail of
--    "who broadcast that message and when?". Add a `deleted_at` column,
--    flip the admin UI to soft-delete, and filter deleted rows out of
--    default queries.
--
-- 2. CREATED_BY — track which operator posted each announcement. Stored
--    as the operator's email at insert time (snapshot — survives later
--    email changes / account deletions, which is what an audit log wants).
--    Populated by a BEFORE INSERT trigger that reads auth.uid() →
--    auth.users.email, so application code never has to plumb the value
--    through.

ALTER TABLE ops.platform_announcement
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_email text;

-- Index supporting the "show non-deleted" default query path.
CREATE INDEX platform_announcement_active_idx
  ON ops.platform_announcement (created_at DESC)
  WHERE deleted_at IS NULL;

-- Trigger fn: snapshot creator email at insert time.
CREATE OR REPLACE FUNCTION ops.fn_set_announcement_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.created_by_email IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.created_by_email := (SELECT email FROM auth.users WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_announcement_set_created_by
  BEFORE INSERT ON ops.platform_announcement
  FOR EACH ROW
  EXECUTE FUNCTION ops.fn_set_announcement_created_by();

COMMENT ON COLUMN ops.platform_announcement.deleted_at IS
  'Soft-delete timestamp. NULL = visible. Set by the admin UI; never hard-deleted to preserve audit trail of platform-wide broadcasts.';
COMMENT ON COLUMN ops.platform_announcement.created_by_email IS
  'Snapshot of the operator''s email at insert time. Survives later email changes or account deletions, which is what an audit field wants.';

-- 0026_email_thread_claimed_by.sql
--
-- Operator-assignment for the email inbox. Same shape as ops.support_thread
-- (see migration 0024) — when multiple operators are working the inbox,
-- claiming signals "I'm replying to this — don't double-up". Optional;
-- unclaimed threads are fair game for anyone.

ALTER TABLE ops.email_thread
  ADD COLUMN claimed_by_email text,
  ADD COLUMN claimed_at timestamptz;

CREATE INDEX email_thread_claimed_idx
  ON ops.email_thread (claimed_by_email, claimed_at DESC)
  WHERE claimed_by_email IS NOT NULL;

COMMENT ON COLUMN ops.email_thread.claimed_by_email IS
  'Operator who is actively handling this thread. NULL = unclaimed (anyone can pick it up). Set/cleared by the admin UI''s claim/unclaim button.';
COMMENT ON COLUMN ops.email_thread.claimed_at IS
  'When the current claim was set. Use to surface stale claims later.';

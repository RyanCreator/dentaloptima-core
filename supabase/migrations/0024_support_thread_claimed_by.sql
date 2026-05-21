-- 0024_support_thread_claimed_by.sql
--
-- Operator-assignment support. When multiple operators are working the
-- inbox, claiming a thread signals "I'm replying to this — don't double-up".
-- Optional per-thread; unclaimed threads are fair game for anyone.
--
-- Stored as the operator's email at claim time (same audit-snapshot pattern
-- as ops.platform_announcement.created_by_email — see migration 0023).

ALTER TABLE ops.support_thread
  ADD COLUMN claimed_by_email text,
  ADD COLUMN claimed_at timestamptz;

-- Partial index for the "show me what I claimed" view path the admin UI
-- might add later. Cheap when no threads are claimed (almost always the
-- case in steady state).
CREATE INDEX support_thread_claimed_idx
  ON ops.support_thread (claimed_by_email, claimed_at DESC)
  WHERE claimed_by_email IS NOT NULL;

COMMENT ON COLUMN ops.support_thread.claimed_by_email IS
  'Operator who is actively handling this thread. NULL = unclaimed (anyone can pick it up). Set/cleared by the admin UI''s claim/unclaim button.';
COMMENT ON COLUMN ops.support_thread.claimed_at IS
  'When the current claim was set. Use to surface stale claims (e.g. someone claimed a thread two weeks ago and forgot).';

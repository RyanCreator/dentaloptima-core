-- 0057_meeting_mode.sql
-- Meeting Mode: record practice meetings (team huddles, governance, training)
-- as a text transcript with trackable follow-up actions. CQC-aligned —
-- documented meetings + tracked actions are an inspection staple.
--
-- v1 is deliberately lean. Transcription happens entirely client-side via the
-- browser's built-in speech recognition (Web Speech API): no audio is stored,
-- nothing is sent to a third-party processor, and there is no AI summarisation.
-- A meeting is therefore just a title + an editable text transcript, plus
-- optional manually-added action items. The schema intentionally leaves room to
-- add audio retention / AI minutes later without a breaking change (e.g. add
-- audio_path / summary columns).

CREATE TABLE meeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice(id) ON DELETE RESTRICT,
  title text NOT NULL,
  -- Category, constrained so reporting stays clean. CLINICAL = clinical
  -- governance meeting (not a patient's clinical notes).
  meeting_type text NOT NULL DEFAULT 'TEAM'
    CHECK (meeting_type IN ('TEAM', 'GOVERNANCE', 'CLINICAL', 'TRAINING', 'OTHER')),
  -- DRAFT while being recorded / edited; FINAL locks it as the minuted record.
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'FINAL')),
  -- When the meeting actually took place (defaults to creation time).
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Wall-clock length of the recording in seconds (0 when typed by hand).
  duration_seconds integer NOT NULL DEFAULT 0,
  -- The transcript. Built live from browser speech recognition, freely editable
  -- afterwards (recognition is never perfect).
  transcript text NOT NULL DEFAULT '',
  -- Who attended. JSONB array of { member_id?: uuid, name: text } so we capture
  -- both linked staff and ad-hoc attendees (locums, externals).
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Audit + soft delete
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz NULL
);

-- RLS pruning index (leads with practice_id) + default newest-first ordering.
CREATE INDEX idx_meeting_practice
  ON meeting (practice_id, occurred_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_meeting_audit
  BEFORE INSERT OR UPDATE ON meeting
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

ALTER TABLE meeting ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_tenant_select ON meeting
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY meeting_tenant_insert ON meeting
  FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY meeting_tenant_update ON meeting
  FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- Trackable follow-up actions from a meeting. Manually added in v1 (no AI
-- extraction). Open items with due dates can later drive a governance
-- "overdue actions" surface.
CREATE TABLE meeting_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice(id) ON DELETE RESTRICT,
  meeting_id uuid NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  description text NOT NULL,
  -- Assignee: a linked staff member where known, else a free-text name.
  owner_member_id uuid REFERENCES practice_member(id) ON DELETE SET NULL,
  owner_name text,
  due_date date,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'DONE', 'CANCELLED')),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz NULL
);

CREATE INDEX idx_meeting_action_meeting
  ON meeting_action (practice_id, meeting_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meeting_action_open_due
  ON meeting_action (practice_id, due_date)
  WHERE status = 'OPEN' AND deleted_at IS NULL;

CREATE TRIGGER trg_meeting_action_audit
  BEFORE INSERT OR UPDATE ON meeting_action
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

ALTER TABLE meeting_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_action_tenant_select ON meeting_action
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY meeting_action_tenant_insert ON meeting_action
  FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY meeting_action_tenant_update ON meeting_action
  FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY meeting_action_tenant_delete ON meeting_action
  FOR DELETE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

-- Append-only audit logging (CQC: who created / amended the minuted record and
-- its actions). Generic fn_audit_log writes to the `audit` table for these
-- non-clinical entities.
CREATE TRIGGER trg_meeting_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON meeting
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_audit_log();
CREATE TRIGGER trg_meeting_action_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON meeting_action
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_audit_log();

COMMENT ON TABLE meeting IS
  'Practice meeting records (team/governance/training). v1 stores a client-transcribed text transcript only — no audio, no AI. Soft-deleted via deleted_at.';
COMMENT ON TABLE meeting_action IS
  'Follow-up action items from a meeting, with optional owner + due date. Manually added in v1.';

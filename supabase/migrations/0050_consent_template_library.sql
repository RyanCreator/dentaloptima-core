-- Consent template library: practice-managed reusable consent texts,
-- mapped to the services that require them. Replaces ad-hoc
-- consent_record creation with a single source of truth so reception
-- doesn't retype the same x-ray consent every visit.
--
-- Why versions are first-class:
--   The CQC inspector needs to see exactly what the patient signed in
--   2024 even if the template has been amended since. We never overwrite
--   a body in place — bumping a version produces a new active row and
--   the previous version is preserved (with is_active = false) so old
--   consent_record rows can still resolve back to the exact text snapshot.
--
-- Why we still snapshot consent_text on the record:
--   Belt-and-braces. If the template gets deleted or the FK breaks, the
--   record still proves what the patient saw at signing time.

CREATE TABLE consent_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice(id) ON DELETE RESTRICT,
  -- Stable identifier for grouping versions ("EXTRACTION_CONSENT").
  -- The same code can exist across versions; we look up the active row
  -- for the practice + code when computing pending consents.
  code text NOT NULL,
  title text NOT NULL,
  -- Markdown body. Renders to text in the kiosk and to PDF in the
  -- audit log when a signed copy is exported for the patient.
  body text NOT NULL,
  version text NOT NULL DEFAULT 'v1',
  -- Only one active version per (practice, code) — enforced via the
  -- partial unique index below. Bumping a version flips the old row to
  -- false and inserts a new active one.
  is_active boolean NOT NULL DEFAULT true,
  -- Pointer to the previous version this row replaces. Lets the UI
  -- show "v3 (supersedes v2)" without reconstructing the chain.
  supersedes_id uuid REFERENCES consent_template(id) ON DELETE SET NULL,
  -- Audit + soft delete
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz NULL
);

-- One active row per (practice, code).
CREATE UNIQUE INDEX uq_consent_template_active_code
  ON consent_template (practice_id, code)
  WHERE is_active AND deleted_at IS NULL;

-- RLS pruning index (per the schema rules — every tenant index leads
-- with practice_id).
CREATE INDEX idx_consent_template_practice
  ON consent_template (practice_id) WHERE deleted_at IS NULL;

-- audit columns trigger
CREATE TRIGGER trg_consent_template_audit
  BEFORE INSERT OR UPDATE ON consent_template
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

ALTER TABLE consent_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_template_tenant_select ON consent_template
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY consent_template_tenant_insert ON consent_template
  FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY consent_template_tenant_update ON consent_template
  FOR UPDATE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- M:N service ↔ required template. When the appointment includes a
-- service that's in this table, the matching active template's
-- consent must be signed before treatment proceeds. Practice manages
-- the mapping in the template editor.

CREATE TABLE consent_template_service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES consent_template(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES practice_member(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_consent_template_service
  ON consent_template_service (template_id, service_id);
CREATE INDEX idx_consent_template_service_practice
  ON consent_template_service (practice_id);
CREATE INDEX idx_consent_template_service_service
  ON consent_template_service (practice_id, service_id);

ALTER TABLE consent_template_service ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_template_service_tenant_select ON consent_template_service
  FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY consent_template_service_tenant_insert ON consent_template_service
  FOR INSERT TO authenticated
  WITH CHECK (practice_id = (select app_private.current_practice_id()));
CREATE POLICY consent_template_service_tenant_delete ON consent_template_service
  FOR DELETE TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));

-- Extend consent_record so a signed row can trace back to the template
-- it came from. template_id is nullable: free-form / legacy consents
-- (created before the library existed, or one-offs) keep working
-- without a template link. The version is snapshotted on the record so
-- a later template re-version doesn't rewrite history.

ALTER TABLE consent_record
  ADD COLUMN template_id uuid NULL REFERENCES consent_template(id) ON DELETE SET NULL,
  ADD COLUMN template_version text NULL;

CREATE INDEX idx_consent_record_template
  ON consent_record (practice_id, template_id)
  WHERE template_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN consent_record.template_id IS
  'Points to the consent_template version the patient actually signed. Nullable for legacy / free-form consents created before the template library or for one-off bespoke text.';
COMMENT ON COLUMN consent_record.template_version IS
  'Snapshot of the template version at signing time. Preserved even if the template is later re-versioned, so historical records always read against the right wording.';

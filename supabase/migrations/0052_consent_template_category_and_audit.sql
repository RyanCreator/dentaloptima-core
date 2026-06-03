-- Three small additions to make the consent system audit-tight and
-- organisable as the library grows:
--
-- 1. consent_template.category — colour-coded grouping in the editor
--    list so a practice with 30+ templates can scan by category.
-- 2. consent_record.appointment_id — traces which appointment a
--    signature was attached to, so CQC inspectors can answer "which
--    visit was this consent for" without a fuzzy join through dates.
-- 3. Partial unique index on pending consent_record rows — prevents
--    two concurrent kiosk handoffs from creating duplicate pending
--    rows for the same patient/template pair.

-- 1. category --------------------------------------------------------------
ALTER TABLE consent_template
  ADD COLUMN category text NOT NULL DEFAULT 'OTHER';

COMMENT ON COLUMN consent_template.category IS
  'Grouping for the template-library UI (CLINICAL_ROUTINE, SURGICAL, RESTORATIVE, COSMETIC, ORTHODONTIC, PAEDIATRIC, REGULATORY, OTHER). Free text rather than enum so practices can add their own without a migration.';

-- 2. consent_record.appointment_id -----------------------------------------
ALTER TABLE consent_record
  ADD COLUMN appointment_id uuid NULL REFERENCES appointment(id) ON DELETE SET NULL;

CREATE INDEX idx_consent_record_appointment
  ON consent_record (practice_id, appointment_id)
  WHERE appointment_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN consent_record.appointment_id IS
  'The appointment that triggered this consent. Set by the kiosk handoff when reception clicks "Sign on kiosk" from a specific appointment. Lets the audit log answer "what visit was this consent for" cleanly.';

-- 3. dedupe pending rows ---------------------------------------------------
-- A pending consent_record (no document_id yet) for a given
-- (patient, template) pair should be unique — two concurrent reception
-- clicks shouldn't queue two rows the patient then signs twice. Once
-- signed (document_id IS NOT NULL), historical rows can coexist because
-- they're tied to different visits / templates over time.
CREATE UNIQUE INDEX uq_consent_record_pending_per_template
  ON consent_record (patient_id, template_id)
  WHERE document_id IS NULL
    AND template_id IS NOT NULL
    AND deleted_at IS NULL;

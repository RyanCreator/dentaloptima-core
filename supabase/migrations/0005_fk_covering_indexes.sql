-- ============================================================================
-- 0005_fk_covering_indexes.sql
-- Cover the FK columns we will actually query by. Existing composite
-- indexes lead with practice_id (best for RLS-bound list queries), but
-- Postgres can't use them for a single-column FK constraint check on
-- patient_id alone. Adding plain single-column indexes for those.
--
-- Deliberately NOT indexing: created_by, updated_by, revoked_by,
-- witnessed_by, uploaded_by, document_id. These are audit/rare-lookup
-- columns; the write penalty of indexing them outweighs the rare benefit.
-- The advisor will keep flagging them as INFO; that is accepted by design.
-- ============================================================================

CREATE INDEX idx_mhe_patient
  ON public.medical_history_entry (patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_alert_patient
  ON public.medical_alert (patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_document_patient
  ON public.document (patient_id)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_consent_patient
  ON public.consent_record (patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_note_patient_only
  ON public.note (patient_id)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_patient_preferred_dentist
  ON public.patient (preferred_dentist_id)
  WHERE preferred_dentist_id IS NOT NULL AND deleted_at IS NULL;

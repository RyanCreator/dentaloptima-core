-- ============================================================================
-- 0016_drop_audit_fks.sql
-- 0015 wasn't enough: SET NULL only fires when the referenced row is
-- deleted FIRST. Our audit trigger fires AFTER DELETE on the source row,
-- then tries to INSERT a reference back to the row that's already gone —
-- the FK still rejects the INSERT.
--
-- Right answer: drop the FK constraints entirely on audit + clinical_audit.
-- Audit logs are append-only snapshots of historical activity. They must
-- outlive the entities they reference, and they capture entity_id /
-- patient_id / practice_id / performed_by_id as raw UUID snapshots —
-- meaningful even when the underlying row is gone.
-- ============================================================================

ALTER TABLE public.audit DROP CONSTRAINT IF EXISTS audit_practice_id_fkey;
ALTER TABLE public.audit DROP CONSTRAINT IF EXISTS audit_performed_by_id_fkey;

ALTER TABLE public.clinical_audit DROP CONSTRAINT IF EXISTS clinical_audit_practice_id_fkey;
ALTER TABLE public.clinical_audit DROP CONSTRAINT IF EXISTS clinical_audit_patient_id_fkey;
ALTER TABLE public.clinical_audit DROP CONSTRAINT IF EXISTS clinical_audit_performed_by_id_fkey;

-- Existing indexes on these columns stay — useful for queries like
-- "show me everything that ever happened to patient X" even after
-- the patient row is gone.

COMMENT ON TABLE public.audit IS
  'Generic audit log. Append-only. No FKs to source entities — audit rows are historical snapshots that outlive the entities they describe.';

COMMENT ON TABLE public.clinical_audit IS
  'Clinical record changes. Append-only. No FKs to source entities — historical snapshots that outlive deletions for CQC retrieval.';

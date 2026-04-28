-- ============================================================================
-- 0015_audit_fk_set_null.sql
-- Bug fix: audit + clinical_audit had RESTRICT FKs to practice / patient /
-- practice_member. That prevented deleting any of those entities even
-- through legitimate cascade flows — and worse, the audit-trigger INSERT
-- itself failed mid-DELETE because the FK to the row being deleted couldn't
-- be satisfied.
--
-- Audit logs must OUTLIVE what they reference. Convert all audit FKs to
-- ON DELETE SET NULL so the audit row survives deletion of the referenced
-- entity (the captured UUID + snapshot jsonb retain the historical truth).
-- ============================================================================

-- audit
ALTER TABLE public.audit DROP CONSTRAINT IF EXISTS audit_practice_id_fkey;
ALTER TABLE public.audit
  ADD CONSTRAINT audit_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practice(id) ON DELETE SET NULL;

-- audit.performed_by_id was already SET NULL from 0012 — no change needed

-- clinical_audit
ALTER TABLE public.clinical_audit DROP CONSTRAINT IF EXISTS clinical_audit_practice_id_fkey;
ALTER TABLE public.clinical_audit
  ADD CONSTRAINT clinical_audit_practice_id_fkey
  FOREIGN KEY (practice_id) REFERENCES public.practice(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_audit DROP CONSTRAINT IF EXISTS clinical_audit_patient_id_fkey;
ALTER TABLE public.clinical_audit
  ADD CONSTRAINT clinical_audit_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patient(id) ON DELETE SET NULL;

-- clinical_audit.performed_by_id was already SET NULL from 0012 — no change needed

-- Make practice_id NULLable (was implicit NOT NULL before via the ON DELETE
-- RESTRICT — now it can become NULL after the referenced practice is gone).
ALTER TABLE public.clinical_audit ALTER COLUMN practice_id DROP NOT NULL;

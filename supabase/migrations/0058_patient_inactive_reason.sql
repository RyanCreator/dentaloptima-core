-- 0058_patient_inactive_reason.sql
-- Capture WHY a patient is inactive / deregistered. This is a lifecycle flag,
-- NOT deletion — the clinical record is still retained per the 11yr/age-25 rule
-- (that's deleted_at + legal_hold). registration_status already has
-- PROSPECT/REGISTERED/INACTIVE/DECEASED; this adds the reason + when/who so the
-- recall workflow can record "switched practice / moved away / declined" and
-- stop recalling people who've left.

ALTER TABLE public.patient
  -- Short code: MOVED_AWAY, SWITCHED_PRACTICE, DECLINED_CARE, LOST_CONTACT,
  -- DECEASED, OTHER. Free text (validated client-side) to stay flexible.
  ADD COLUMN status_reason text,
  ADD COLUMN status_note text,
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN status_changed_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patient.status_reason IS
  'Why the patient is INACTIVE/DECEASED (e.g. SWITCHED_PRACTICE, MOVED_AWAY, DECLINED_CARE, LOST_CONTACT, OTHER). Set when registration_status leaves REGISTERED; cleared on reactivation. Lifecycle flag only — never affects data retention.';
COMMENT ON COLUMN public.patient.status_note IS
  'Optional free-text detail for the status change (e.g. "moved to Leeds, asked to be removed from recalls").';
-- ============================================================================
-- 0029_appointment_nhs_exemption.sql
-- Capture NHS charge exemption on the appointment so reception can verify
-- it at check-in (before billing / claim time). The same fields exist on
-- billing_item and nhs_claim — those continue to be the source of truth at
-- billing and FP17 submission. The appointment-level columns are the
-- "what did the patient assert + what evidence did we see" record at the
-- visit, then flow into the claim when it's created.
--
-- Why duplicate the columns instead of joining? Because exemption status is
-- a property of the visit at a moment in time. A patient who arrived
-- pregnant in March may not be pregnant in November — the status is
-- captured per appointment, not per patient.
-- ============================================================================

ALTER TABLE public.appointment
  ADD COLUMN nhs_exemption_category public.nhs_exemption_category NOT NULL DEFAULT 'NONE',
  ADD COLUMN nhs_exemption_evidence_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointment.nhs_exemption_category IS
  'NHS charge exemption asserted by the patient at this visit. NONE = patient pays standard NHS charge. Copied to nhs_claim.exemption_category at claim submission.';

COMMENT ON COLUMN public.appointment.nhs_exemption_evidence_seen IS
  'Reception/dentist verified the supporting evidence (e.g. exemption certificate, MAT B1, benefit letter). NHSBSA spot-checks rely on this flag.';

-- Index for the common "show me unverified-evidence appointments this
-- month" report — practice can chase paperwork before claims go in.
CREATE INDEX idx_appointment_nhs_unverified_exemption
  ON public.appointment (practice_id, starts_at)
  WHERE nhs_exemption_category <> 'NONE'
    AND nhs_exemption_evidence_seen = false
    AND deleted_at IS NULL;

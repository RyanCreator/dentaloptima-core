-- ============================================================================
-- 0055_drop_nhs_claim_treatment.sql
-- Completes the clean cut started in 0053: the FP17 claim model is now the
-- 9000-code activity-line model (nhs_claim_activity). The booking app's claim
-- entry + detail sheets read/write activity lines exclusively, so the
-- deprecated fixed-column mirror is removed.
--
-- Also adds dedicated covering indexes on the nhs_claim_id foreign keys of the
-- new child tables (the composite practice-led indexes serve RLS-scoped reads,
-- but a lone-FK index keeps the ON DELETE RESTRICT integrity check fast and
-- clears the performance advisor INFO).
-- ============================================================================

DROP TABLE IF EXISTS public.nhs_claim_treatment;

CREATE INDEX IF NOT EXISTS idx_nhs_claim_activity_fk
  ON public.nhs_claim_activity (nhs_claim_id);

CREATE INDEX IF NOT EXISTS idx_nhs_claim_response_code_fk
  ON public.nhs_claim_response_code (nhs_claim_id);

-- ============================================================================
-- 0056_backfill_legacy_claim_band_activity.sql
-- Claims created before the 9000-code activity model (migrations 0053-0055)
-- have a `treatment_band` on the header but no nhs_claim_activity lines, so
-- their detail sheet shows "No activity recorded" while the header shows a
-- band. Reconstruct the band as a 9150 activity line from the surviving
-- `treatment_band` column so the model is consistent.
--
-- Idempotent (NOT EXISTS guard) — safe to re-run, and covers any future claims
-- migrated in from legacy systems. Only the band can be recovered; the granular
-- treatment detail lived in the dropped nhs_claim_treatment table, so these
-- remain (correctly) incomplete claims. Bands without a clean 9150 mapping
-- (PRESCRIPTION_ONLY / REPAIR_FREE / DENTURE_REPAIR) are left untouched.
-- ============================================================================

INSERT INTO public.nhs_claim_activity (practice_id, nhs_claim_id, code, value)
SELECT c.practice_id, c.id, '9150',
  CASE c.treatment_band
    WHEN 'BAND_1' THEN 1
    WHEN 'BAND_1_WITH_X_RAY' THEN 1
    WHEN 'BAND_2' THEN 2
    WHEN 'BAND_3' THEN 3
    WHEN 'URGENT' THEN 4
  END
FROM public.nhs_claim c
WHERE c.treatment_band IN ('BAND_1','BAND_1_WITH_X_RAY','BAND_2','BAND_3','URGENT')
  AND NOT EXISTS (
    SELECT 1 FROM public.nhs_claim_activity a WHERE a.nhs_claim_id = c.id
  );

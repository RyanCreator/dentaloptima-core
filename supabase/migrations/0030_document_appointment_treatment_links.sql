-- ============================================================================
-- 0030_document_appointment_treatment_links.sql
-- Add optional links from `document` to `appointment` and `treatment_plan_item`
-- so clinical imaging (X-rays, intra-oral photos) can be threaded back to
-- the visit they were taken at AND the planned treatment they support.
--
-- Why both, why optional?
--   * appointment_id captures provenance ("taken at this visit"). Useful
--     for IRMER audit trails and for surfacing imaging on the appointment
--     detail sheet.
--   * treatment_plan_item_id captures clinical justification ("the
--     periapical that justified RCT on 26"). Useful for the treatment plan
--     UI to show evidence per item.
--   * Both nullable because: (a) historical scans imported without a visit
--     have no appointment, (b) consent forms / referrals don't belong to a
--     plan item, and (c) we don't want a hard FK that blocks soft-deleting
--     an appointment.
--
-- ON DELETE SET NULL on both — losing the link is preferable to losing the
-- image. The image's clinical value persists past the appointment row.
-- ============================================================================

ALTER TABLE public.document
  ADD COLUMN appointment_id uuid REFERENCES public.appointment(id) ON DELETE SET NULL,
  ADD COLUMN treatment_plan_item_id uuid REFERENCES public.treatment_plan_item(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.document.appointment_id IS
  'Optional link to the visit the document was captured at. Null for historical imports or non-visit documents (consent forms, referrals).';

COMMENT ON COLUMN public.document.treatment_plan_item_id IS
  'Optional link to the planned treatment this document supports (e.g. radiograph that justified the procedure). Null for documents not tied to a plan item.';

-- Indexes lead with practice_id so RLS pruning is fast (per schema rule 2).
-- Partial on deleted_at IS NULL to keep the live-document index lean.

CREATE INDEX idx_document_practice_appointment
  ON public.document (practice_id, appointment_id)
  WHERE deleted_at IS NULL AND appointment_id IS NOT NULL;

CREATE INDEX idx_document_practice_plan_item
  ON public.document (practice_id, treatment_plan_item_id)
  WHERE deleted_at IS NULL AND treatment_plan_item_id IS NOT NULL;

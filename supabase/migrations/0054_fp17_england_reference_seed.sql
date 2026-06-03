-- ============================================================================
-- 0054_fp17_england_reference_seed.sql
-- Seed the ENGLAND reference data for FP17 validation:
--   * nhs_band_charge   - patient charge £ per band (April 2025 + April 2026)
--   * nhs_activity_code  - England 9000-code dictionary (code/value/band/dates)
--
-- Sources (extracted to docs/nhs/spec-text/, re-extracted with `pdftotext -raw`
-- which pairs the table cells correctly — the earlier -layout output mis-aligned
-- the band columns):
--   * Dental_Activity_9000_Codes_V5.1 (1 May 2026)
--   * CDS_Treatment_Bands_April_25 — AUTHORITATIVE for which CDS item belongs to
--     which band (drives comment codes 011-014). Where it disagrees with a
--     "BAND n ITEM" note in the 9000 doc, the CDS doc wins and we flag it.
--   * NHS England dental charges 1 April 2026 (SI 2026/265): Band 1 £27.90,
--     Band 2 £76.60, Band 3 £332.10 (Urgent charged at Band 1).
--
-- Scope: ENGLAND only. Country is on every row so Wales/IoM seed later without
-- rework. Long-standing codes use a 2006-04-01 baseline valid_from (well before
-- any real claim); codes with an explicit England start/end date use it.
--
-- ⚠️ ITEMS TO VERIFY before the validator's band-match check goes live
--    (see docs/nhs/fp17-gap-analysis.md §7 and the report):
--   1. 9303 Fissure Sealants — CDS doc says Band 1; 9000 doc says "BAND 2 ITEM".
--      Seeded as Band 1 (per the authoritative CDS doc) + flagged in notes.
--   2. "Best Practice Prevention (DBOH)" CDS item — no clean current England
--      9000 code found (9173 is Wales-only pre-2020). NOT seeded; needs the
--      official code.
--   3. April-2026 Urgent / Care-Pathway transition — 9150/4 (Urgent) is marked
--      "discontinued in England from 01/04/2026", and the new care-pathway codes
--      9191-9196 have "start date to be confirmed". Urgent is seeded with
--      valid_to 2026-03-31; the TBC pathway codes are NOT seeded yet.
-- Re-applying is safe to correct any of these (delete+reseed the reference rows).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Band charges (England)
-- ----------------------------------------------------------------------------
INSERT INTO public.nhs_band_charge (country, band, amount_pence, valid_from, valid_to) VALUES
  ('ENGLAND','1',     2740, '2025-04-01','2026-03-31'),
  ('ENGLAND','2',     7530, '2025-04-01','2026-03-31'),
  ('ENGLAND','3',    32670, '2025-04-01','2026-03-31'),
  ('ENGLAND','URGENT',2740, '2025-04-01','2026-03-31'),
  ('ENGLAND','1',     2790, '2026-04-01', NULL),
  ('ENGLAND','2',     7660, '2026-04-01', NULL),
  ('ENGLAND','3',    33210, '2026-04-01', NULL),
  ('ENGLAND','URGENT',2790, '2026-04-01', NULL);

-- ----------------------------------------------------------------------------
-- Activity codes (England). Columns:
--   code, value, country, label, cds_band, is_clinical_data_set, governs_uda,
--   valid_from, valid_to, notes
-- cds_band: '1'/'2'/'3'/'ANY' for Clinical Data Set items (band-match check);
--           NULL for non-CDS administrative/flag/demographic codes.
-- ----------------------------------------------------------------------------
INSERT INTO public.nhs_activity_code
  (code, value, country, label, cds_band, is_clinical_data_set, governs_uda, valid_from, valid_to, notes) VALUES
  -- === Banding (governs UDA + patient charge) =================================
  ('9150', 1, 'ENGLAND', 'Band 1', NULL, false, true, '2006-04-01', NULL, 'Requires >=1 CDS Band 1 item. Governs UDA + patient charge unless 9164/9319 present.'),
  ('9150', 2, 'ENGLAND', 'Band 2', NULL, false, true, '2006-04-01', NULL, 'Requires >=1 CDS Band 2 item. Governs UDA + patient charge unless 9164/9319 present.'),
  ('9150', 3, 'ENGLAND', 'Band 3', NULL, false, true, '2006-04-01', NULL, 'Requires >=1 CDS Band 3 item. Governs UDA + patient charge unless 9162/9164/9319 present.'),
  ('9150', 4, 'ENGLAND', 'Urgent Treatment', NULL, false, true, '2006-04-01', '2026-03-31', 'DISCONTINUED in England from 01/04/2026 — verify replacement urgent mechanism.'),

  -- === Charge / continuation modifiers =======================================
  ('9152', NULL, 'ENGLAND', 'Domiciliary Services', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9153', NULL, 'ENGLAND', 'Free Repair/Replacement', NULL, false, false, '2006-04-01', NULL, 'Claim must be Band 2/3/Urgent + include a repaired/replaced restoration CDS item (comment 014).'),
  ('9154', NULL, 'ENGLAND', 'Denture Repairs', NULL, false, false, '2006-04-01', NULL, 'Original treatment must exist on Compass.'),
  ('9155', NULL, 'ENGLAND', 'Arrest of Bleeding', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9156', NULL, 'ENGLAND', 'Removal of Sutures', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9157', NULL, 'ENGLAND', 'Bridge Repairs', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9158', NULL, 'ENGLAND', 'Prescription Only', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9160', NULL, 'ENGLAND', 'Charge Exempt Treatment Only', NULL, false, false, '2026-04-01', NULL, 'England/IoM from 01/04/2026.'),
  ('9162', NULL, 'ENGLAND', 'Regulation 11 Replacement Appliance', NULL, false, false, '2006-04-01', NULL, 'Reg 11 charge required even if exempt; Band 3 UDA awarded. Comment 013 if no relevant CDS item.'),
  ('9163', NULL, 'ENGLAND', 'Further Treatment Within 2 Months', NULL, false, false, '2006-04-01', NULL, 'Band 1/2/3 only; original treatment must exist on Compass.'),
  ('9164', 1, 'ENGLAND', 'Incomplete Treatment Band 1', NULL, false, false, '2006-04-01', NULL, 'Governs charge on incomplete CoT. Needs accompanying 9150 Band 1/2/3. Not with Urgent.'),
  ('9164', 2, 'ENGLAND', 'Incomplete Treatment Band 2', NULL, false, false, '2006-04-01', NULL, 'Needs accompanying 9150 Band 2/3. Not with Urgent.'),
  ('9164', 3, 'ENGLAND', 'Incomplete Treatment Band 3', NULL, false, false, '2006-04-01', NULL, 'Needs accompanying 9150 Band 3. Not with Urgent.'),
  ('9319', NULL, 'ENGLAND', 'Referral for Advanced Mandatory Services Band', NULL, false, false, '2006-04-01', NULL, 'Must accompany a 9150 band; its value governs the patient charge.'),

  -- === Mandatory English flags / data items ==================================
  ('9025', NULL, 'ENGLAND', 'Ethnic Origin', NULL, false, false, '2006-04-01', NULL, 'England/Wales.'),
  ('9172', NULL, 'ENGLAND', 'NICE Guidance Recall Interval', NULL, false, false, '2006-04-01', NULL, 'MANDATORY on all adult Band 1/2/3 claims.'),
  ('9175', NULL, 'ENGLAND', 'Patient Declined - Email Address', NULL, false, false, '2006-04-01', NULL, 'Mandatory on English FP17O if email absent.'),
  ('9176', NULL, 'ENGLAND', 'Patient Declined - Mobile Phone Number', NULL, false, false, '2006-04-01', NULL, 'Mandatory on English FP17O if mobile absent.'),
  ('9177', NULL, 'ENGLAND', 'Commissioner Approved', NULL, false, false, '2019-04-01', NULL, 'Mandatory on assessment claims if patient >=18 at Date of Referral.'),
  ('9181', 1, 'ENGLAND', 'Flexible Commissioning - Securing Access for Urgent Care', NULL, false, false, '2021-04-01', NULL, NULL),
  ('9181', 2, 'ENGLAND', 'Flexible Commissioning - Promoting Access to Routine Care', NULL, false, false, '2021-04-01', NULL, NULL),
  ('9181', 3, 'ENGLAND', 'Flexible Commissioning - Providing Care of High Needs Groups', NULL, false, false, '2021-04-01', NULL, NULL),
  ('9181', 4, 'ENGLAND', 'Flexible Commissioning - Starting Well', NULL, false, false, '2021-04-01', NULL, NULL),
  ('9181', 5, 'ENGLAND', 'Flexible Commissioning - Enhanced Health in Care Homes', NULL, false, false, '2021-04-01', NULL, NULL),
  ('9181', 6, 'ENGLAND', 'Flexible Commissioning - Collaboration in Local Care Networks', NULL, false, false, '2021-04-01', NULL, NULL),
  ('9190', NULL, 'ENGLAND', 'Unscheduled Care', NULL, false, false, '2026-04-01', NULL, 'England from 01/04/2026.'),

  -- === DCP (Dental Care Professional) attribution — needs DCP GDC number =====
  ('9178', 1, 'ENGLAND', 'DCP Type - Therapist', NULL, false, false, '2022-10-01', NULL, 'Requires DCP GDC number.'),
  ('9178', 2, 'ENGLAND', 'DCP Type - Hygienist', NULL, false, false, '2022-10-01', NULL, 'Requires DCP GDC number.'),
  ('9178', 3, 'ENGLAND', 'DCP Type - Dental Nurse', NULL, false, false, '2022-10-01', NULL, 'Requires DCP GDC number.'),
  ('9178', 4, 'ENGLAND', 'DCP Type - Clinical Technician', NULL, false, false, '2022-10-01', NULL, 'Requires DCP GDC number.'),
  ('9182', 1, 'ENGLAND', 'DCP Direct Access - Dental Therapist', NULL, false, false, '2022-10-01', NULL, NULL),
  ('9182', 2, 'ENGLAND', 'DCP Direct Access - Dental Hygienist', NULL, false, false, '2022-10-01', NULL, NULL),
  ('9182', 3, 'ENGLAND', 'DCP Direct Access - Dental Nurse', NULL, false, false, '2026-04-01', NULL, 'England only from 01/04/2026.'),
  ('9182', 4, 'ENGLAND', 'DCP Direct Access - Clinical Dental Technician', NULL, false, false, '2022-10-01', NULL, NULL),

  -- === Clinical Data Set items — Band 1 ======================================
  ('9317', NULL, 'ENGLAND', 'Examination', '1', true, false, '2006-04-01', NULL, NULL),
  ('9301', NULL, 'ENGLAND', 'Scale and Polish', '1', true, false, '2006-04-01', NULL, NULL),
  ('9302', NULL, 'ENGLAND', 'Fluoride Varnish', '1', true, false, '2006-04-01', NULL, NULL),
  ('9303', NULL, 'ENGLAND', 'Fissure Sealants', '1', true, false, '2006-04-01', NULL, 'BAND CONFLICT: CDS doc=Band 1, 9000 doc=BAND 2 ITEM. Seeded Band 1 (CDS authoritative) — VERIFY.'),
  ('9304', NULL, 'ENGLAND', 'Radiographs', '1', true, false, '2006-04-01', NULL, 'Used on FP17 and FP17O.'),
  ('9375', NULL, 'ENGLAND', 'Phased Treatment', '1', true, false, '2021-12-01', NULL, NULL),
  ('9383', NULL, 'ENGLAND', 'Crown Refix with Post/Core Retention', '1', true, false, '2006-04-01', NULL, NULL),
  ('9399', NULL, 'ENGLAND', 'Other Treatment', '1', true, false, '2006-04-01', NULL, 'Band 1 miscellaneous only; cannot of itself justify Band 2/3.'),

  -- === Clinical Data Set items — Band 2 ======================================
  ('9306', NULL, 'ENGLAND', 'Permanent Fillings', '2', true, false, '2006-04-01', NULL, 'Permanent teeth only.'),
  ('9307', NULL, 'ENGLAND', 'Extractions (General)', '2', true, false, '2006-04-01', NULL, NULL),
  ('9305', NULL, 'ENGLAND', 'Endodontic Treatment (legacy)', '2', true, false, '2006-04-01', '2022-09-30', 'DISCONTINUED in England 30/09/2022 — replaced by 9370/9371.'),
  ('9370', NULL, 'ENGLAND', 'Endodontics - Molar', '2', true, false, '2022-10-01', NULL, 'Generates Band 2(c) UDA.'),
  ('9371', NULL, 'ENGLAND', 'Endodontics - Non-molar', '2', true, false, '2022-10-01', NULL, 'Generates Band 2(b) UDA.'),
  ('9338', NULL, 'ENGLAND', 'Number of Pre-Formed Crowns', '2', true, false, '2021-12-01', NULL, NULL),
  ('9339', NULL, 'ENGLAND', 'Advanced Perio / Root Surface Debridement', '2', true, false, '2021-12-01', NULL, NULL),
  ('9380', NULL, 'ENGLAND', 'Soft Tissue Surgery', '2', true, false, '2006-04-01', NULL, NULL),
  ('9381', NULL, 'ENGLAND', 'Non-Laboratory Made Splint/Appliance', '2', true, false, '2006-04-01', NULL, NULL),
  ('9353', NULL, 'ENGLAND', 'Denture Additions/Reline/Rebase (legacy)', '2', true, false, '2021-12-01', '2026-03-31', 'DISCONTINUED 31/03/2026 — replaced by 9384/9385.'),
  ('9384', NULL, 'ENGLAND', 'Denture Relines/Rebase', '2', true, false, '2026-04-01', NULL, NULL),
  ('9385', NULL, 'ENGLAND', 'Denture Additions', '2', true, false, '2026-04-01', NULL, NULL),

  -- === Clinical Data Set items — Band 3 ======================================
  ('9308', NULL, 'ENGLAND', 'Crowns Provided', '3', true, false, '2006-04-01', NULL, NULL),
  ('9309', NULL, 'ENGLAND', 'Upper Denture - Acrylic', '3', true, false, '2006-04-01', NULL, NULL),
  ('9310', NULL, 'ENGLAND', 'Lower Denture - Acrylic', '3', true, false, '2006-04-01', NULL, NULL),
  ('9311', NULL, 'ENGLAND', 'Upper Denture - Metal', '3', true, false, '2006-04-01', NULL, NULL),
  ('9312', NULL, 'ENGLAND', 'Lower Denture - Metal', '3', true, false, '2006-04-01', NULL, NULL),
  ('9313', NULL, 'ENGLAND', 'Veneers Applied', '3', true, false, '2006-04-01', NULL, NULL),
  ('9314', NULL, 'ENGLAND', 'Inlays', '3', true, false, '2006-04-01', NULL, NULL),
  ('9315', NULL, 'ENGLAND', 'Bridges Fitted', '3', true, false, '2006-04-01', NULL, 'Minimum value of 2 (abutment + pontic).'),
  ('9382', NULL, 'ENGLAND', 'Laboratory Made Splint', '3', true, false, '2006-04-01', NULL, NULL),
  ('9376', NULL, 'ENGLAND', 'Custom Made Occlusal Appliance - Hard Bite', '3', true, false, '2021-12-01', NULL, NULL),
  ('9377', NULL, 'ENGLAND', 'Custom Made Occlusal Appliance - Soft Bite', '3', true, false, '2021-12-01', NULL, NULL),

  -- === Clinical Data Set items — Any band ====================================
  ('9318', NULL, 'ENGLAND', 'Antibiotic Items Prescribed', 'ANY', true, false, '2006-04-01', NULL, NULL),

  -- === Epidemiology / mandatory English adult data items (non-CDS) ===========
  ('9320', NULL, 'ENGLAND', 'Decayed Permanent Teeth', NULL, false, false, '2016-04-01', NULL, NULL),
  ('9321', NULL, 'ENGLAND', 'Missing Permanent Teeth', NULL, false, false, '2016-04-01', NULL, NULL),
  ('9322', NULL, 'ENGLAND', 'Filled Permanent Teeth', NULL, false, false, '2016-04-01', NULL, NULL),
  ('9323', NULL, 'ENGLAND', 'Decayed Deciduous Teeth', NULL, false, false, '2016-04-01', NULL, NULL),
  ('9324', NULL, 'ENGLAND', 'Missing Deciduous Teeth', NULL, false, false, '2016-04-01', NULL, NULL),
  ('9325', NULL, 'ENGLAND', 'Filled Deciduous Teeth', NULL, false, false, '2016-04-01', NULL, NULL),
  ('9378', NULL, 'ENGLAND', 'Highest BPE Sextant Score', NULL, false, false, '2022-10-01', NULL, 'MANDATORY on English adult Band 1/2/3 claims.'),
  ('9379', NULL, 'ENGLAND', 'Untreated Decayed Teeth', NULL, false, false, '2022-10-01', NULL, 'MANDATORY on English adult Band 1/2/3 claims.'),

  -- === Orthodontic data set (FP17O, England) =================================
  ('9012', NULL, 'ENGLAND', 'Orthodontic assessment and review', NULL, false, false, '2006-04-01', NULL, 'If patient >=18 at Date of Referral, 9177 required.'),
  ('9013', NULL, 'ENGLAND', 'Orthodontic assessment and refuse treatment', NULL, false, false, '2006-04-01', NULL, 'If patient >=18 at Date of Referral, 9177 required.'),
  ('9014', NULL, 'ENGLAND', 'Orthodontic assessment / appliance fitted', NULL, false, false, '2006-04-01', NULL, 'Needs 9415=1 (Treatment Proposed). If >=18 at Date of Referral, 9177 required.'),
  ('9015', NULL, 'ENGLAND', 'Index of Orthodontic Treatment Need (IOTN)', NULL, false, false, '2006-04-01', NULL, 'Required on all ortho assess/debond/complete/abandon/discontinue claims.'),
  ('9016', NULL, 'ENGLAND', 'Orthodontic Assessment and Debond - Overseas Patient', NULL, false, false, '2022-10-01', NULL, 'Patient must be exempt/remission + no prior NHS ortho.'),
  ('9161', 1, 'ENGLAND', 'Ortho Treatment Abandoned', NULL, false, false, '2006-04-01', NULL, 'Needs 9415=2 + one of 9409/9410.'),
  ('9161', 2, 'ENGLAND', 'Ortho Treatment Discontinued', NULL, false, false, '2006-04-01', NULL, 'Needs 9415=2.'),
  ('9161', 3, 'ENGLAND', 'Ortho Treatment Completed', NULL, false, false, '2006-04-01', NULL, 'Needs 9415=2.'),
  ('9165', NULL, 'ENGLAND', 'Aesthetic Component', NULL, false, false, '2006-04-01', NULL, 'Mandatory on Assess/Appliance-Fit; generally required if IOTN (9015)=3.'),
  ('9166', NULL, 'ENGLAND', 'Sedation Services', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9167', NULL, 'ENGLAND', 'Orthodontic Regulation 11 Replacement Appliance', NULL, false, false, '2006-04-01', NULL, 'Reg 11 charge required even if exempt; no UOA awarded.'),
  ('9401', NULL, 'ENGLAND', 'Removable Upper Appliance', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9402', NULL, 'ENGLAND', 'Removable Lower Appliance', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9403', NULL, 'ENGLAND', 'Functional Appliance', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9404', NULL, 'ENGLAND', 'Fixed Upper Appliance', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9405', NULL, 'ENGLAND', 'Fixed Lower Appliance', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9406', NULL, 'ENGLAND', 'Retainer Upper', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9407', NULL, 'ENGLAND', 'Retainer Lower', NULL, false, false, '2006-04-01', NULL, NULL),
  ('9408', NULL, 'ENGLAND', 'Extractions (Orthodontic)', NULL, false, false, '2006-04-01', NULL, 'Actual tooth notations required.'),
  ('9409', NULL, 'ENGLAND', 'Patient Failed to Return - Treatment Abandoned', NULL, false, false, '2006-04-01', NULL, 'Accompanies 9161 value 1.'),
  ('9410', NULL, 'ENGLAND', 'Patient Requested - Treatment Abandoned', NULL, false, false, '2006-04-01', NULL, 'Accompanies 9161 value 1.'),
  ('9412', NULL, 'ENGLAND', 'Photographs taken', NULL, false, false, '2006-04-01', NULL, 'England only.'),
  ('9413', NULL, 'ENGLAND', 'Pre-Treatment PAR Score', NULL, false, false, '2019-04-01', NULL, 'England only.'),
  ('9414', NULL, 'ENGLAND', 'Post-Treatment PAR Score', NULL, false, false, '2019-04-01', NULL, 'England only.'),
  ('9415', 1, 'ENGLAND', 'Treatment Proposed', NULL, false, false, '2006-04-01', NULL, 'Required on Assess/Appliance-Fitted claims.'),
  ('9415', 2, 'ENGLAND', 'Treatment Completed/Abandoned/Discontinued', NULL, false, false, '2006-04-01', NULL, 'Required on ortho complete/abandon/discontinue claims.'),
  ('9416', NULL, 'ENGLAND', 'Pre-Treatment PAR Score - Sample', NULL, false, false, '2006-04-01', NULL, 'Compass-generated.'),
  ('9417', NULL, 'ENGLAND', 'Post-Treatment PAR Score - Sample', NULL, false, false, '2006-04-01', NULL, 'Compass-generated.');

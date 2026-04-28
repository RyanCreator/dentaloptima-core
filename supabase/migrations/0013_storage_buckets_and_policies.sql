-- ============================================================================
-- 0013_storage_buckets_and_policies.sql
-- Supabase Storage bucket for patient files (x-rays, photos, consent PDFs,
-- ID documents, referral letters). Path-based RLS extracts practice_id
-- from the first folder of the object name and checks membership.
--
-- Path convention: {practice_id}/{patient_id}/{document_type}/{filename}
-- (the bucket prefix is implicit; storage.objects.name does not include it)
-- ============================================================================

-- Bucket: private, 50MB cap, image + PDF + DICOM only
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-files',
  'patient-files',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/tiff',
    'application/dicom',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- Storage RLS policies on storage.objects
-- Pattern: extract practice_id from the first folder of `name`, check that
-- the caller is a member of that practice.
--
-- For UPSERT to work, callers need INSERT + SELECT + UPDATE.
-- ============================================================================

-- SELECT — read files
CREATE POLICY "patient_files_select_own_practice"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND (
      (storage.foldername(name))[1]::uuid = (select app_private.current_practice_id())
    )
  );

-- INSERT — upload new files
CREATE POLICY "patient_files_insert_own_practice"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-files'
    AND (
      (storage.foldername(name))[1]::uuid = (select app_private.current_practice_id())
    )
  );

-- UPDATE — replace files (needed for upsert semantics)
CREATE POLICY "patient_files_update_own_practice"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND (
      (storage.foldername(name))[1]::uuid = (select app_private.current_practice_id())
    )
  )
  WITH CHECK (
    bucket_id = 'patient-files'
    AND (
      (storage.foldername(name))[1]::uuid = (select app_private.current_practice_id())
    )
  );

-- DELETE — admin-only. Hard deletion of clinical files needs justification;
-- non-admins can only soft-delete via the document table's deleted_at column.
CREATE POLICY "patient_files_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND (storage.foldername(name))[1]::uuid = (select app_private.current_practice_id())
    AND (select app_private.is_practice_admin())
  );

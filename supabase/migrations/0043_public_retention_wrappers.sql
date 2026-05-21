-- 0043_public_retention_wrappers.sql
--
-- Public RPCs the booking app calls for GDPR retention:
--   - is_patient_retention_eligible(uuid)  → boolean
--   - list_retention_eligible_patients()   → rows
--   - anonymise_patient(uuid)              → void  (admin-gated, irreversible)
--
-- The retention logic itself lives in `app_private.fn_patient_retention_eligible`.
-- PostgREST only sees the `public` schema, so we wrap the calls here.
--
-- `anonymise_patient` is the GDPR-safe action — it NULLs / redacts identifying
-- fields and soft-deletes the row, but leaves clinical_audit rows intact so a
-- CQC inspector can still see what happened (without ever resurfacing the
-- patient's identity). Full hard-delete is deferred until we wire it up
-- behind a separate, even-stricter gate.

CREATE OR REPLACE FUNCTION public.is_patient_retention_eligible(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  -- The inner function is SECURITY DEFINER and would otherwise leak across
  -- tenants. Gate by an RLS-respecting existence check before we return its
  -- result, so callers can only learn about patients in their own practice.
  SELECT COALESCE(
    (
      SELECT app_private.fn_patient_retention_eligible(p_patient_id)
      WHERE EXISTS (
        SELECT 1
        FROM public.patient
        WHERE id = p_patient_id
      )
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_patient_retention_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_patient_retention_eligible(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_patient_retention_eligible(uuid) IS
  'PostgREST wrapper around app_private.fn_patient_retention_eligible(). Returns false outside the caller''s practice.';


CREATE OR REPLACE FUNCTION public.list_retention_eligible_patients()
RETURNS TABLE (
  patient_id uuid,
  patient_number integer,
  full_name text,
  dob date,
  last_visited_at timestamptz,
  registration_status public.patient_registration_status
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT * FROM app_private.fn_list_retention_eligible_patients(
    (SELECT app_private.current_practice_id())
  );
$$;

REVOKE ALL ON FUNCTION public.list_retention_eligible_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_retention_eligible_patients() TO authenticated;

COMMENT ON FUNCTION public.list_retention_eligible_patients() IS
  'PostgREST wrapper — lists patients in the caller''s practice eligible for retention purge.';


-- ============================================================================
-- anonymise_patient
-- ============================================================================
-- Irreversibly clears PII from the patient row + soft-deletes it. We do NOT
-- delete linked clinical records (treatments, notes, audit) — those need to
-- stay queryable by patient_id for CQC, but they no longer point at an
-- identifiable person.
--
-- Defensive gating:
--   1. Caller must be OWNER or ADMIN of the patient's practice.
--   2. Patient must currently be eligible for retention purge (or under no
--      legal hold). We don't want admins clearing live records by mistake.
--
-- Runs as SECURITY DEFINER because we update fields the user can otherwise
-- only edit via admin-gated columns (legal_hold, etc.). The internal checks
-- enforce the same gating those RLS rules would.

CREATE OR REPLACE FUNCTION public.anonymise_patient(p_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_practice_id  uuid;
  v_member_id    uuid;
BEGIN
  -- 1. Resolve caller's practice + member row. RLS-free read because we're
  --    a SECURITY DEFINER function.
  v_member_id  := app_private.current_member_id();
  v_practice_id := app_private.current_practice_id();

  IF v_member_id IS NULL OR v_practice_id IS NULL THEN
    RAISE EXCEPTION 'anonymise_patient: no authenticated practice member';
  END IF;

  -- 2. Caller must be OWNER or ADMIN.
  IF NOT app_private.is_practice_admin() THEN
    RAISE EXCEPTION 'anonymise_patient: only OWNER or ADMIN can run this';
  END IF;

  -- 3. Patient must exist in caller's practice.
  IF NOT EXISTS (
    SELECT 1 FROM public.patient
    WHERE id = p_patient_id AND practice_id = v_practice_id
  ) THEN
    RAISE EXCEPTION 'anonymise_patient: patient not in caller''s practice';
  END IF;

  -- 4. Eligibility check — the practice can't anonymise an under-retention
  --    patient by accident. legal_hold is also blocked at the function level.
  IF NOT app_private.fn_patient_retention_eligible(p_patient_id) THEN
    RAISE EXCEPTION 'anonymise_patient: patient is not retention-eligible (still under retention period or legal_hold)';
  END IF;

  -- 5. Redact. Set personally-identifying fields to redaction markers; clear
  --    contact details + addresses entirely; mark the row deleted. Note:
  --    `full_name` is a GENERATED column from first/last, so we don't set it
  --    here — it'll resolve to "REDACTED REDACTED" automatically. `country`
  --    is NOT NULL DEFAULT 'GB' so we leave it as the default value.
  UPDATE public.patient
  SET
    first_name = 'REDACTED',
    last_name  = 'REDACTED',
    preferred_name = NULL,
    title = NULL,
    dob = NULL,
    gender = NULL,
    ethnicity = NULL,
    nhs_number = NULL,
    email = NULL,
    phone = NULL,
    phone_alt = NULL,
    address_line1 = NULL,
    address_line2 = NULL,
    city = NULL,
    postcode = NULL,
    country = 'GB',
    emergency_contact_name = NULL,
    emergency_contact_phone = NULL,
    emergency_contact_relation = NULL,
    gp_name = NULL,
    gp_practice_name = NULL,
    gp_practice_address = NULL,
    profile_photo_path = NULL,
    marketing_consent_email = false,
    marketing_consent_sms = false,
    marketing_consent_post = false,
    marketing_consent_recorded_at = NULL,
    communication_preferences = '{}'::jsonb,
    deleted_at = now(),
    updated_at = now(),
    updated_by = v_member_id
  WHERE id = p_patient_id;

  -- 6. Soft-clear directly-identifying child records that aren't audit:
  --      medical_alert.detail, medical_history_entry.notes, note.body,
  --      consent_record.guardian_name, document.title/description.
  --    These tables stay (clinical history per CQC), the freeform PII fields
  --    are redacted.
  UPDATE public.medical_alert
  SET detail = NULL, updated_at = now(), updated_by = v_member_id
  WHERE patient_id = p_patient_id;

  UPDATE public.medical_history_entry
  SET notes = NULL, updated_at = now(), updated_by = v_member_id
  WHERE patient_id = p_patient_id;

  UPDATE public.note
  SET body = '[REDACTED — retention purge]', updated_at = now(), updated_by = v_member_id
  WHERE patient_id = p_patient_id;

  UPDATE public.consent_record
  SET guardian_name = NULL, updated_at = now(), updated_by = v_member_id
  WHERE patient_id = p_patient_id;

  UPDATE public.document
  SET title = '[REDACTED]', description = NULL
  WHERE patient_id = p_patient_id;

  -- 7. Drop a marker into the generic audit so the action is visible on
  --    the audit-log viewer. Trigger-fired audit will also fire for each
  --    UPDATE above (it's installed on every clinical table).
  INSERT INTO public.audit (
    practice_id, performed_by_id, performed_by_email,
    action, entity_type, entity_id, context
  ) VALUES (
    v_practice_id, v_member_id, NULL,
    'UPDATE', 'patient', p_patient_id, 'GDPR retention anonymisation'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.anonymise_patient(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anonymise_patient(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.anonymise_patient(uuid) TO authenticated;

COMMENT ON FUNCTION public.anonymise_patient(uuid) IS
  'GDPR retention purge: redacts PII and soft-deletes the patient row. Audit rows survive. Owner/Admin only and only for retention-eligible patients.';

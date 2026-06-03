-- Hardens the consent + kiosk flow against two real risks reception
-- runs into in the wild:
--   1. Patient browses around once handed the kiosk device — staff auth
--      is on the session, so without a PIN gate they can walk straight
--      into the calendar / patient list.
--   2. A signed consent_record is just a row — anyone with the right
--      role could in principle UPDATE document_id or rewrite consent_text,
--      breaking the audit trail. CQC expects "signed = immutable".
--
-- Two unrelated changes bundled here because they ship together as
-- "consent security hardening" — both small, both targeting the same
-- review pass.

-- 1. Kiosk exit PIN ---------------------------------------------------------
-- Per-practice 4-6 digit PIN. NULL = no PIN required (back-compat with
-- existing tenants who haven't configured one yet). Stored plain text
-- because (a) it's a low-stakes physical-presence gate, not a credential,
-- and (b) bcrypt-comparing on every Exit-button tap is overkill. Practices
-- are expected to choose a PIN no-one outside reception/clinical staff
-- knows; rotate when staff leave.
ALTER TABLE practice_setting
  ADD COLUMN kiosk_exit_pin text NULL;

COMMENT ON COLUMN practice_setting.kiosk_exit_pin IS
  'Optional 4-6 digit PIN required to exit the kiosk consent flow. NULL means no PIN required (legacy behaviour). Treat as a low-stakes physical gate, not a high-security secret.';

-- 2. consent_record immutability -------------------------------------------
-- Once a consent_record carries a document_id (i.e. the signature has
-- been uploaded), the row is read-only except for the revocation columns
-- and audit/soft-delete columns. This is a defence-in-depth trigger —
-- the UI doesn't expose edits today, but a future change or a direct
-- SQL session can't accidentally rewrite the audit history.
--
-- Allowed mutations on a signed row:
--   - revoked_at, revoked_by, revoked_reason   (patient withdraws consent)
--   - deleted_at, updated_by, updated_at        (soft delete + audit columns)
-- Everything else (consent_text, template_id, document_id, signed-by,
-- granted_at, granted_method, etc.) is locked.

CREATE OR REPLACE FUNCTION app_private.fn_consent_record_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Skip the lock until the row has actually been signed. While the
  -- record is pending on the kiosk (document_id IS NULL), the kiosk
  -- needs to write document_id and granted_at as it stores the
  -- signature blob — that's the first UPDATE we allow through.
  IF OLD.document_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allowed columns: revocation + audit + soft delete.
  -- If anything else changed, reject.
  IF NEW.consent_type      IS DISTINCT FROM OLD.consent_type
  OR NEW.consent_version   IS DISTINCT FROM OLD.consent_version
  OR NEW.consent_text      IS DISTINCT FROM OLD.consent_text
  OR NEW.granted_at        IS DISTINCT FROM OLD.granted_at
  OR NEW.granted_method    IS DISTINCT FROM OLD.granted_method
  OR NEW.granted_by_patient IS DISTINCT FROM OLD.granted_by_patient
  OR NEW.guardian_name     IS DISTINCT FROM OLD.guardian_name
  OR NEW.guardian_relation IS DISTINCT FROM OLD.guardian_relation
  OR NEW.witnessed_by      IS DISTINCT FROM OLD.witnessed_by
  OR NEW.document_id       IS DISTINCT FROM OLD.document_id
  OR NEW.valid_until       IS DISTINCT FROM OLD.valid_until
  OR NEW.template_id       IS DISTINCT FROM OLD.template_id
  OR NEW.template_version  IS DISTINCT FROM OLD.template_version
  OR NEW.patient_id        IS DISTINCT FROM OLD.patient_id
  OR NEW.practice_id       IS DISTINCT FROM OLD.practice_id
  THEN
    RAISE EXCEPTION 'Signed consent records are immutable. Use the revoke columns to withdraw consent.'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consent_record_immutable
  BEFORE UPDATE ON consent_record
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_consent_record_immutable();

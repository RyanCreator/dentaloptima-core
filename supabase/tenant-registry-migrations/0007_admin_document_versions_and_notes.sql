-- 0007_admin_document_versions_and_notes.sql
--
-- Phase 2 of the Documents area:
--   1. admin_document_version — immutable snapshots, captured on every
--      Publish save. The change log.
--   2. admin_document_note — internal-only threaded comments on a doc.
--      Notes stay separate from the doc body so they don't leak when
--      a doc is shared or printed.
--   3. publish_admin_document RPC — atomic save + version snapshot so
--      we can't end up with a published doc that has no version row.
--   4. fn_admin_doc_set_author / fn_admin_doc_version_set_author — stamp
--      created_by / updated_by from the caller's admin_user id. Phase 1
--      left these NULL on inserts; this migration backfills the trigger
--      for admin_document too.

-- ── Author-stamping trigger functions ─────────────────────────────────

-- For tables with both created_by + updated_by (admin_document, admin_document_note).
CREATE OR REPLACE FUNCTION public.fn_admin_doc_set_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid;
BEGIN
  -- admin_user has its own RLS; SECURITY DEFINER lets the trigger read
  -- the lookup row regardless of policy on the caller's table.
  SELECT id INTO admin_id
    FROM public.admin_user
   WHERE user_id = (SELECT auth.uid())
   LIMIT 1;

  IF admin_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, admin_id);
    NEW.updated_by := COALESCE(NEW.updated_by, admin_id);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := admin_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_admin_doc_set_author() FROM anon, authenticated;

-- For immutable-snapshot tables (admin_document_version) — only sets created_by.
CREATE OR REPLACE FUNCTION public.fn_admin_doc_version_set_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id
    FROM public.admin_user
   WHERE user_id = (SELECT auth.uid())
   LIMIT 1;

  IF admin_id IS NOT NULL THEN
    NEW.created_by := COALESCE(NEW.created_by, admin_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_admin_doc_version_set_author() FROM anon, authenticated;

-- Backfill: attach the author trigger to admin_document (Phase 1 omitted it).
DROP TRIGGER IF EXISTS trg_admin_document_set_author ON public.admin_document;
CREATE TRIGGER trg_admin_document_set_author
  BEFORE INSERT OR UPDATE ON public.admin_document
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admin_doc_set_author();

-- ── admin_document_version ───────────────────────────────────────────

CREATE TABLE public.admin_document_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.admin_document(id) ON DELETE CASCADE,
  title text NOT NULL,
  body_markdown text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CLIENT_FACING', 'INTERNAL')),
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.admin_user(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.admin_document_version IS
  'Immutable snapshot taken on every Publish save of admin_document. The change log; revert is "copy old body into current".';

CREATE INDEX idx_admin_document_version_doc_created
  ON public.admin_document_version (document_id, created_at DESC);

ALTER TABLE public.admin_document_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_document_version_select_admins
  ON public.admin_document_version FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE POLICY admin_document_version_insert_admins
  ON public.admin_document_version FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

-- Deliberately no UPDATE or DELETE policy — versions are immutable.

CREATE TRIGGER trg_admin_document_version_set_author
  BEFORE INSERT ON public.admin_document_version
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admin_doc_version_set_author();

-- ── admin_document_note ──────────────────────────────────────────────

CREATE TABLE public.admin_document_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.admin_document(id) ON DELETE CASCADE,
  body_markdown text NOT NULL CHECK (length(trim(body_markdown)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.admin_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_user(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.admin_document_note IS
  'Internal-only threaded notes on an admin_document. Kept out of the doc body so notes never leak when a doc is shared or printed.';

CREATE INDEX idx_admin_document_note_doc_created
  ON public.admin_document_note (document_id, created_at DESC);

ALTER TABLE public.admin_document_note ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_document_note_select_admins
  ON public.admin_document_note FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE POLICY admin_document_note_insert_admins
  ON public.admin_document_note FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE POLICY admin_document_note_update_admins
  ON public.admin_document_note FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE POLICY admin_document_note_delete_admins
  ON public.admin_document_note FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE TRIGGER trg_admin_document_note_set_author
  BEFORE INSERT OR UPDATE ON public.admin_document_note
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admin_doc_set_author();

CREATE TRIGGER trg_admin_document_note_touch_updated_at
  BEFORE UPDATE ON public.admin_document_note
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admin_document_touch_updated_at();

-- ── publish_admin_document RPC ───────────────────────────────────────
--
-- Updates the doc row AND inserts a version snapshot in one transaction.
-- SECURITY INVOKER so the underlying RLS still applies — anon/random
-- callers can't sneak around the admins-only policies.

CREATE OR REPLACE FUNCTION public.publish_admin_document(
  p_id uuid,
  p_title text,
  p_body text,
  p_kind text,
  p_slug text,
  p_change_summary text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_document
     SET title = p_title,
         body_markdown = p_body,
         kind = p_kind,
         slug = p_slug,
         status = 'PUBLISHED'
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_document % not found', p_id USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.admin_document_version (
    document_id, title, body_markdown, kind, change_summary
  ) VALUES (
    p_id, p_title, p_body, p_kind, NULLIF(trim(coalesce(p_change_summary, '')), '')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_admin_document(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_admin_document(uuid, text, text, text, text, text) TO authenticated;

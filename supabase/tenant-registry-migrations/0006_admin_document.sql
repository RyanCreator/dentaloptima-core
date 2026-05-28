-- 0006_admin_document.sql
--
-- Admin document library for the Dentaloptima team. Holds the company's
-- own docs (SEO service breakdown, onboarding pack, internal SOPs, etc.)
-- as Markdown — the source of truth — with metadata for organising and
-- a slug for sharing.
--
-- Phase 1 (this migration) is intentionally minimal: just the doc table.
-- Phase 2 will add `admin_document_version` (publish snapshots / change
-- log) and `admin_document_note` (internal-only threaded comments).
-- Phase 3 will add `admin_document_assignment` (per-tenant assignment +
-- viewed_at / acknowledged_at tracking, same shape as policy_acknowledgement).
--
-- The `kind` enum-as-check separates client-facing deliverables from
-- internal SOPs so the list view can group them and we can later treat
-- them differently (e.g. only CLIENT_FACING docs can be assigned to
-- tenants).
--
-- `body_markdown` is the editable source. We don't cache the rendered
-- HTML in the DB — it's cheap to render in the browser via react-markdown,
-- and storing both creates a stale-cache problem.

CREATE TABLE public.admin_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  -- URL-safe identifier for direct-link sharing later. Unique so it can
  -- be used in the URL bar without disambiguating with the id.
  slug text UNIQUE,
  body_markdown text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'INTERNAL'
    CHECK (kind IN ('CLIENT_FACING', 'INTERNAL')),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.admin_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_user(id) ON DELETE SET NULL,
  archived_at timestamptz
);

COMMENT ON TABLE public.admin_document IS
  'Dentaloptima-team document library. Source of truth is Markdown; rendered to HTML/PDF in the browser. CLIENT_FACING docs can later be assigned to specific tenants; INTERNAL docs are operator-only.';

CREATE INDEX idx_admin_document_kind_status
  ON public.admin_document (kind, status)
  WHERE archived_at IS NULL;

-- Touch updated_at on every UPDATE so the list can order by recency
-- accurately, and the detail page can show "last edited 5 min ago".
CREATE OR REPLACE FUNCTION public.fn_admin_document_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_document_touch_updated_at
  BEFORE UPDATE ON public.admin_document
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admin_document_touch_updated_at();

-- RLS — admins only. Mirrors the pattern on outreach_template + other
-- admin tables: read/write requires the caller to have an active row in
-- admin_user.
ALTER TABLE public.admin_document ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_document_select_admins
  ON public.admin_document FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE POLICY admin_document_insert_admins
  ON public.admin_document FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE POLICY admin_document_update_admins
  ON public.admin_document FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

CREATE POLICY admin_document_delete_admins
  ON public.admin_document FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user
      WHERE user_id = (select auth.uid()) AND active = true
    )
  );

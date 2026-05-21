-- ============================================================================
-- 0003_list_announcements_for_practice.sql  (tenant-registry)
-- Anon-callable RPC the booking app uses to fetch the platform-announcement
-- banner for its tenant.
--
-- Why an RPC and not a direct table SELECT:
--   - The booking app authenticates against dentaloptima-core, not against
--     the registry. We don't have a cross-project JWT, so the practice
--     identity is asserted client-side via the (practice_id, status) args.
--   - The RPC body bakes in the audience filter (ALL / STATUS / TENANTS)
--     and the active+window predicates so the booking app just gets a
--     list of "things to show now" and can render directly.
--   - SECURITY DEFINER lets us keep platform_announcement RLS strict
--     (operators-only) while exposing a narrow read path for tenants.
--
-- Trust model: the args are advisory — anyone can ask "what would
-- TENANTS-targeted announcements look like for practice X?" Announcements
-- aren't secret (they're going to be shown as a banner anyway), so this
-- is acceptable. If we ever target genuinely sensitive content this way,
-- we'd need cross-project signed identity instead.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_announcements_for_practice(
  p_practice_id uuid,
  p_status text
)
RETURNS TABLE (
  id uuid,
  title text,
  body text,
  severity text,
  starts_at timestamptz,
  ends_at timestamptz,
  audience_kind text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    pa.id,
    pa.title,
    pa.body,
    pa.severity::text,
    pa.starts_at,
    pa.ends_at,
    pa.audience_kind::text
  FROM public.platform_announcement pa
  WHERE pa.deleted_at IS NULL
    AND pa.active = true
    AND pa.starts_at <= now()
    AND (pa.ends_at IS NULL OR pa.ends_at > now())
    AND (
      pa.audience_kind = 'ALL'::announcement_audience_kind
      OR (
        pa.audience_kind = 'STATUS'::announcement_audience_kind
        AND p_status = ANY(pa.audience_status)
      )
      OR (
        pa.audience_kind = 'TENANTS'::announcement_audience_kind
        AND p_practice_id = ANY(pa.audience_tenant_ids)
      )
    )
  -- Critical first, then warning, then info. Within a severity, newest first
  -- so a freshly-posted maintenance notice shows above older standing ones.
  ORDER BY
    CASE pa.severity
      WHEN 'critical' THEN 0
      WHEN 'warning'  THEN 1
      WHEN 'info'     THEN 2
      ELSE 3
    END,
    pa.starts_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_announcements_for_practice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_announcements_for_practice(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION public.list_announcements_for_practice(uuid, text) IS
  'Returns active platform announcements that target the given practice. anon-callable; the practice identity is asserted via args.';

-- 0027_practice_member_color_hex.sql
--
-- Add a per-staff calendar colour. The booking app uses this to tint the
-- left edge of an appointment block + a swatch next to the staff name in
-- multi-staff calendar views, so operators can spot at a glance which
-- staff member's column an appointment belongs to.
--
-- Legacy schema called this `colour_tag`; we standardise on `color_hex`
-- to match `service.color_hex` (which already exists on the new schema).
--
-- Stored as `#RRGGBB` (with hash) — the booking app applies it directly
-- to inline `style={{ backgroundColor }}` and `borderLeft`. NULL = use
-- the app default.

ALTER TABLE public.practice_member
  ADD COLUMN color_hex text;

ALTER TABLE public.practice_member
  ADD CONSTRAINT practice_member_color_hex_format
  CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.practice_member.color_hex IS
  'Optional calendar colour for this staff member, formatted as #RRGGBB. Used by the booking app for visual differentiation in multi-staff calendar views.';

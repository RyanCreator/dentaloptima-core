-- ============================================================================
-- 0006_services_and_schedule_config.sql
-- Services catalogue + the static schedule config that drives availability:
--   services            - what the practice offers (with NHS bands, buffers)
--   staff_service       - which staff can perform which service
--   practice_hours      - operating hours by weekday
--   practice_closures   - bank holidays / closures
--   staff_availability  - per-staff weekly schedule
--   staff_breaks        - recurring breaks (lunch etc)
--   staff_time_off      - vacation / absence
--   blocked_time        - ad-hoc blocks (meetings, training)
--
-- The actual appointment + booking_request tables come in 0007 and FK into
-- service + practice_member from here.
-- ============================================================================

-- ============================================================================
-- Enums
-- ============================================================================
CREATE TYPE public.service_treatment_type AS ENUM (
  'EXAMINATION',
  'HYGIENE',
  'RESTORATIVE',
  'ENDODONTIC',
  'PROSTHODONTIC',
  'ORTHODONTIC',
  'PERIODONTAL',
  'ORAL_SURGERY',
  'COSMETIC',
  'EMERGENCY',
  'CONSULTATION',
  'X_RAY',
  'OTHER'
);

CREATE TYPE public.nhs_band AS ENUM (
  'BAND_1',
  'BAND_2',
  'BAND_3',
  'URGENT',
  'FREE_NHS',  -- under-18, pregnant, exempt
  'NOT_NHS'
);

CREATE TYPE public.weekday AS ENUM (
  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
);

CREATE TYPE public.staff_time_off_type AS ENUM (
  'HOLIDAY',
  'SICK',
  'TRAINING',
  'COMPASSIONATE',
  'OTHER'
);

CREATE TYPE public.blocked_time_type AS ENUM (
  'MEETING',
  'TRAINING',
  'ADMIN',
  'LUNCH',
  'EQUIPMENT_DOWN',
  'OTHER'
);

-- ============================================================================
-- service
-- ============================================================================
CREATE TABLE public.service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  treatment_type public.service_treatment_type NOT NULL DEFAULT 'OTHER',
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  -- Buffers before/after for room reset, sterilisation, etc
  buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 60),
  buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 60),
  -- Pricing (private fee in pence to avoid float)
  price_pence integer CHECK (price_pence IS NULL OR price_pence >= 0),
  -- NHS
  is_nhs boolean NOT NULL DEFAULT false,
  nhs_band public.nhs_band,
  -- Recall: if set, completing this service auto-creates a recall N months out
  recall_months integer CHECK (recall_months IS NULL OR recall_months BETWEEN 1 AND 24),
  -- Display
  color_hex text CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  display_order integer NOT NULL DEFAULT 0,
  -- Bookable from public booking page?
  is_publicly_bookable boolean NOT NULL DEFAULT true,
  -- Lifecycle
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CHECK (NOT (is_nhs AND nhs_band IS NULL))  -- if NHS, must specify a band
);

COMMENT ON TABLE public.service IS
  'Services catalogue per practice. duration + buffers feed the availability engine. is_publicly_bookable controls visibility on the patient-facing booking page.';

CREATE INDEX idx_service_practice_active
  ON public.service (practice_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_service_practice_publicly_bookable
  ON public.service (practice_id)
  WHERE is_active = true AND is_publicly_bookable = true AND deleted_at IS NULL;

CREATE TRIGGER trg_service_audit
  BEFORE INSERT OR UPDATE ON public.service
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- staff_service — many-to-many (which staff can perform which service)
-- ============================================================================
CREATE TABLE public.staff_service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.service(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, service_id)
);

COMMENT ON TABLE public.staff_service IS
  'M:N qualifications. Used by availability engine to know which staff to offer for a given service.';

CREATE INDEX idx_staff_service_practice_staff
  ON public.staff_service (practice_id, staff_id);

CREATE INDEX idx_staff_service_practice_service
  ON public.staff_service (practice_id, service_id);

-- ============================================================================
-- practice_hours
-- ============================================================================
CREATE TABLE public.practice_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  weekday public.weekday NOT NULL,
  -- NULL open_time means closed that day
  open_time time,
  close_time time,
  -- Effective dates let practices change hours (e.g. summer hours)
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (open_time IS NULL OR close_time IS NULL OR close_time > open_time),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.practice_hours IS
  'Operating hours by weekday. NULL open_time = closed that day. effective_from/to lets practices roll over to new schedules.';

CREATE INDEX idx_practice_hours_practice_weekday
  ON public.practice_hours (practice_id, weekday, effective_from DESC);

CREATE TRIGGER trg_practice_hours_audit
  BEFORE INSERT OR UPDATE ON public.practice_hours
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- practice_closures
-- ============================================================================
CREATE TABLE public.practice_closure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text NOT NULL,
  is_full_day boolean NOT NULL DEFAULT true,
  -- For partial-day closures (e.g. early-close at 13:00)
  starts_time time,
  ends_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (ends_on >= starts_on),
  CHECK (is_full_day OR (starts_time IS NOT NULL AND ends_time IS NOT NULL AND ends_time > starts_time))
);

COMMENT ON TABLE public.practice_closure IS
  'Bank holidays, training days, partial-day closures. Availability engine excludes these from bookable slots.';

CREATE INDEX idx_practice_closure_practice_dates
  ON public.practice_closure (practice_id, starts_on, ends_on);

CREATE TRIGGER trg_practice_closure_audit
  BEFORE INSERT OR UPDATE ON public.practice_closure
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- staff_availability — weekly schedule per staff
-- ============================================================================
CREATE TABLE public.staff_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  weekday public.weekday NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (end_time > start_time),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.staff_availability IS
  'Per-staff weekly working hours. Staff can have multiple rows per weekday (e.g. AM + PM with break).';

CREATE INDEX idx_staff_availability_practice_staff_weekday
  ON public.staff_availability (practice_id, staff_id, weekday, effective_from DESC);

CREATE TRIGGER trg_staff_availability_audit
  BEFORE INSERT OR UPDATE ON public.staff_availability
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- staff_breaks — recurring breaks (lunch etc)
-- ============================================================================
CREATE TABLE public.staff_break (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  weekday public.weekday NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  label text NOT NULL DEFAULT 'Break',
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (end_time > start_time),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_staff_break_practice_staff_weekday
  ON public.staff_break (practice_id, staff_id, weekday, effective_from DESC);

CREATE TRIGGER trg_staff_break_audit
  BEFORE INSERT OR UPDATE ON public.staff_break
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- staff_time_off — multi-day absences
-- ============================================================================
CREATE TABLE public.staff_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  time_off_type public.staff_time_off_type NOT NULL DEFAULT 'HOLIDAY',
  reason text,
  is_approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (ends_on >= starts_on)
);

CREATE INDEX idx_staff_time_off_practice_staff_dates
  ON public.staff_time_off (practice_id, staff_id, starts_on, ends_on);

CREATE TRIGGER trg_staff_time_off_audit
  BEFORE INSERT OR UPDATE ON public.staff_time_off
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- blocked_time — ad-hoc blocks (meetings, equipment downtime)
-- ============================================================================
CREATE TABLE public.blocked_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practice(id) ON DELETE RESTRICT,
  -- staff_id NULL = block applies to whole practice
  staff_id uuid REFERENCES public.practice_member(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  block_type public.blocked_time_type NOT NULL DEFAULT 'OTHER',
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.practice_member(id) ON DELETE SET NULL,
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_blocked_time_practice_dates
  ON public.blocked_time (practice_id, starts_at, ends_at);

CREATE INDEX idx_blocked_time_staff_dates
  ON public.blocked_time (staff_id, starts_at, ends_at)
  WHERE staff_id IS NOT NULL;

CREATE TRIGGER trg_blocked_time_audit
  BEFORE INSERT OR UPDATE ON public.blocked_time
  FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_audit_columns();

-- ============================================================================
-- RLS — uniform pattern: practice_id = current_practice_id
-- ============================================================================
ALTER TABLE public.service             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_service       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_hours      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_closure    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_availability  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_break         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_time_off      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_time        ENABLE ROW LEVEL SECURITY;

-- service: read by all members; write by admin only
CREATE POLICY service_select ON public.service FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY service_admin_write ON public.service FOR ALL TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- staff_service: read by all members; write by admin only
CREATE POLICY staff_service_select ON public.staff_service FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY staff_service_admin_write ON public.staff_service FOR ALL TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- practice_hours: read by all; write by admin only
CREATE POLICY practice_hours_select ON public.practice_hours FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY practice_hours_admin_write ON public.practice_hours FOR ALL TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- practice_closure: read by all; write by admin
CREATE POLICY practice_closure_select ON public.practice_closure FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY practice_closure_admin_write ON public.practice_closure FOR ALL TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

-- staff_availability: read all members; write by admin OR the staff themselves
CREATE POLICY staff_availability_select ON public.staff_availability FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY staff_availability_write ON public.staff_availability FOR ALL TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      staff_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (
      staff_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  );

-- staff_break: same as availability
CREATE POLICY staff_break_select ON public.staff_break FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY staff_break_write ON public.staff_break FOR ALL TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      staff_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  )
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (
      staff_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  );

-- staff_time_off: members can request their own; only admin can approve
CREATE POLICY staff_time_off_select ON public.staff_time_off FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY staff_time_off_insert ON public.staff_time_off FOR INSERT TO authenticated
  WITH CHECK (
    practice_id = (select app_private.current_practice_id())
    AND (
      staff_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  );
CREATE POLICY staff_time_off_update ON public.staff_time_off FOR UPDATE TO authenticated
  USING (
    practice_id = (select app_private.current_practice_id())
    AND (
      staff_id = (select app_private.current_member_id())
      OR (select app_private.is_practice_admin())
    )
  )
  WITH CHECK (practice_id = (select app_private.current_practice_id()));

-- blocked_time: read by all; write by admin only (or owner of the block)
CREATE POLICY blocked_time_select ON public.blocked_time FOR SELECT TO authenticated
  USING (practice_id = (select app_private.current_practice_id()));
CREATE POLICY blocked_time_write ON public.blocked_time FOR ALL TO authenticated
  USING (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()))
  WITH CHECK (practice_id = (select app_private.current_practice_id()) AND (select app_private.is_practice_admin()));

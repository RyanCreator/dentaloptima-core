import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Loads everything the calendar's day-views need to know about WHEN the
// practice + staff are actually working on the selected day:
//
//   - practice hours for the day's weekday (open_time / close_time, NULL = closed)
//   - closures whose date range covers the selected day
//   - staff_time_off whose date range covers the selected day (per staff)
//   - staff_break for the day's weekday (per staff)
//
// Each consumer view (timeline, multi-staff) reads the slices it needs to
// shade out-of-hours regions, mark staff as off, etc.

const WEEKDAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
type Weekday = (typeof WEEKDAY_NAMES)[number];

function weekdayFor(date: Date): Weekday {
  return WEEKDAY_NAMES[date.getDay()];
}

export interface PracticeHoursForDay {
  /** HH:mm:ss — null means the practice is closed that weekday. */
  open_time: string | null;
  close_time: string | null;
}

export interface PracticeClosureForDay {
  id: string;
  reason: string;
  is_full_day: boolean;
  /** HH:mm:ss when is_full_day=false, otherwise null. */
  starts_time: string | null;
  ends_time: string | null;
}

export interface StaffTimeOffForDay {
  id: string;
  staff_id: string;
  reason: string | null;
  time_off_type: string;
}

export interface StaffBreakForDay {
  id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  label: string;
}

export interface DayContext {
  /** null until first load completes; null after if the practice has no hours row for this weekday. */
  practiceHours: PracticeHoursForDay | null;
  closures: PracticeClosureForDay[];
  /** Indexed by staff_id for O(1) lookup in multi-staff view. */
  staffTimeOff: Map<string, StaffTimeOffForDay[]>;
  staffBreaks: Map<string, StaffBreakForDay[]>;
  loading: boolean;
  /** True while practiceHours is null AND the practice has no row for this weekday. */
  practiceClosedToday: boolean;
  /** True if a full-day closure is active for the selected day. */
  fullDayClosure: PracticeClosureForDay | null;
}

const EMPTY_CONTEXT: DayContext = {
  practiceHours: null,
  closures: [],
  staffTimeOff: new Map(),
  staffBreaks: new Map(),
  loading: true,
  practiceClosedToday: false,
  fullDayClosure: null,
};

export function useDayContext(selectedDay: Date | null | undefined): DayContext {
  const [context, setContext] = useState<DayContext>(EMPTY_CONTEXT);

  const load = useCallback(async (day: Date) => {
    setContext((prev) => ({ ...prev, loading: true }));

    const weekday = weekdayFor(day);
    const dayString = format(day, "yyyy-MM-dd");

    // Four parallel queries. RLS scopes everything to the caller's practice
    // automatically so we don't need an explicit practice_id filter.
    const [hoursRes, closureRes, timeOffRes, breakRes] = await Promise.all([
      supabase
        .from("practice_hours")
        .select("open_time, close_time")
        .eq("weekday", weekday)
        .is("effective_to", null)
        .lte("effective_from", dayString)
        .order("effective_from", { ascending: false })
        .limit(1),
      supabase
        .from("practice_closure")
        .select("id, reason, is_full_day, starts_time, ends_time, starts_on, ends_on")
        .lte("starts_on", dayString)
        .gte("ends_on", dayString),
      supabase
        .from("staff_time_off")
        .select("id, staff_id, reason, time_off_type, starts_on, ends_on")
        .lte("starts_on", dayString)
        .gte("ends_on", dayString),
      supabase
        .from("staff_break")
        .select("id, staff_id, start_time, end_time, label")
        .eq("weekday", weekday)
        .is("effective_to", null)
        .lte("effective_from", dayString),
    ]);

    if (hoursRes.error) logger.error("Failed to load practice_hours", hoursRes.error);
    if (closureRes.error) logger.error("Failed to load practice_closure", closureRes.error);
    if (timeOffRes.error) logger.error("Failed to load staff_time_off", timeOffRes.error);
    if (breakRes.error) logger.error("Failed to load staff_break", breakRes.error);

    const practiceHours =
      hoursRes.data && hoursRes.data.length > 0
        ? {
            open_time: hoursRes.data[0].open_time,
            close_time: hoursRes.data[0].close_time,
          }
        : null;

    // The hours row might exist but have NULL open_time, which the schema
    // treats as "closed that weekday". Roll those two into one flag so views
    // don't have to recheck.
    const practiceClosedToday =
      practiceHours === null ||
      practiceHours.open_time === null ||
      practiceHours.close_time === null;

    const closures = (closureRes.data ?? []) as PracticeClosureForDay[];
    const fullDayClosure = closures.find((c) => c.is_full_day) ?? null;

    const staffTimeOff = new Map<string, StaffTimeOffForDay[]>();
    for (const row of timeOffRes.data ?? []) {
      const list = staffTimeOff.get(row.staff_id) ?? [];
      list.push({
        id: row.id,
        staff_id: row.staff_id,
        reason: row.reason,
        time_off_type: row.time_off_type,
      });
      staffTimeOff.set(row.staff_id, list);
    }

    const staffBreaks = new Map<string, StaffBreakForDay[]>();
    for (const row of breakRes.data ?? []) {
      const list = staffBreaks.get(row.staff_id) ?? [];
      list.push({
        id: row.id,
        staff_id: row.staff_id,
        start_time: row.start_time,
        end_time: row.end_time,
        label: row.label,
      });
      staffBreaks.set(row.staff_id, list);
    }

    setContext({
      practiceHours,
      closures,
      staffTimeOff,
      staffBreaks,
      loading: false,
      practiceClosedToday,
      fullDayClosure,
    });
  }, []);

  useEffect(() => {
    if (!selectedDay) {
      setContext({ ...EMPTY_CONTEXT, loading: false });
      return;
    }
    void load(selectedDay);
  }, [selectedDay, load]);

  return context;
}

// Helper exposed for views: convert a "HH:mm:ss" or "HH:mm" string into a
// minutes-from-midnight integer. Handy for vertical-position math.
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

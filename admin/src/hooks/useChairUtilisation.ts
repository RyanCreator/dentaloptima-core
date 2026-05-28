import { useCallback, useEffect, useState } from "react";
import { supabaseCore } from "@/integrations/supabase/client";

// "Chair utilisation" — what fraction of each clinician's scheduled
// working time was spent doing treatments? Computed for:
//   - overall      (last 90 days, single rolled-up number)
//   - weekly       (last 4 calendar weeks Mon-Sun, including current)
//   - monthly      (last 3 calendar months, including current)
//
// Numerator   = sum of actual treatment durations (completed_at -
//               started_at) per bucket.
// Denominator = scheduled working minutes in the bucket, derived from
//               staff_availability (weekly recurring schedule) by
//               iterating days in the bucket.
//
// Caveat: v1 doesn't subtract staff_time_off or practice_closures from
// the denominator, so a clinician who took two weeks off will appear
// slightly under-utilised. Directionally still useful, and the report
// states the assumption.

const OVERALL_WINDOW_DAYS = 90;
const WEEKLY_BUCKETS = 4;
const MONTHLY_BUCKETS = 3;

// Fetch a bit wider than the longest bucket needs so an M-2 bucket
// starting on the 1st of a month isn't missed by a 90-day boundary.
const FETCH_WINDOW_DAYS = 120;

export interface UtilisationBucket {
  label: string;
  start: string; // ISO date inclusive
  end: string;   // ISO date exclusive
  scheduled_minutes: number;
  treatment_minutes: number;
  utilisation_percent: number;
}

export interface StaffUtilisationRow {
  staff_id: string;
  staff_name: string;
  // Overall — last 90 days.
  scheduled_minutes: number;
  treatment_minutes: number;
  utilisation_percent: number;
  // Time-bucketed breakdowns, oldest first so reading left-to-right
  // shows the trend forward in time.
  weekly: UtilisationBucket[];
  monthly: UtilisationBucket[];
}

interface RawAvailability {
  staff_id: string;
  weekday: string;
  start_time: string;
  end_time: string;
  effective_to: string | null;
  staff: { full_name: string | null } | null;
}

interface RawCompletion {
  staff_id: string | null;
  // started_at may be null when an appointment was marked COMPLETED
  // without first passing through IN_PROGRESS (the common path). In
  // that case treatmentMinutesInRange falls back to scheduled duration
  // (ends_at - starts_at) so utilisation still reflects the work done.
  started_at: string | null;
  completed_at: string;
  starts_at: string;
  ends_at: string;
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7,
};

function minutesBetween(a: string, b: string): number {
  const [aH, aM] = a.split(":").map(Number);
  const [bH, bM] = b.split(":").map(Number);
  return (bH * 60 + bM) - (aH * 60 + aM);
}

// Returns ISO weekday 1=Mon..7=Sun for a given Date.
function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

// Sunday-rollover-safe start-of-day in the local timezone.
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

// Monday of the calendar week containing `d` (00:00 local).
function startOfWeekMon(d: Date): Date {
  const day = isoWeekday(d); // 1..7
  return startOfDay(addDays(d, -(day - 1)));
}

// First day of the calendar month containing `d`.
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// First day of the next month after `d`.
function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

interface BucketRange {
  label: string;
  start: Date;
  end: Date; // exclusive
}

/** Returns last N weekly Mon-Sun buckets ending with the current week. Oldest first. */
function buildWeeklyBuckets(now: Date, count: number): BucketRange[] {
  const currentWeekStart = startOfWeekMon(now);
  const out: BucketRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = addDays(currentWeekStart, -i * 7);
    const end = addDays(start, 7);
    const label = i === 0 ? "Now" : `W-${i}`;
    out.push({ label, start, end });
  }
  return out;
}

/** Returns last N calendar-month buckets ending with the current month. Oldest first. */
function buildMonthlyBuckets(now: Date, count: number): BucketRange[] {
  const currentMonthStart = startOfMonth(now);
  const out: BucketRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - i, 1);
    const end = startOfNextMonth(start);
    const label = i === 0 ? "Now" : `M-${i}`;
    out.push({ label, start, end });
  }
  return out;
}

// Per-staff weekday → minutes map (sum across availability rows for
// that weekday). Used to compute scheduled minutes for any date range
// by iterating dates and adding the weekday's minutes.
type WeekdayMinutes = Record<number, number>;

function buildScheduleMap(rows: RawAvailability[]): {
  perStaff: Map<string, { name: string; byWeekday: WeekdayMinutes }>;
} {
  const perStaff = new Map<string, { name: string; byWeekday: WeekdayMinutes }>();
  for (const row of rows) {
    const iso = WEEKDAY_TO_ISO[row.weekday];
    if (!iso) continue;
    const mins = minutesBetween(row.start_time, row.end_time);
    if (mins <= 0) continue;
    const bucket = perStaff.get(row.staff_id) ?? {
      name: row.staff?.full_name ?? "Unnamed staff",
      byWeekday: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    };
    bucket.byWeekday[iso] += mins;
    perStaff.set(row.staff_id, bucket);
  }
  return { perStaff };
}

function scheduledMinutesInRange(byWeekday: WeekdayMinutes, start: Date, end: Date): number {
  // Iterate days [start, end). For each day, look up its weekday's
  // minutes from the staff's recurring schedule.
  let total = 0;
  for (let d = new Date(start); d < end; d = addDays(d, 1)) {
    total += byWeekday[isoWeekday(d)] ?? 0;
  }
  return total;
}

function treatmentMinutesInRange(
  completions: RawCompletion[],
  start: Date,
  end: Date,
): number {
  let total = 0;
  for (const row of completions) {
    const completed = new Date(row.completed_at);
    if (completed < start || completed >= end) continue;
    let mins: number;
    if (row.started_at) {
      // Real measured duration.
      mins = (completed.getTime() - new Date(row.started_at).getTime()) / 60_000;
    } else {
      // Fallback: assume the appointment took the scheduled length. Better
      // than excluding the appointment entirely when the clinician didn't
      // click "Start treatment" before "Complete".
      mins = (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000;
    }
    if (mins <= 0 || mins > 360) continue;
    total += mins;
  }
  return total;
}

export function useChairUtilisation(practiceId: string | undefined) {
  const [rows, setRows] = useState<StaffUtilisationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays] = useState(OVERALL_WINDOW_DAYS);

  const reload = useCallback(async () => {
    if (!practiceId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const now = new Date();
    const sinceFetch = new Date(now.getTime() - FETCH_WINDOW_DAYS * 86_400_000).toISOString();

    const [availRes, completionsRes] = await Promise.all([
      supabaseCore
        .from("staff_availability")
        .select(
          "staff_id, weekday, start_time, end_time, effective_to, staff:staff_id(full_name)",
        )
        .eq("practice_id", practiceId)
        .is("effective_to", null),
      supabaseCore
        .from("appointment")
        .select("staff_id, started_at, completed_at, starts_at, ends_at")
        .eq("practice_id", practiceId)
        .eq("status", "COMPLETED")
        .not("completed_at", "is", null)
        .gte("completed_at", sinceFetch)
        .is("deleted_at", null)
        .limit(5000),
    ]);

    if (availRes.error || completionsRes.error) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { perStaff } = buildScheduleMap(
      (availRes.data ?? []) as unknown as RawAvailability[],
    );

    // Group completions by staff for fast per-bucket aggregation.
    const completionsByStaff = new Map<string, RawCompletion[]>();
    for (const row of (completionsRes.data ?? []) as unknown as RawCompletion[]) {
      if (!row.staff_id) continue;
      const arr = completionsByStaff.get(row.staff_id) ?? [];
      arr.push(row);
      completionsByStaff.set(row.staff_id, arr);
    }

    const weeklyRanges = buildWeeklyBuckets(now, WEEKLY_BUCKETS);
    const monthlyRanges = buildMonthlyBuckets(now, MONTHLY_BUCKETS);
    const overallStart = new Date(now.getTime() - OVERALL_WINDOW_DAYS * 86_400_000);
    const overallEnd = now;

    const out: StaffUtilisationRow[] = [];
    for (const [staff_id, info] of perStaff) {
      const completions = completionsByStaff.get(staff_id) ?? [];

      const buildBuckets = (ranges: BucketRange[]): UtilisationBucket[] =>
        ranges.map((r) => {
          const sched = Math.round(scheduledMinutesInRange(info.byWeekday, r.start, r.end));
          const treat = Math.round(treatmentMinutesInRange(completions, r.start, r.end));
          const pct = sched > 0 ? Math.round((treat / sched) * 100) : 0;
          return {
            label: r.label,
            start: r.start.toISOString(),
            end: r.end.toISOString(),
            scheduled_minutes: sched,
            treatment_minutes: treat,
            utilisation_percent: pct,
          };
        });

      const overallSched = Math.round(
        scheduledMinutesInRange(info.byWeekday, overallStart, overallEnd),
      );
      const overallTreat = Math.round(
        treatmentMinutesInRange(completions, overallStart, overallEnd),
      );
      const overallPct = overallSched > 0 ? Math.round((overallTreat / overallSched) * 100) : 0;

      out.push({
        staff_id,
        staff_name: info.name,
        scheduled_minutes: overallSched,
        treatment_minutes: overallTreat,
        utilisation_percent: overallPct,
        weekly: buildBuckets(weeklyRanges),
        monthly: buildBuckets(monthlyRanges),
      });
    }
    // Most-utilised on top.
    out.sort((a, b) => b.utilisation_percent - a.utilisation_percent);

    setRows(out);
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, windowDays, reload };
}

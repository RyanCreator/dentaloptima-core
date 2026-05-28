import { useCallback, useEffect, useState } from "react";
import { supabaseCore } from "@/integrations/supabase/client";

// Appointment-outcome breakdowns powering the Insights tab's
// "Appointment outcomes" and "Staff performance" sections. Counts
// completed / no-show / cancelled / rescheduled appointments over a
// 90-day window, overall and per staff member.
//
// Why we count rescheduled separately from cancelled: a rescheduled
// appointment isn't a lost outcome — the patient still came in
// (eventually), it's just a slot-management metric. Keeping them apart
// lets the report tell the right story for each ("X cancellations" =
// actual lost revenue; "Y reschedules" = capacity shuffling).

const WINDOW_DAYS = 90;

export interface OutcomeCounts {
  completed: number;
  no_show: number;
  cancelled: number;
  rescheduled: number;
  total: number;
}

export interface StaffOutcomeRow {
  staff_id: string;
  staff_name: string;
  counts: OutcomeCounts;
  /** % of appointments that completed (vs total terminal outcomes). */
  completion_rate: number;
  /** % of appointments that no-showed. */
  no_show_rate: number;
}

export interface AppointmentOutcomesReport {
  overall: OutcomeCounts;
  per_staff: StaffOutcomeRow[];
}

interface RawAppointment {
  staff_id: string | null;
  status: string;
  staff: { full_name: string | null } | null;
}

export function useAppointmentOutcomes(practiceId: string | undefined) {
  const [report, setReport] = useState<AppointmentOutcomesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays] = useState(WINDOW_DAYS);

  const reload = useCallback(async () => {
    if (!practiceId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    // We look at appointments that REACHED a terminal status in the
    // window — using starts_at as the anchor (when the appointment was
    // due to happen) rather than the status-change time, so a December
    // appointment that got cancelled in January still appears in the
    // December bucket. Most natural for "in the last 90 days of
    // bookings, how did they end up?".
    const { data, error } = await supabaseCore
      .from("appointment")
      .select("staff_id, status, staff:staff_id(full_name)")
      .eq("practice_id", practiceId)
      .in("status", ["COMPLETED", "NO_SHOW", "CANCELLED", "RESCHEDULED"])
      .gte("starts_at", since)
      .is("deleted_at", null)
      .limit(5000);

    if (error || !data) {
      setReport(null);
      setLoading(false);
      return;
    }

    const overall: OutcomeCounts = {
      completed: 0,
      no_show: 0,
      cancelled: 0,
      rescheduled: 0,
      total: 0,
    };

    // Per-staff accumulation. Unassigned appointments (staff_id null)
    // shouldn't normally exist in a healthy practice; group them under
    // "Unassigned" if they do.
    const byStaff = new Map<
      string,
      { staff_name: string; counts: OutcomeCounts }
    >();

    for (const row of data as unknown as RawAppointment[]) {
      const status = row.status as keyof typeof STATUS_TO_KEY;
      const key = STATUS_TO_KEY[status];
      if (!key) continue;
      overall[key] += 1;
      overall.total += 1;

      const staffId = row.staff_id ?? "__unassigned";
      const staffName = row.staff?.full_name ?? "Unassigned";
      const bucket =
        byStaff.get(staffId) ?? {
          staff_name: staffName,
          counts: {
            completed: 0,
            no_show: 0,
            cancelled: 0,
            rescheduled: 0,
            total: 0,
          },
        };
      bucket.counts[key] += 1;
      bucket.counts.total += 1;
      byStaff.set(staffId, bucket);
    }

    const per_staff: StaffOutcomeRow[] = Array.from(byStaff.entries())
      .map(([staff_id, b]) => ({
        staff_id,
        staff_name: b.staff_name,
        counts: b.counts,
        completion_rate:
          b.counts.total > 0 ? Math.round((b.counts.completed / b.counts.total) * 100) : 0,
        no_show_rate:
          b.counts.total > 0 ? Math.round((b.counts.no_show / b.counts.total) * 100) : 0,
      }))
      // Sort by total appointments — most-active staff at the top
      // (that's where any per-staff insight will move the needle).
      .sort((a, b) => b.counts.total - a.counts.total);

    setReport({ overall, per_staff });
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { report, loading, windowDays, reload };
}

const STATUS_TO_KEY: Record<string, keyof OutcomeCounts | undefined> = {
  COMPLETED: "completed",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
  RESCHEDULED: "rescheduled",
};

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePractice } from "@/contexts/PracticeContext";

// Adapted to dentaloptima-core's `staff_time_off` table. The new schema
// uses date-only `starts_on` / `ends_on` columns rather than timestamp
// `starts_at` / `ends_at` — the booking app no longer supports intra-day
// "half day" or "custom hours" time off through this surface. For partial
// days, use `blocked_time` (which is timestamp-ranged).
export interface TimeOff {
  id: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string; // YYYY-MM-DD
  reason: string | null;
  time_off_type: string;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useStaffTimeOff(staffId: string | undefined) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (staffId) {
      loadTimeOff();
    }
  }, [staffId]);

  useEffect(() => {
    if (!staffId) return;

    const channel = supabase
      .channel(`staff-${staffId}-timeoff`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_time_off",
          filter: `staff_id=eq.${staffId}`,
        },
        () => loadTimeOff(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffId]);

  const loadTimeOff = async () => {
    if (!staffId) return;

    const { data } = await supabase
      .from("staff_time_off")
      .select("id, starts_on, ends_on, reason, time_off_type")
      .eq("staff_id", staffId)
      .order("starts_on", { ascending: false });

    if (data) setTimeOff(data as TimeOff[]);
    setLoading(false);
  };

  // Date-only inserts. Multiple selected dates that are consecutive collapse
  // into one row; non-consecutive dates create one row each.
  const addTimeOff = async (dates: Date[], reason: string) => {
    if (!staffId || dates.length === 0) return;

    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

    // Group consecutive dates into runs.
    const runs: Date[][] = [];
    let current: Date[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      const diffDays = Math.round(
        (next.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 1) {
        current.push(next);
      } else {
        runs.push(current);
        current = [next];
      }
    }
    runs.push(current);

    const rows = runs.map((run) => ({
      practice_id: practiceId,
      staff_id: staffId,
      starts_on: toDateString(run[0]),
      ends_on: toDateString(run[run.length - 1]),
      reason: reason || null,
      time_off_type: "OTHER" as const,
    }));

    const { error } = await supabase.from("staff_time_off").insert(rows);

    if (error) {
      toast.error("Failed to add time off");
    } else {
      toast.success(`Added time off for ${dates.length} date(s)`);
      loadTimeOff();
    }
  };

  const deleteTimeOff = async (timeOffId: string) => {
    const { error } = await supabase.from("staff_time_off").delete().eq("id", timeOffId);

    if (error) {
      toast.error("Failed to delete time off");
    } else {
      toast.success("Time off deleted");
      loadTimeOff();
    }
  };

  return {
    timeOff,
    loading,
    addTimeOff,
    deleteTimeOff,
    reloadTimeOff: loadTimeOff,
  };
}

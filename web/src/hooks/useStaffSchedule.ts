import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePractice } from "@/contexts/PracticeContext";

// Staff weekly schedule + recurring breaks. The hook surfaces a 7-day array
// indexed by ISO weekday (Mon=1 ... Sun=7) so the UI can render a static
// table; the dentaloptima-core schema stores `weekday` as the enum
// MON/TUE/.../SUN, so we translate at the boundary.

export interface Break {
  id?: string;
  start_time: string;
  end_time: string;
}

export interface Availability {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  breaks: Break[];
  no_break: boolean;
  is_working: boolean;
  // Legacy fields for backward compatibility
  break_start?: string;
  break_end?: string;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type WeekdayEnum = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const INT_TO_ENUM: Record<number, WeekdayEnum> = {
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
  7: "SUN",
};

const ENUM_TO_INT: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

function intToEnum(weekday: number): WeekdayEnum {
  return INT_TO_ENUM[weekday] ?? "MON";
}
function enumToInt(weekday: string | number): number {
  if (typeof weekday === "number") return weekday;
  return ENUM_TO_INT[weekday] ?? 0;
}

const DEFAULT_SCHEDULE: Availability[] = WEEKDAYS.map((_, idx) => ({
  weekday: idx + 1,
  start_time: "09:00",
  end_time: "17:00",
  breaks: [],
  break_start: "12:00",
  break_end: "13:00",
  no_break: false,
  is_working: idx < 5,
}));

export function useStaffSchedule(staffId: string | undefined) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;

  const [schedule, setSchedule] = useState<Availability[]>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (staffId) {
      loadSchedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  // Real-time updates subscription
  useEffect(() => {
    if (!staffId) return;

    const availabilityChannel = supabase
      .channel(`staff-${staffId}-availability`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_availability",
          filter: `staff_id=eq.${staffId}`,
        },
        () => loadSchedule(),
      )
      .subscribe();

    const breaksChannel = supabase
      .channel(`staff-${staffId}-breaks`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_break",
          filter: `staff_id=eq.${staffId}`,
        },
        () => loadSchedule(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(availabilityChannel);
      supabase.removeChannel(breaksChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  const loadSchedule = async () => {
    if (!staffId) return;

    const { data: availabilityData } = await supabase
      .from("staff_availability")
      .select("id, weekday, start_time, end_time")
      .eq("staff_id", staffId)
      .is("effective_to", null);

    const { data: breaksData } = await supabase
      .from("staff_break")
      .select("id, weekday, start_time, end_time")
      .eq("staff_id", staffId)
      .is("effective_to", null);

    if (availabilityData && availabilityData.length > 0) {
      const mappedSchedule = DEFAULT_SCHEDULE.map((defaultDay) => {
        const existingDay = availabilityData.find(
          (d) => enumToInt(d.weekday) === defaultDay.weekday,
        );
        const dayBreaks =
          breaksData?.filter((b) => enumToInt(b.weekday) === defaultDay.weekday) || [];

        if (existingDay) {
          const breaks: Break[] = dayBreaks.map((b) => ({
            id: b.id,
            start_time: b.start_time,
            end_time: b.end_time,
          }));

          return {
            id: existingDay.id,
            weekday: defaultDay.weekday,
            start_time: existingDay.start_time?.slice(0, 5) ?? "09:00",
            end_time: existingDay.end_time?.slice(0, 5) ?? "17:00",
            breaks,
            break_start: breaks.length > 0 ? breaks[0].start_time : undefined,
            break_end: breaks.length > 0 ? breaks[0].end_time : undefined,
            no_break: breaks.length === 0,
            is_working: true,
          };
        }
        return defaultDay;
      });
      setSchedule(mappedSchedule);
    } else {
      setSchedule(DEFAULT_SCHEDULE);
    }
    setLoading(false);
  };

  const updateScheduleDay = async (weekday: number, updates: Partial<Availability>) => {
    if (!staffId) return;

    const daySchedule = schedule.find((s) => s.weekday === weekday);
    if (!daySchedule) return;

    const updatedDay = { ...daySchedule, ...updates };
    const weekdayEnum = intToEnum(weekday);

    if (updatedDay.is_working) {
      if (updatedDay.id) {
        const { error } = await supabase
          .from("staff_availability")
          .update({
            start_time: updatedDay.start_time,
            end_time: updatedDay.end_time,
          })
          .eq("id", updatedDay.id);

        if (error) {
          toast.error("Failed to update schedule");
          return;
        }
      } else {
        // Insert needs practice_id (NOT NULL) and the enum form of weekday.
        const { data, error } = await supabase
          .from("staff_availability")
          .insert({
            practice_id: practiceId,
            staff_id: staffId,
            weekday: weekdayEnum,
            start_time: updatedDay.start_time,
            end_time: updatedDay.end_time,
          })
          .select("id")
          .single();

        if (error) {
          toast.error("Failed to add schedule");
          return;
        }
        updatedDay.id = data.id;
      }

      // Replace breaks for this weekday in one go.
      await supabase
        .from("staff_break")
        .delete()
        .eq("staff_id", staffId)
        .eq("weekday", weekdayEnum)
        .is("effective_to", null);

      if (updatedDay.breaks && updatedDay.breaks.length > 0) {
        const breaksToInsert = updatedDay.breaks.map((breakTime) => ({
          practice_id: practiceId,
          staff_id: staffId,
          weekday: weekdayEnum,
          start_time: breakTime.start_time,
          end_time: breakTime.end_time,
        }));

        const { error: breakError } = await supabase
          .from("staff_break")
          .insert(breaksToInsert);
        if (breakError) {
          toast.error("Failed to save breaks");
        }
      }
    } else if (updatedDay.id) {
      // Day toggled to "not working" — drop hours + breaks.
      await supabase.from("staff_availability").delete().eq("id", updatedDay.id);

      await supabase
        .from("staff_break")
        .delete()
        .eq("staff_id", staffId)
        .eq("weekday", weekdayEnum)
        .is("effective_to", null);

      delete updatedDay.id;
    }

    setSchedule(schedule.map((s) => (s.weekday === weekday ? updatedDay : s)));
    toast.success("Schedule updated");
  };

  return {
    schedule,
    loading,
    updateScheduleDay,
    reloadSchedule: loadSchedule,
  };
}

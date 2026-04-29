import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [schedule, setSchedule] = useState<Availability[]>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (staffId) {
      loadSchedule();
    }
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
        () => loadSchedule()
      )
      .subscribe();

    const breaksChannel = supabase
      .channel(`staff-${staffId}-breaks`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_breaks",
          filter: `staff_id=eq.${staffId}`,
        },
        () => loadSchedule()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(availabilityChannel);
      supabase.removeChannel(breaksChannel);
    };
  }, [staffId]);

  const loadSchedule = async () => {
    if (!staffId) return;

    const { data: availabilityData } = await supabase
      .from("staff_availability")
      .select("*")
      .eq("staff_id", staffId)
      .is("effective_from", null)
      .is("effective_to", null);

    const { data: breaksData } = await supabase
      .from("staff_breaks")
      .select("*")
      .eq("staff_id", staffId)
      .is("effective_from", null)
      .is("effective_to", null);

    if (availabilityData && availabilityData.length > 0) {
      const mappedSchedule = DEFAULT_SCHEDULE.map((defaultDay) => {
        const existingDay = availabilityData.find((d) => d.weekday === defaultDay.weekday);
        // Get ALL breaks for this weekday
        const dayBreaks = breaksData?.filter((b) => b.weekday === defaultDay.weekday) || [];

        if (existingDay) {
          const breaks: Break[] = dayBreaks.map(b => ({
            id: b.id,
            start_time: b.start_time,
            end_time: b.end_time,
          }));

          return {
            id: existingDay.id,
            weekday: existingDay.weekday,
            start_time: existingDay.start_time,
            end_time: existingDay.end_time,
            breaks: breaks,
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

    if (updatedDay.is_working) {
      // Save working hours
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
        const { data, error } = await supabase
          .from("staff_availability")
          .insert({
            staff_id: staffId,
            weekday: updatedDay.weekday,
            start_time: updatedDay.start_time,
            end_time: updatedDay.end_time,
          })
          .select()
          .single();

        if (error) {
          toast.error("Failed to add schedule");
          return;
        }
        updatedDay.id = data.id;
      }

      // Handle multiple breaks
      // First, delete all existing breaks for this day
      await supabase
        .from("staff_breaks")
        .delete()
        .eq("staff_id", staffId)
        .eq("weekday", weekday)
        .is("effective_from", null)
        .is("effective_to", null);

      // Then insert all new breaks
      if (updatedDay.breaks && updatedDay.breaks.length > 0) {
        const breaksToInsert = updatedDay.breaks.map(breakTime => ({
          staff_id: staffId,
          weekday: weekday,
          start_time: breakTime.start_time,
          end_time: breakTime.end_time,
        }));

        await supabase.from("staff_breaks").insert(breaksToInsert);
      }
    } else if (updatedDay.id) {
      // Delete working hours and breaks if not working
      await supabase.from("staff_availability").delete().eq("id", updatedDay.id);

      await supabase
        .from("staff_breaks")
        .delete()
        .eq("staff_id", staffId)
        .eq("weekday", weekday)
        .is("effective_from", null)
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

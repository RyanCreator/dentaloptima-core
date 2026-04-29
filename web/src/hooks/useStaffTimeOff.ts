import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TimeOff {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export function useStaffTimeOff(staffId: string | undefined) {
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (staffId) {
      loadTimeOff();
    }
  }, [staffId]);

  // Real-time updates subscription
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
        () => loadTimeOff()
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
      .select("*")
      .eq("staff_id", staffId)
      .order("starts_at", { ascending: false });

    if (data) setTimeOff(data);
    setLoading(false);
  };

  const addTimeOff = async (
    dates: Date[],
    timeOffType: "full" | "half" | "custom",
    customStartTime: string,
    customEndTime: string,
    reason: string
  ) => {
    if (!staffId || dates.length === 0) return;

    const timeOffEntries = dates.map((date) => {
      let starts_at: string;
      let ends_at: string;

      if (timeOffType === "full") {
        starts_at = new Date(date.setHours(0, 0, 0, 0)).toISOString();
        ends_at = new Date(date.setHours(23, 59, 59, 999)).toISOString();
      } else if (timeOffType === "half") {
        starts_at = new Date(date.setHours(0, 0, 0, 0)).toISOString();
        ends_at = new Date(date.setHours(12, 0, 0, 0)).toISOString();
      } else {
        const [startHour, startMin] = customStartTime.split(":").map(Number);
        const [endHour, endMin] = customEndTime.split(":").map(Number);
        starts_at = new Date(date.setHours(startHour, startMin, 0, 0)).toISOString();
        ends_at = new Date(date.setHours(endHour, endMin, 0, 0)).toISOString();
      }

      return {
        staff_id: staffId,
        starts_at,
        ends_at,
        reason: reason || null,
      };
    });

    const { error } = await supabase.from("staff_time_off").insert(timeOffEntries);

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

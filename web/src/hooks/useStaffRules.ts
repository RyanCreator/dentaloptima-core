import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useStaffRules() {
  const [breaksMap, setBreaksMap] = useState<Record<string, { start: number; end: number }[]>>({});
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, { start: number; end: number }>>({});

  const loadStaffRules = async () => {
    // Load default break times
    const { data: breaks } = await supabase
      .from("staff_breaks")
      .select("staff_id, weekday, start_time, end_time")
      .is("effective_from", null)
      .is("effective_to", null);

    const breakMap: Record<string, { start: number; end: number }[]> = {};
    if (breaks) {
      breaks.forEach((b: any) => {
        const key = `${b.staff_id}-${b.weekday}`;
        const timeToMin = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          return h * 60 + m;
        };
        const entry = { start: timeToMin(b.start_time), end: timeToMin(b.end_time) };
        if (!breakMap[key]) breakMap[key] = [];
        breakMap[key].push(entry);
      });
    }
    setBreaksMap(breakMap);

    // Load default availability
    const { data: avails } = await supabase
      .from("staff_availability")
      .select("staff_id, weekday, start_time, end_time")
      .is("effective_from", null)
      .is("effective_to", null);

    const availMap: Record<string, { start: number; end: number }> = {};
    if (avails) {
      avails.forEach((a: any) => {
        const key = `${a.staff_id}-${a.weekday}`;
        const [sh, sm] = a.start_time.split(":").map(Number);
        const [eh, em] = a.end_time.split(":").map(Number);
        availMap[key] = { start: sh * 60 + sm, end: eh * 60 + em };
      });
    }
    setAvailabilityMap(availMap);
  };

  useEffect(() => {
    loadStaffRules();
  }, []);

  return { breaksMap, availabilityMap };
}

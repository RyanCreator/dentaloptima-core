import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// dentaloptima-core stores weekday as a string enum (MON/TUE/...). The
// appointment-side check (getWeekdayISO in appointmentUtils) returns ISO
// ints (Mon=1 ... Sun=7), so we translate at this boundary so the lookup
// keys agree.
const WEEKDAY_TO_INT: Record<string, number> = {
  MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7,
};
const weekdayInt = (w: unknown): number =>
  typeof w === "number" ? w : typeof w === "string" ? (WEEKDAY_TO_INT[w] ?? 0) : 0;

export function useStaffRules() {
  const [breaksMap, setBreaksMap] = useState<Record<string, { start: number; end: number }[]>>({});
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, { start: number; end: number }>>({});

  const loadStaffRules = async () => {
    // Match rows whose effective range covers today. NULL on either side
    // means open-ended. The legacy hook filtered for both fields being
    // NULL, but Hours-and-Closures inserts rows with effective_from set
    // to the day they're saved, so that filter returned zero rows.
    const today = new Date().toISOString().slice(0, 10);

    const { data: breaks } = await supabase
      .from("staff_break")
      .select("staff_id, weekday, start_time, end_time")
      .or(`effective_from.is.null,effective_from.lte.${today}`)
      .or(`effective_to.is.null,effective_to.gte.${today}`);

    const breakMap: Record<string, { start: number; end: number }[]> = {};
    if (breaks) {
      breaks.forEach((b: any) => {
        const key = `${b.staff_id}-${weekdayInt(b.weekday)}`;
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

    // Order by effective_from desc so the first row we see for each
    // (staff, weekday) is the most recently-effective schedule. We keep
    // only that one in the map (most recent override wins).
    const { data: avails } = await supabase
      .from("staff_availability")
      .select("staff_id, weekday, start_time, end_time, effective_from")
      .or(`effective_from.is.null,effective_from.lte.${today}`)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("effective_from", { ascending: false, nullsFirst: false });

    const availMap: Record<string, { start: number; end: number }> = {};
    if (avails) {
      avails.forEach((a: any) => {
        const key = `${a.staff_id}-${weekdayInt(a.weekday)}`;
        if (availMap[key]) return; // most recent already won this slot
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

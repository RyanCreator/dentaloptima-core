import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Lightweight reader for the small slice of practice_setting that other
// pages need to react to. Loaded once per mount, no realtime — settings
// don't change frequently enough to justify the channel cost.
//
// Add fields here as more pages need them. Keep the surface narrow so the
// caller doesn't accidentally rely on stale data for fast-moving columns.

export interface PracticeSettingSlice {
  default_appt_duration_minutes: number;
  min_booking_notice_hours: number;
  max_advance_booking_days: number;
  recall_reminder_lead_days: number;
  // Bank-holiday display (migration 0048). Region is one of three
  // gov.uk feed slugs. Defaults match the column defaults so a pre-
  // migration practice falls back to "show, England & Wales".
  show_bank_holidays: boolean;
  bank_holidays_region: "england-and-wales" | "scotland" | "northern-ireland";
}

const DEFAULTS: PracticeSettingSlice = {
  default_appt_duration_minutes: 30,
  min_booking_notice_hours: 24,
  max_advance_booking_days: 90,
  recall_reminder_lead_days: 30,
  show_bank_holidays: true,
  bank_holidays_region: "england-and-wales",
};

export function usePracticeSetting(): {
  setting: PracticeSettingSlice;
  loading: boolean;
} {
  const [setting, setSetting] = useState<PracticeSettingSlice>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("practice_setting")
        .select(
          "default_appt_duration_minutes, min_booking_notice_hours, max_advance_booking_days, recall_reminder_lead_days, show_bank_holidays, bank_holidays_region",
        )
        .single();

      if (cancelled) return;

      if (error) {
        // Pre-migration practices won't have a row. RLS / 404 both surface
        // here; we just stay on defaults so the calendar still renders.
        logger.error("Failed to load practice_setting", error);
      } else if (data) {
        setSetting({
          default_appt_duration_minutes: data.default_appt_duration_minutes ?? 30,
          min_booking_notice_hours: data.min_booking_notice_hours ?? 24,
          max_advance_booking_days: data.max_advance_booking_days ?? 90,
          recall_reminder_lead_days: data.recall_reminder_lead_days ?? 30,
          show_bank_holidays: data.show_bank_holidays ?? true,
          bank_holidays_region:
            (data.bank_holidays_region as PracticeSettingSlice["bank_holidays_region"]) ??
            "england-and-wales",
        });
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { setting, loading };
}

// Returns the granularity to use for the calendar timeline. Snaps to the
// nearest divisor of 60 so the grid aligns with hour rows; an unusual
// configured value (e.g. 45 min) falls back to 30 for the visual grid.
export function snapSlotMinutes(minutes: number): SlotMinutes {
  const valid: SlotMinutes[] = [10, 15, 20, 30, 60];
  let best: SlotMinutes = 30;
  let bestDiff = Infinity;
  for (const v of valid) {
    const diff = Math.abs(v - minutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = v;
    }
  }
  return best;
}

export type SlotMinutes = 10 | 15 | 20 | 30 | 60;

export const SLOT_OPTIONS: { value: SlotMinutes; label: string }[] = [
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "60 min" },
];

// Row heights are chosen so a 30-minute appointment chip has enough room
// for time + patient name + service line without the text overflowing.
// Each slot stays at ~20px minimum so 10-min granularity is still legible.
//
// Used as `pixelsPerHour` by the timeline + multi-staff views; consumers
// scale appointment positioning + the current-time indicator off this.
//
// Trade-off: a fuller calendar (12 hours @ 90px = ~1080px) means a bit more
// vertical scrolling, but chips are no longer cramped at the most common
// 30-min duration — that's the right call for a clinical day-view.
export const SLOT_ROW_HEIGHT_PX: Record<SlotMinutes, { single: number; multi: number }> = {
  60: { single: 90, multi: 110 },
  30: { single: 90, multi: 110 },
  20: { single: 90, multi: 110 },
  15: { single: 120, multi: 140 },
  10: { single: 150, multi: 170 },
};

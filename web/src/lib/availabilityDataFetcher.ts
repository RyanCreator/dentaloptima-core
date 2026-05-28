/**
 * Centralized utility for fetching staff availability data.
 *
 * The availability engine downstream still speaks the legacy column shape
 * (numeric weekday 1–7, start_time/end_time on practice hours, starts_at/ends_at
 * on time-off and closures). The dentaloptima-core schema uses an enum
 * weekday (MON/TUE/...), open_time/close_time, and date-only starts_on/ends_on
 * on closures + time-off — so this fetcher does the translation in one
 * place rather than threading it through the engine.
 */

import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";
import type { StaffAvailabilityData } from "@/types/availability";
import { logger } from "@/lib/logger";

export interface FetchAvailabilityDataParams {
  staffId: string;
  date: Date;
  includeAppointments?: boolean;
  includePracticeHours?: boolean;
  includePracticeClosures?: boolean;
}

// Postgres exposes the weekday enum as the literal "MON"/"TUE"/... string.
// The engine compares against ISO weekday ints (Mon=1 ... Sun=7).
const WEEKDAY_TO_INT: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

function weekdayToInt(weekday: string | number | null | undefined): number {
  if (typeof weekday === "number") return weekday;
  if (typeof weekday === "string") return WEEKDAY_TO_INT[weekday] ?? 0;
  return 0;
}

// Date-only columns get widened to a same-day timestamp range so the
// engine's isAfter / isBefore checks against `new Date()` work without
// special-casing.
function dateToStartOfDayIso(d: string): string {
  return `${d}T00:00:00`;
}
function dateToEndOfDayIso(d: string): string {
  return `${d}T23:59:59`;
}

export async function fetchStaffAvailabilityData(
  params: FetchAvailabilityDataParams,
): Promise<StaffAvailabilityData | null> {
  const {
    staffId,
    date,
    includeAppointments = true,
    includePracticeHours = true,
    includePracticeClosures = true,
  } = params;

  try {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const promises: Promise<any>[] = [
      supabase
        .from("staff_availability")
        .select("weekday, start_time, end_time, effective_from, effective_to")
        .eq("staff_id", staffId),
      supabase
        .from("staff_break")
        .select("weekday, start_time, end_time, effective_from, effective_to")
        .eq("staff_id", staffId),
      supabase
        .from("staff_time_off")
        .select("starts_on, ends_on")
        .eq("staff_id", staffId)
        .lte("starts_on", dayEnd.toISOString().slice(0, 10))
        .gte("ends_on", dayStart.toISOString().slice(0, 10)),
      // blocked_time still uses timestamps. Legacy `reason` was renamed to
      // `title` — engine doesn't read it for slot math, only for display.
      supabase
        .from("blocked_time")
        .select("starts_at, ends_at, title")
        .eq("staff_id", staffId)
        .lte("starts_at", dayEnd.toISOString())
        .gte("ends_at", dayStart.toISOString()),
    ];

    if (includeAppointments) {
      promises.push(
        supabase
          .from("appointment")
          .select("starts_at, ends_at")
          .eq("staff_id", staffId)
          .in("status", ["SCHEDULED", "CONFIRMED", "ARRIVED", "IN_PROGRESS"])
          .is("deleted_at", null)
          .gte("starts_at", dayStart.toISOString())
          .lte("starts_at", dayEnd.toISOString()),
      );
    }

    if (includePracticeHours) {
      promises.push(
        supabase
          .from("practice_hours")
          .select("weekday, open_time, close_time")
          .is("effective_to", null)
          .order("weekday"),
      );
    }

    if (includePracticeClosures) {
      promises.push(
        supabase
          .from("practice_closure")
          .select("starts_on, ends_on, reason, is_full_day")
          .gte("ends_on", dayStart.toISOString().slice(0, 10))
          .lte("starts_on", dayEnd.toISOString().slice(0, 10)),
      );
    }

    const results = await Promise.all(promises);

    let resultIndex = 0;
    const schedulesRes = results[resultIndex++];
    const breaksRes = results[resultIndex++];
    const timeOffRes = results[resultIndex++];
    const blockedTimeRes = results[resultIndex++];
    const appointmentsRes = includeAppointments ? results[resultIndex++] : { data: [] };
    const practiceHoursRes = includePracticeHours ? results[resultIndex++] : { data: [] };
    const practiceClosuresRes = includePracticeClosures ? results[resultIndex++] : { data: [] };

    if (schedulesRes.error || breaksRes.error || timeOffRes.error || blockedTimeRes.error) {
      logger.error("Error fetching staff availability data", {
        schedulesError: schedulesRes.error,
        breaksError: breaksRes.error,
        timeOffError: timeOffRes.error,
        blockedTimeError: blockedTimeRes.error,
      });
      return null;
    }

    // Translate dentaloptima-core rows into the shape the engine expects.
    const schedules = (schedulesRes.data ?? []).map((row: any) => ({
      weekday: weekdayToInt(row.weekday),
      start_time: row.start_time,
      end_time: row.end_time,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
    }));

    const breaks = (breaksRes.data ?? []).map((row: any) => ({
      weekday: weekdayToInt(row.weekday),
      start_time: row.start_time,
      end_time: row.end_time,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
    }));

    const timeOff = (timeOffRes.data ?? []).map((row: any) => ({
      starts_at: dateToStartOfDayIso(row.starts_on),
      ends_at: dateToEndOfDayIso(row.ends_on),
    }));

    const blockedTime = (blockedTimeRes.data ?? []).map((row: any) => ({
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      reason: row.title ?? "",
    }));

    const practiceHours = (practiceHoursRes.data ?? [])
      // Drop rows where the practice is closed for the weekday (NULL times).
      .filter((row: any) => row.open_time && row.close_time)
      .map((row: any) => ({
        weekday: weekdayToInt(row.weekday),
        start_time: row.open_time,
        end_time: row.close_time,
      }));

    // Treat partial-day closures as same-day full closures for the engine
    // (it uses the starts_at/ends_at as a date-range gate). Refine to
    // partial-time blocking once the engine grows that concept.
    const practiceClosures = (practiceClosuresRes.data ?? []).map((row: any) => ({
      starts_at: dateToStartOfDayIso(row.starts_on),
      ends_at: dateToEndOfDayIso(row.ends_on),
      reason: row.reason ?? null,
    }));

    return {
      schedules,
      breaks,
      timeOff,
      blockedTime,
      appointments: appointmentsRes.data ?? [],
      practiceHours,
      practiceClosures,
    };
  } catch (error) {
    logger.error("Error in fetchStaffAvailabilityData", error, { staffId, date });
    return null;
  }
}

export function hasTimeOff(availabilityData: StaffAvailabilityData): boolean {
  return availabilityData.timeOff.length > 0;
}

/**
 * Multi-day variant of fetchStaffAvailabilityData. Widens the per-day
 * filters (appointments, time-off, blocked_time, practice_closure) to
 * cover an inclusive date range, while recurring data (schedules, breaks,
 * practice_hours) is fetched once and applies to every day.
 *
 * Used by the "Find next available" affordance on the New Appointment
 * form — searching 14 days forward is one round trip with this rather
 * than 14 with the single-day fetcher.
 */
export async function fetchStaffAvailabilityDataRange(params: {
  staffId: string;
  startDate: Date;
  endDate: Date;
}): Promise<StaffAvailabilityData | null> {
  const { staffId, startDate, endDate } = params;
  try {
    const rangeStart = startOfDay(startDate);
    const rangeEnd = endOfDay(endDate);

    const [
      schedulesRes,
      breaksRes,
      timeOffRes,
      blockedTimeRes,
      appointmentsRes,
      practiceHoursRes,
      practiceClosuresRes,
    ] = await Promise.all([
      supabase
        .from("staff_availability")
        .select("weekday, start_time, end_time, effective_from, effective_to")
        .eq("staff_id", staffId),
      supabase
        .from("staff_break")
        .select("weekday, start_time, end_time, effective_from, effective_to")
        .eq("staff_id", staffId),
      supabase
        .from("staff_time_off")
        .select("starts_on, ends_on")
        .eq("staff_id", staffId)
        .lte("starts_on", rangeEnd.toISOString().slice(0, 10))
        .gte("ends_on", rangeStart.toISOString().slice(0, 10)),
      supabase
        .from("blocked_time")
        .select("starts_at, ends_at, title")
        .eq("staff_id", staffId)
        .lte("starts_at", rangeEnd.toISOString())
        .gte("ends_at", rangeStart.toISOString()),
      supabase
        .from("appointment")
        .select("starts_at, ends_at")
        .eq("staff_id", staffId)
        .in("status", ["SCHEDULED", "CONFIRMED", "ARRIVED", "IN_PROGRESS"])
        .is("deleted_at", null)
        .gte("starts_at", rangeStart.toISOString())
        .lte("starts_at", rangeEnd.toISOString()),
      supabase
        .from("practice_hours")
        .select("weekday, open_time, close_time")
        .is("effective_to", null)
        .order("weekday"),
      supabase
        .from("practice_closure")
        .select("starts_on, ends_on, reason, is_full_day")
        .gte("ends_on", rangeStart.toISOString().slice(0, 10))
        .lte("starts_on", rangeEnd.toISOString().slice(0, 10)),
    ]);

    if (schedulesRes.error || breaksRes.error || timeOffRes.error || blockedTimeRes.error) {
      logger.error("Error fetching range staff availability data", {
        schedulesError: schedulesRes.error,
        breaksError: breaksRes.error,
        timeOffError: timeOffRes.error,
        blockedTimeError: blockedTimeRes.error,
      });
      return null;
    }

    const schedules = (schedulesRes.data ?? []).map((row: any) => ({
      weekday: weekdayToInt(row.weekday),
      start_time: row.start_time,
      end_time: row.end_time,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
    }));
    const breaks = (breaksRes.data ?? []).map((row: any) => ({
      weekday: weekdayToInt(row.weekday),
      start_time: row.start_time,
      end_time: row.end_time,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
    }));
    const timeOff = (timeOffRes.data ?? []).map((row: any) => ({
      starts_at: dateToStartOfDayIso(row.starts_on),
      ends_at: dateToEndOfDayIso(row.ends_on),
    }));
    const blockedTime = (blockedTimeRes.data ?? []).map((row: any) => ({
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      reason: row.title ?? "",
    }));
    const practiceHours = (practiceHoursRes.data ?? [])
      .filter((row: any) => row.open_time && row.close_time)
      .map((row: any) => ({
        weekday: weekdayToInt(row.weekday),
        start_time: row.open_time,
        end_time: row.close_time,
      }));
    const practiceClosures = (practiceClosuresRes.data ?? []).map((row: any) => ({
      starts_at: dateToStartOfDayIso(row.starts_on),
      ends_at: dateToEndOfDayIso(row.ends_on),
      reason: row.reason ?? null,
    }));

    return {
      schedules,
      breaks,
      timeOff,
      blockedTime,
      appointments: appointmentsRes.data ?? [],
      practiceHours,
      practiceClosures,
    };
  } catch (error) {
    logger.error("Error in fetchStaffAvailabilityDataRange", error, { staffId });
    return null;
  }
}

export async function fetchMultipleStaffAvailabilityData(
  staffIds: string[],
  date: Date,
  options?: Omit<FetchAvailabilityDataParams, "staffId" | "date">,
): Promise<Map<string, StaffAvailabilityData>> {
  const results = await Promise.all(
    staffIds.map((staffId) => fetchStaffAvailabilityData({ staffId, date, ...options })),
  );

  const dataMap = new Map<string, StaffAvailabilityData>();
  staffIds.forEach((staffId, index) => {
    const data = results[index];
    if (data) dataMap.set(staffId, data);
  });

  return dataMap;
}

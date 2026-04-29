/**
 * Centralized utility for fetching staff availability data
 * This reduces duplicate database query logic across multiple files
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

/**
 * Fetches all data needed for availability calculations
 * Makes 6 parallel database queries efficiently
 */
export async function fetchStaffAvailabilityData(
  params: FetchAvailabilityDataParams
): Promise<StaffAvailabilityData | null> {
  const { staffId, date, includeAppointments = true, includePracticeHours = true, includePracticeClosures = true } = params;

  try {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Build array of promises based on what's needed
    const promises: Promise<any>[] = [
      // Always fetch staff schedule, breaks, time off, and blocked time
      supabase
        .from("staff_availability")
        .select("*")
        .eq("staff_id", staffId),
      supabase
        .from("staff_breaks")
        .select("*")
        .eq("staff_id", staffId),
      supabase
        .from("staff_time_off")
        .select("starts_at, ends_at")
        .eq("staff_id", staffId)
        .lte("starts_at", dayEnd.toISOString())
        .gte("ends_at", dayStart.toISOString()),
      supabase
        .from("blocked_time")
        .select("starts_at, ends_at, reason")
        .eq("staff_id", staffId)
        .lte("starts_at", dayEnd.toISOString())
        .gte("ends_at", dayStart.toISOString()),
    ];

    // Conditionally add appointments query
    if (includeAppointments) {
      promises.push(
        supabase
          .from("appointment")
          .select("starts_at, ends_at, service_id")
          .eq("staff_id", staffId)
          .eq("status", "SCHEDULED")
          .gte("starts_at", dayStart.toISOString())
          .lte("starts_at", dayEnd.toISOString())
      );
    }

    // Conditionally add practice hours query
    if (includePracticeHours) {
      promises.push(
        supabase
          .from("practice_hours")
          .select("weekday, start_time, end_time")
          .order("weekday")
      );
    }

    // Conditionally add practice closures query
    if (includePracticeClosures) {
      promises.push(
        supabase
          .from("practice_closures")
          .select("starts_at, ends_at, reason")
          .gte("ends_at", dayStart.toISOString())
          .lte("starts_at", dayEnd.toISOString())
      );
    }

    const results = await Promise.all(promises);

    // Extract results based on what was fetched
    let resultIndex = 0;
    const schedulesRes = results[resultIndex++];
    const breaksRes = results[resultIndex++];
    const timeOffRes = results[resultIndex++];
    const blockedTimeRes = results[resultIndex++];
    const appointmentsRes = includeAppointments ? results[resultIndex++] : { data: [] };
    const practiceHoursRes = includePracticeHours ? results[resultIndex++] : { data: [] };
    const practiceClosuresRes = includePracticeClosures ? results[resultIndex++] : { data: [] };

    // Check for errors
    if (schedulesRes.error || breaksRes.error || timeOffRes.error || blockedTimeRes.error) {
      logger.error("Error fetching staff availability data", {
        schedulesError: schedulesRes.error,
        breaksError: breaksRes.error,
        timeOffError: timeOffRes.error,
        blockedTimeError: blockedTimeRes.error,
      });
      return null;
    }

    // Return structured data
    const availabilityData: StaffAvailabilityData = {
      schedules: schedulesRes.data || [],
      breaks: breaksRes.data || [],
      timeOff: timeOffRes.data || [],
      blockedTime: blockedTimeRes.data || [],
      appointments: appointmentsRes.data || [],
      practiceHours: practiceHoursRes.data || [],
      practiceClosures: practiceClosuresRes.data || [],
    };

    return availabilityData;
  } catch (error) {
    logger.error("Error in fetchStaffAvailabilityData", error, { staffId, date });
    return null;
  }
}

/**
 * Checks if staff has time off on a specific date
 * Useful for quick checks before doing full availability calculations
 */
export function hasTimeOff(availabilityData: StaffAvailabilityData): boolean {
  return availabilityData.timeOff.length > 0;
}

/**
 * Fetches availability data for multiple staff members in parallel
 * Efficient for dashboard/overview pages
 */
export async function fetchMultipleStaffAvailabilityData(
  staffIds: string[],
  date: Date,
  options?: Omit<FetchAvailabilityDataParams, "staffId" | "date">
): Promise<Map<string, StaffAvailabilityData>> {
  const results = await Promise.all(
    staffIds.map((staffId) =>
      fetchStaffAvailabilityData({ staffId, date, ...options })
    )
  );

  const dataMap = new Map<string, StaffAvailabilityData>();
  staffIds.forEach((staffId, index) => {
    const data = results[index];
    if (data) {
      dataMap.set(staffId, data);
    }
  });

  return dataMap;
}

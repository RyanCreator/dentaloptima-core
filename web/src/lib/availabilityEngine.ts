import {
  addDays,
  addMinutes,
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type {
  StaffSchedule,
  StaffBreak,
  TimeOffPeriod,
  BlockedTime,
  Appointment,
  Service,
  AvailableSlot,
  StaffAvailabilityData,
  PracticeClosure,
  PracticeHours,
} from "@/types/availability";
import { getClinicTimezone, SLOT_DURATION } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";

/**
 * Converts a date to the configured clinic timezone
 */
export const toUKTime = (date: Date | string): Date => {
  const d = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(d, getClinicTimezone());
};

/**
 * Gets ISO weekday (Monday = 1, Sunday = 7)
 */
export const getWeekdayISO = (date: Date): number => {
  return date.getDay() === 0 ? 7 : date.getDay();
};

/**
 * Checks if a schedule is effective for a given date
 */
export const isScheduleEffective = (
  schedule: StaffSchedule | StaffBreak,
  date: Date
): boolean => {
  if (schedule.effective_from) {
    const effectiveFrom = parseISO(schedule.effective_from);
    if (isBefore(date, effectiveFrom)) return false;
  }

  if (schedule.effective_to) {
    const effectiveTo = parseISO(schedule.effective_to);
    if (isAfter(date, effectiveTo)) return false;
  }

  return true;
};

/**
 * Checks if a date falls within a time-off period
 */
export const isDateDuringTimeOff = (
  date: Date,
  timeOff: TimeOffPeriod[]
): boolean => {
  return timeOff.some((to) => {
    const toStart = toUKTime(to.starts_at);
    const toEnd = toUKTime(to.ends_at);
    return (
      (isBefore(date, toEnd) || date.getTime() === toEnd.getTime()) &&
      (isAfter(date, toStart) || date.getTime() === toStart.getTime())
    );
  });
};

/**
 * Checks if a specific time slot overlaps with any blocked time
 */
export const isSlotBlocked = (
  slotStart: Date,
  slotEnd: Date,
  blockedTime: BlockedTime[]
): boolean => {
  return blockedTime.some((block) => {
    const blockStart = toUKTime(block.starts_at);
    const blockEnd = toUKTime(block.ends_at);

    // Check for any overlap
    return (
      (slotStart >= blockStart && slotStart < blockEnd) ||
      (slotEnd > blockStart && slotEnd <= blockEnd) ||
      (slotStart <= blockStart && slotEnd >= blockEnd)
    );
  });
};

/**
 * Calculates which services can fit in the available time
 * Services need their full duration + buffers to fit
 */
export const calculateServiceFit = (
  availableMinutes: number,
  services: Service[]
): { fitsAll: boolean; fitsLimited: boolean } => {
  if (services.length === 0) {
    return { fitsAll: false, fitsLimited: false };
  }

  // Total time needed = service duration + buffers
  const serviceDurations = services.map(
    (s) =>
      s.duration_minutes +
      (s.buffer_before_minutes || 0) +
      (s.buffer_after_minutes || 0)
  );

  const maxServiceDuration = Math.max(...serviceDurations, 0);
  const minServiceDuration = Math.min(...serviceDurations, Infinity);

  const fitsAll = availableMinutes >= maxServiceDuration;
  const fitsLimited = availableMinutes >= minServiceDuration && !fitsAll;

  return { fitsAll, fitsLimited };
};

/**
 * Checks if a date falls within a practice closure period
 */
export const isDateDuringClosure = (
  date: Date,
  closures: PracticeClosure[]
): boolean => {
  if (!closures || closures.length === 0) return false;

  return closures.some((closure) => {
    const closureStart = toUKTime(closure.starts_at);
    const closureEnd = toUKTime(closure.ends_at);
    const checkDate = startOfDay(date);
    const closureStartDay = startOfDay(closureStart);
    const closureEndDay = startOfDay(closureEnd);

    return (
      (isAfter(checkDate, closureStartDay) || checkDate.getTime() === closureStartDay.getTime()) &&
      (isBefore(checkDate, closureEndDay) || checkDate.getTime() === closureEndDay.getTime())
    );
  });
};

/**
 * Intersects staff working hours with practice hours
 * Returns the most restrictive hours (later start, earlier end)
 */
export const getEffectiveWorkingHours = (
  date: Date,
  staffSchedule: StaffSchedule,
  practiceHours?: PracticeHours[]
): { start: Date; end: Date } | null => {
  const weekday = getWeekdayISO(date);

  // Parse staff hours
  const [staffStartHour, staffStartMin] = staffSchedule.start_time.split(":").map(Number);
  const [staffEndHour, staffEndMin] = staffSchedule.end_time.split(":").map(Number);

  let dayStart = setMinutes(setHours(date, staffStartHour), staffStartMin);
  let dayEnd = setMinutes(setHours(date, staffEndHour), staffEndMin);

  // If practice hours exist, intersect with them
  if (practiceHours && practiceHours.length > 0) {
    const practiceHour = practiceHours.find((ph) => ph.weekday === weekday);

    if (!practiceHour) {
      // No practice hours set for this weekday - clinic is closed
      return null;
    }

    const [practiceStartHour, practiceStartMin] = practiceHour.start_time.split(":").map(Number);
    const [practiceEndHour, practiceEndMin] = practiceHour.end_time.split(":").map(Number);

    const practiceStart = setMinutes(setHours(date, practiceStartHour), practiceStartMin);
    const practiceEnd = setMinutes(setHours(date, practiceEndHour), practiceEndMin);

    // Take the later start time
    dayStart = isAfter(practiceStart, dayStart) ? practiceStart : dayStart;

    // Take the earlier end time
    dayEnd = isBefore(practiceEnd, dayEnd) ? practiceEnd : dayEnd;

    // If start is after end, there's no overlap - no working hours
    if (isAfter(dayStart, dayEnd) || dayStart.getTime() === dayEnd.getTime()) {
      return null;
    }
  }

  return { start: dayStart, end: dayEnd };
};

/**
 * Gets all blockers (appointments, breaks, and blocked time) for a day, sorted by start time
 */
const getDayBlockers = (
  checkDate: Date,
  appointments: Appointment[],
  breaks: StaffBreak[],
  blockedTime: BlockedTime[],
  dayStart: Date,
  dayEnd: Date
): { start: Date; end: Date }[] => {
  const blockers: { start: Date; end: Date }[] = [];
  const weekday = getWeekdayISO(checkDate);

  // Add appointments for this day
  appointments.forEach((apt) => {
    const aptStart = toUKTime(apt.starts_at);
    const aptEnd = toUKTime(apt.ends_at);

    // Only include appointments that are within this day's working hours
    if (
      isBefore(aptStart, dayEnd) &&
      isAfter(aptEnd, dayStart)
    ) {
      blockers.push({ start: aptStart, end: aptEnd });
    }
  });

  // Add blocked time for this day
  blockedTime.forEach((block) => {
    const blockStart = toUKTime(block.starts_at);
    const blockEnd = toUKTime(block.ends_at);

    // Only include blocks that are within this day's working hours
    if (
      isBefore(blockStart, dayEnd) &&
      isAfter(blockEnd, dayStart)
    ) {
      blockers.push({ start: blockStart, end: blockEnd });
    }
  });

  // Add breaks for this day
  breaks.forEach((brk) => {
    if (brk.weekday !== weekday) return;
    if (!isScheduleEffective(brk, checkDate)) return;

    const [breakStartHour, breakStartMin] = brk.start_time.split(":").map(Number);
    const [breakEndHour, breakEndMin] = brk.end_time.split(":").map(Number);

    const breakStart = setMinutes(setHours(checkDate, breakStartHour), breakStartMin);
    const breakEnd = setMinutes(setHours(checkDate, breakEndHour), breakEndMin);

    blockers.push({ start: breakStart, end: breakEnd });
  });

  // Sort by start time
  return blockers.sort((a, b) => a.start.getTime() - b.start.getTime());
};

/**
 * Optional booking policy applied to the slot search. Fetched from
 * app_settings and passed in by the caller so the engine stays pure.
 *   - minNoticeHours: patient-facing safety rail. Skip slots closer than
 *     N hours from now so a patient can't book a same-hour appointment.
 *   - maxAdvanceDays: cap how far ahead slots are shown so practices don't
 *     get bookings 18 months out.
 */
export interface BookingPolicy {
  minNoticeHours?: number;
  maxAdvanceDays?: number;
}

/**
 * Finds next available appointment slots for a staff member
 * Optimized to directly find gaps instead of checking every slot
 */
export const findNextAvailableSlots = (
  staffData: StaffAvailabilityData,
  services: Service[],
  daysToCheck: number = 14,
  maxSlots: number = 3,
  baseDate?: Date,
  policy?: BookingPolicy
): AvailableSlot[] => {
  const availableSlots: AvailableSlot[] = [];
  const now = toUKTime(new Date());
  const maxBufferBefore = Math.max(...services.map(s => s.buffer_before_minutes || 0), 0);

  // Determine which day to start checking from (defaults to today)
  const baseStart = startOfDay(toUKTime(baseDate ?? new Date()));

  // Effective earliest-booking point. Pushes "now" forward by the practice's
  // minimum notice window — so a 2h min-notice skips slots up to 2h out.
  const minNoticeHours = Math.max(0, policy?.minNoticeHours ?? 0);
  const earliestBookable =
    minNoticeHours > 0
      ? new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000)
      : now;

  // Cap the look-ahead horizon if the practice sets one. Passing 0 or
  // negative is treated as "no cap" by falling back to the requested days.
  const maxAdvance = policy?.maxAdvanceDays ?? 0;
  const effectiveDaysToCheck =
    maxAdvance > 0 ? Math.min(daysToCheck, maxAdvance) : daysToCheck;

  // Check each day
  for (
    let dayOffset = 0;
    dayOffset < effectiveDaysToCheck && availableSlots.length < maxSlots;
    dayOffset++
  ) {
    const checkDate = addDays(baseStart, dayOffset);
    const weekday = getWeekdayISO(checkDate);

    // Check if practice is closed on this date
    if (staffData.practiceClosures && isDateDuringClosure(checkDate, staffData.practiceClosures)) {
      continue;
    }

    // Find schedule for this weekday
    const daySchedule = staffData.schedules.find(
      (s) => s.weekday === weekday && isScheduleEffective(s, checkDate)
    );

    if (!daySchedule) continue;

    // Check if staff has time off
    if (isDateDuringTimeOff(checkDate, staffData.timeOff)) continue;

    // Get effective working hours (intersection of staff hours and practice hours)
    const workingHours = getEffectiveWorkingHours(checkDate, daySchedule, staffData.practiceHours);

    if (!workingHours) {
      // No working hours for this day (clinic closed or no overlap)
      continue;
    }

    const dayStart = workingHours.start;
    const dayEnd = workingHours.end;

    // Get all blockers (appointments + breaks + blocked time) for this day
    const blockers = getDayBlockers(checkDate, staffData.appointments, staffData.breaks, staffData.blockedTime, dayStart, dayEnd);

    // Find gaps between blockers
    let currentTime = dayStart;

    // If today's first bookable time (now + minNotice) falls inside the
    // working day, start there instead of dayStart — otherwise we'd offer
    // slots that violate the practice's notice window.
    if (isAfter(earliestBookable, dayStart) && !isAfter(earliestBookable, dayEnd)) {
      currentTime = earliestBookable;
    } else if (isAfter(earliestBookable, dayEnd)) {
      // Notice window pushes past end-of-day — nothing bookable today.
      continue;
    }

    // Check gap before first blocker
    if (blockers.length === 0) {
      // Entire day is free - generate slots every SLOT_DURATION minutes
      let slotTime = currentTime;
      while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
        const availableMinutes = differenceInMinutes(dayEnd, slotTime);
        const usableMinutes = availableMinutes - maxBufferBefore;
        const { fitsAll, fitsLimited } = calculateServiceFit(usableMinutes, services);

        if (fitsAll || fitsLimited) {
          const displayStart = addMinutes(slotTime, maxBufferBefore);
          availableSlots.push({
            date: displayStart,
            time: format(displayStart, "HH:mm"),
            availableMinutes,
            fitsAllServices: fitsAll,
            fitsLimitedServices: fitsLimited,
          });
        }

        slotTime = addMinutes(slotTime, SLOT_DURATION);
      }
    } else {
      // Check gap before first blocker - generate slots every SLOT_DURATION minutes
      if (isBefore(currentTime, blockers[0].start)) {
        let slotTime = currentTime;
        while (isBefore(slotTime, blockers[0].start) && availableSlots.length < maxSlots) {
          const availableMinutes = differenceInMinutes(blockers[0].start, slotTime);
          const usableMinutes = availableMinutes - maxBufferBefore;
          const { fitsAll, fitsLimited } = calculateServiceFit(usableMinutes, services);

          if (fitsAll || fitsLimited) {
            const displayStart = addMinutes(slotTime, maxBufferBefore);
            availableSlots.push({
              date: displayStart,
              time: format(displayStart, "HH:mm"),
              availableMinutes,
              fitsAllServices: fitsAll,
              fitsLimitedServices: fitsLimited,
            });
          }

          slotTime = addMinutes(slotTime, SLOT_DURATION);
        }
      }

      // Check gaps between blockers - generate slots every SLOT_DURATION minutes
      for (let i = 0; i < blockers.length - 1 && availableSlots.length < maxSlots; i++) {
        const gapStart = blockers[i].end;
        const gapEnd = blockers[i + 1].start;

        // Only consider this gap if it's in the future
        if (isAfter(gapStart, now) && isBefore(gapStart, gapEnd)) {
          let slotTime = gapStart;
          while (isBefore(slotTime, gapEnd) && availableSlots.length < maxSlots) {
            const availableMinutes = differenceInMinutes(gapEnd, slotTime);
            const usableMinutes = availableMinutes - maxBufferBefore;
            const { fitsAll, fitsLimited } = calculateServiceFit(usableMinutes, services);

            if (fitsAll || fitsLimited) {
              const displayStart = addMinutes(slotTime, maxBufferBefore);
              availableSlots.push({
                date: displayStart,
                time: format(displayStart, "HH:mm"),
                availableMinutes,
                fitsAllServices: fitsAll,
                fitsLimitedServices: fitsLimited,
              });
            }

            slotTime = addMinutes(slotTime, SLOT_DURATION);
          }
        }
      }

      // Check gap after last blocker - generate slots every SLOT_DURATION minutes
      const lastBlocker = blockers[blockers.length - 1];
      if (isAfter(lastBlocker.end, now) && isBefore(lastBlocker.end, dayEnd)) {
        let slotTime = lastBlocker.end;
        while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
          const availableMinutes = differenceInMinutes(dayEnd, slotTime);
          const usableMinutes = availableMinutes - maxBufferBefore;
          const { fitsAll, fitsLimited } = calculateServiceFit(usableMinutes, services);

          if (fitsAll || fitsLimited) {
            const displayStart = addMinutes(slotTime, maxBufferBefore);
            availableSlots.push({
              date: displayStart,
              time: format(displayStart, "HH:mm"),
              availableMinutes,
              fitsAllServices: fitsAll,
              fitsLimitedServices: fitsLimited,
            });
          }

          slotTime = addMinutes(slotTime, SLOT_DURATION);
        }
      }
    }
  }

  return availableSlots;
};

/**
 * Checks if a single service can fit in the available time
 */
export const canServiceFit = (
  availableMinutes: number,
  service: Service
): boolean => {
  const totalTimeNeeded =
    service.duration_minutes +
    (service.buffer_before_minutes || 0) +
    (service.buffer_after_minutes || 0);

  return availableMinutes >= totalTimeNeeded;
};

/**
 * Finds next available slots for a specific service
 * Optimized for dashboard - only checks one service at a time
 */
export const findNextSlotsForService = (
  staffData: StaffAvailabilityData,
  service: Service,
  daysToCheck: number = 28,
  maxSlots: number = 3,
  baseDate?: Date
): AvailableSlot[] => {
  const availableSlots: AvailableSlot[] = [];
  const now = toUKTime(new Date());
  const bufferBefore = service.buffer_before_minutes || 0;

  // Determine which day to start checking from (defaults to today)
  const baseStart = startOfDay(toUKTime(baseDate ?? new Date()));

  // Check each day
  for (
    let dayOffset = 0;
    dayOffset < daysToCheck && availableSlots.length < maxSlots;
    dayOffset++
  ) {
    const checkDate = addDays(baseStart, dayOffset);
    const weekday = getWeekdayISO(checkDate);

    // Check if practice is closed on this date
    if (staffData.practiceClosures && isDateDuringClosure(checkDate, staffData.practiceClosures)) {
      continue;
    }

    // Find schedule for this weekday
    const daySchedule = staffData.schedules.find(
      (s) => s.weekday === weekday && isScheduleEffective(s, checkDate)
    );

    if (!daySchedule) continue;

    // Check if staff has time off
    if (isDateDuringTimeOff(checkDate, staffData.timeOff)) continue;

    // Get effective working hours (intersection of staff hours and practice hours)
    const workingHours = getEffectiveWorkingHours(checkDate, daySchedule, staffData.practiceHours);

    if (!workingHours) {
      // No working hours for this day (clinic closed or no overlap)
      continue;
    }

    const dayStart = workingHours.start;
    const dayEnd = workingHours.end;

    // Get all blockers (appointments + breaks + blocked time) for this day
    const blockers = getDayBlockers(checkDate, staffData.appointments, staffData.breaks, staffData.blockedTime, dayStart, dayEnd);

    // Find gaps between blockers
    let currentTime = dayStart;

    // If we're checking today, start from now
    if (dayOffset === 0 && isAfter(now, dayStart)) {
      currentTime = now;
    }

    // Check gap before first blocker
    if (blockers.length === 0) {
      // Entire day is free - generate slots every SLOT_DURATION minutes
      let slotTime = currentTime;
      while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
        const availableMinutes = differenceInMinutes(dayEnd, slotTime);
        const usableMinutes = availableMinutes - bufferBefore;

        if (canServiceFit(usableMinutes, service)) {
          const displayStart = addMinutes(slotTime, bufferBefore);
          availableSlots.push({
            date: displayStart,
            time: format(displayStart, "HH:mm"),
            availableMinutes,
            fitsAllServices: true,
            fitsLimitedServices: false,
          });
        }

        slotTime = addMinutes(slotTime, SLOT_DURATION);
      }
    } else {
      // Check gap before first blocker
      if (isBefore(currentTime, blockers[0].start)) {
        let slotTime = currentTime;
        while (isBefore(slotTime, blockers[0].start) && availableSlots.length < maxSlots) {
          const availableMinutes = differenceInMinutes(blockers[0].start, slotTime);
          const usableMinutes = availableMinutes - bufferBefore;

          if (canServiceFit(usableMinutes, service)) {
            const displayStart = addMinutes(slotTime, bufferBefore);
            availableSlots.push({
              date: displayStart,
              time: format(displayStart, "HH:mm"),
              availableMinutes,
              fitsAllServices: true,
              fitsLimitedServices: false,
            });
          }

          slotTime = addMinutes(slotTime, SLOT_DURATION);
        }
      }

      // Check gaps between blockers
      for (let i = 0; i < blockers.length - 1 && availableSlots.length < maxSlots; i++) {
        const gapStart = blockers[i].end;
        const gapEnd = blockers[i + 1].start;

        // Only consider this gap if it's in the future
        if (isAfter(gapStart, now) && isBefore(gapStart, gapEnd)) {
          let slotTime = gapStart;
          while (isBefore(slotTime, gapEnd) && availableSlots.length < maxSlots) {
            const availableMinutes = differenceInMinutes(gapEnd, slotTime);
            const usableMinutes = availableMinutes - bufferBefore;

            if (canServiceFit(usableMinutes, service)) {
              const displayStart = addMinutes(slotTime, bufferBefore);
              availableSlots.push({
                date: displayStart,
                time: format(displayStart, "HH:mm"),
                availableMinutes,
                fitsAllServices: true,
                fitsLimitedServices: false,
              });
            }

            slotTime = addMinutes(slotTime, SLOT_DURATION);
          }
        }
      }

      // Check gap after last blocker
      const lastBlocker = blockers[blockers.length - 1];
      if (isAfter(lastBlocker.end, now) && isBefore(lastBlocker.end, dayEnd)) {
        let slotTime = lastBlocker.end;
        while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
          const availableMinutes = differenceInMinutes(dayEnd, slotTime);
          const usableMinutes = availableMinutes - bufferBefore;

          if (canServiceFit(usableMinutes, service)) {
            const displayStart = addMinutes(slotTime, bufferBefore);
            availableSlots.push({
              date: displayStart,
              time: format(displayStart, "HH:mm"),
              availableMinutes,
              fitsAllServices: true,
              fitsLimitedServices: false,
            });
          }

          slotTime = addMinutes(slotTime, SLOT_DURATION);
        }
      }
    }
  }

  return availableSlots;
};

/**
 * Filters for smart availability search
 */
export interface SmartAvailabilityFilters {
  serviceIds: string[]; // Services to check availability for
  staffIds?: string[]; // Optional: specific staff members (empty = all staff)
  dayOfWeek?: number; // Optional: 1-7 (Monday-Sunday), only show slots on this day
  timeOfDay?: "morning" | "afternoon"; // Optional: morning (before 12:00), afternoon (12:00+)
  startDate?: Date; // Optional: start searching from this date (default = today)
  weeksToCheck?: number; // Optional: how many weeks to search (default = 4)
  policy?: BookingPolicy; // Optional: practice booking policy (notice + horizon)
}

/**
 * Finds available slots across multiple staff members with advanced filtering
 * Used for smart availability finder on enquiry details
 */
export const findSlotsWithFilters = async (
  filters: SmartAvailabilityFilters,
  maxSlots: number = 3
): Promise<
  Array<{
    slot: AvailableSlot;
    staffId: string;
    staffName: string;
  }>
> => {
  const {
    serviceIds,
    staffIds,
    dayOfWeek,
    timeOfDay,
    startDate,
    weeksToCheck = 4,
    policy,
  } = filters;

  const now = toUKTime(new Date());
  const baseStart = startOfDay(toUKTime(startDate ?? new Date()));
  const daysToCheck = weeksToCheck * 7;

  // Load services
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .in("id", serviceIds)
    .eq("active", true);

  if (!services || services.length === 0) return [];

  // Get staff to check (all available for booking if not specified)
  const staffQuery = supabase
    .from("app_staff")
    .select("id, full_name")
    .eq("available_for_booking", true)
    .is("deleted_at", null)
    .order("full_name");

  if (staffIds && staffIds.length > 0) {
    staffQuery.in("id", staffIds);
  }

  const { data: staff } = await staffQuery;
  if (!staff || staff.length === 0) return [];

  const staffIdsToCheck = staff.map((s) => s.id);

  // Calculate date range
  const endDate = addDays(baseStart, daysToCheck);

  // Bulk load all data
  const [
    schedulesRes,
    breaksRes,
    timeOffRes,
    appointmentsRes,
    practiceHoursRes,
    practiceClosuresRes,
    blockedTimeRes,
  ] = await Promise.all([
    supabase
      .from("staff_availability")
      .select("*")
      .in("staff_id", staffIdsToCheck)
      .order("weekday"),
    supabase.from("staff_breaks").select("*").in("staff_id", staffIdsToCheck),
    supabase
      .from("staff_time_off")
      .select("starts_at, ends_at, staff_id")
      .in("staff_id", staffIdsToCheck)
      .lte("starts_at", endDate.toISOString())
      .gte("ends_at", now.toISOString()),
    supabase
      .from("appointment")
      .select("starts_at, ends_at, staff_id, service_id")
      .in("staff_id", staffIdsToCheck)
      .eq("status", "SCHEDULED")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", endDate.toISOString())
      .order("starts_at"),
    supabase
      .from("practice_hours")
      .select("weekday, start_time, end_time")
      .order("weekday"),
    supabase
      .from("practice_closures")
      .select("starts_at, ends_at, reason")
      .gte("ends_at", now.toISOString())
      .lte("starts_at", endDate.toISOString()),
    supabase
      .from("blocked_time")
      .select("starts_at, ends_at, staff_id")
      .in("staff_id", staffIdsToCheck)
      .gte("ends_at", now.toISOString())
      .lte("starts_at", endDate.toISOString()),
  ]);

  // Group data by staff_id
  const schedulesByStaff: Record<string, any[]> = {};
  const breaksByStaff: Record<string, any[]> = {};
  const timeOffByStaff: Record<string, any[]> = {};
  const appointmentsByStaff: Record<string, any[]> = {};
  const blockedTimeByStaff: Record<string, any[]> = {};

  schedulesRes.data?.forEach((s) => {
    if (!schedulesByStaff[s.staff_id]) schedulesByStaff[s.staff_id] = [];
    schedulesByStaff[s.staff_id].push(s);
  });

  breaksRes.data?.forEach((b) => {
    if (!breaksByStaff[b.staff_id]) breaksByStaff[b.staff_id] = [];
    breaksByStaff[b.staff_id].push(b);
  });

  timeOffRes.data?.forEach((t) => {
    if (!timeOffByStaff[t.staff_id]) timeOffByStaff[t.staff_id] = [];
    timeOffByStaff[t.staff_id].push(t);
  });

  appointmentsRes.data?.forEach((a) => {
    if (!appointmentsByStaff[a.staff_id])
      appointmentsByStaff[a.staff_id] = [];
    appointmentsByStaff[a.staff_id].push(a);
  });

  blockedTimeRes.data?.forEach((bt) => {
    if (!blockedTimeByStaff[bt.staff_id]) blockedTimeByStaff[bt.staff_id] = [];
    blockedTimeByStaff[bt.staff_id].push(bt);
  });

  // Collect all slots from all staff members
  const allSlots: Array<{
    slot: AvailableSlot;
    staffId: string;
    staffName: string;
  }> = [];

  for (const staffMember of staff) {
    const staffData: StaffAvailabilityData = {
      schedules: schedulesByStaff[staffMember.id] || [],
      breaks: breaksByStaff[staffMember.id] || [],
      timeOff: timeOffByStaff[staffMember.id] || [],
      blockedTime: blockedTimeByStaff[staffMember.id] || [],
      appointments: appointmentsByStaff[staffMember.id] || [],
      practiceHours: practiceHoursRes.data || [],
      practiceClosures: practiceClosuresRes.data || [],
    };

    // Get slots for this staff member (get more than needed for filtering)
    const slots = findNextAvailableSlots(
      staffData,
      services,
      daysToCheck,
      maxSlots * 10, // Get extra slots for filtering
      startDate,
      policy
    );

    // Apply additional filters
    const filteredSlots = slots.filter((slot) => {
      // Filter by day of week
      if (dayOfWeek !== undefined) {
        const slotDayOfWeek = getWeekdayISO(slot.date);
        if (slotDayOfWeek !== dayOfWeek) return false;
      }

      // Filter by time of day
      if (timeOfDay) {
        const [hours] = slot.time.split(":").map(Number);
        if (timeOfDay === "morning" && hours >= 12) return false;
        if (timeOfDay === "afternoon" && hours < 12) return false;
      }

      return true;
    });

    // Add to results with staff info
    filteredSlots.forEach((slot) => {
      allSlots.push({
        slot,
        staffId: staffMember.id,
        staffName: staffMember.full_name,
      });
    });
  }

  // Sort all slots by date/time
  allSlots.sort((a, b) => a.slot.date.getTime() - b.slot.date.getTime());

  // If filtering by specific day, we want to show the first slot from each occurrence of that day
  if (dayOfWeek !== undefined) {
    const slotsByDate = new Map<string, typeof allSlots[0]>();

    for (const item of allSlots) {
      const dateKey = format(item.slot.date, "yyyy-MM-dd");
      if (!slotsByDate.has(dateKey)) {
        slotsByDate.set(dateKey, item);
      }
    }

    return Array.from(slotsByDate.values()).slice(0, maxSlots);
  }

  // Return first N slots
  return allSlots.slice(0, maxSlots);
};

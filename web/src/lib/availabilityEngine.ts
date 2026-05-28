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
 * Rounds a slot-start time UP to the next clock-aligned boundary
 * (multiples of SLOT_DURATION — currently 30 min, so :00 / :30).
 *
 * Why: the gap-finding logic naturally produces slot starts at arbitrary
 * minute offsets — e.g. an appointment ending at 12:41 yields a 12:41
 * slot, then 13:11, 13:41, etc. Patients and staff think in clock-aligned
 * terms ("1 pm") not appointment-anchored ones, so we snap forward to the
 * next :00 or :30. The gap-time lost (a few minutes at most) gives the
 * previous appointment a small overrun grace and keeps the slot menu
 * sane. Idempotent on already-aligned inputs.
 */
function alignSlotStartUp(t: Date): Date {
  const m = t.getMinutes();
  const s = t.getSeconds();
  const ms = t.getMilliseconds();
  if (m % SLOT_DURATION === 0 && s === 0 && ms === 0) return t;
  const aligned = new Date(t);
  aligned.setMinutes(m + (SLOT_DURATION - (m % SLOT_DURATION)), 0, 0);
  return aligned;
}

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
 * Like calculateServiceFit, but assumes `availableMinutes` is measured
 * FROM PATIENT ARRIVAL (= the slot's display time) onwards. Buffer-before
 * is treated as already-spent (it sits in the gap behind the arrival
 * time), so only `duration + buffer_after` needs to fit.
 *
 * Use this when the slot's `slotTime` represents the patient's arrival
 * time on the clock grid (e.g. 15:00), not the raw start of the gap.
 * Avoids the double-counting bug where `availableMinutes - bufferBefore`
 * was checked against `duration + bufferBefore + bufferAfter`, making
 * bufferBefore eat into the slot twice.
 */
const calculateServiceFitFromArrival = (
  availableMinutes: number,
  services: Service[],
): { fitsAll: boolean; fitsLimited: boolean } => {
  if (services.length === 0) {
    return { fitsAll: false, fitsLimited: false };
  }
  const requirements = services.map(
    (s) => s.duration_minutes + (s.buffer_after_minutes || 0),
  );
  const max = Math.max(...requirements, 0);
  const min = Math.min(...requirements, Infinity);
  const fitsAll = availableMinutes >= max;
  const fitsLimited = availableMinutes >= min && !fitsAll;
  return { fitsAll, fitsLimited };
};

/** Single-service version of calculateServiceFitFromArrival. */
const canServiceFitFromArrival = (
  availableMinutes: number,
  service: Service,
): boolean => {
  return availableMinutes >= service.duration_minutes + (service.buffer_after_minutes || 0);
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

    // The fetcher normalises the dentaloptima-core open_time/close_time
    // columns onto the legacy start_time/end_time names declared on the
    // PracticeHours type, so the engine reads them via the unified field.
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

    // Slot generation model: `slotTime` is the patient ARRIVAL time —
    // the value displayed in the picker and stored as the appointment's
    // starts_at. `bufferBefore` sits in the gap behind the arrival
    // (between the previous blocker's end and the arrival); the patient
    // walks in AT `slotTime`. So the fit check is `(gapEnd - slotTime)
    // >= duration + bufferAfter`, NOT (… >= duration + bufferBefore +
    // bufferAfter). Earlier code did the latter, which double-counted
    // bufferBefore and also pushed displayStart off the clock grid by
    // adding bufferBefore on the way out — that's what produced slots
    // like 14:35 / 15:05 / 15:35 for a 5-min buffer.

    // Entire day is free
    if (blockers.length === 0) {
      // No previous blocker to leave bufferBefore room for. Start at
      // currentTime (= dayStart, or earliestBookable if min-notice is
      // pushing past dayStart) and align up to the clock grid.
      let slotTime = alignSlotStartUp(currentTime);
      while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
        const remaining = differenceInMinutes(dayEnd, slotTime);
        const { fitsAll, fitsLimited } = calculateServiceFitFromArrival(remaining, services);
        if (fitsAll || fitsLimited) {
          availableSlots.push({
            date: slotTime,
            time: format(slotTime, "HH:mm"),
            availableMinutes: remaining,
            fitsAllServices: fitsAll,
            fitsLimitedServices: fitsLimited,
          });
        }
        slotTime = addMinutes(slotTime, SLOT_DURATION);
      }
    } else {
      // Gap before first blocker — same as entire-day-free: no preceding
      // blocker, so no bufferBefore room needed at the start.
      if (isBefore(currentTime, blockers[0].start)) {
        let slotTime = alignSlotStartUp(currentTime);
        while (isBefore(slotTime, blockers[0].start) && availableSlots.length < maxSlots) {
          const remaining = differenceInMinutes(blockers[0].start, slotTime);
          const { fitsAll, fitsLimited } = calculateServiceFitFromArrival(remaining, services);
          if (fitsAll || fitsLimited) {
            availableSlots.push({
              date: slotTime,
              time: format(slotTime, "HH:mm"),
              availableMinutes: remaining,
              fitsAllServices: fitsAll,
              fitsLimitedServices: fitsLimited,
            });
          }
          slotTime = addMinutes(slotTime, SLOT_DURATION);
        }
      }

      // Gaps between blockers — there IS a preceding blocker, so leave
      // bufferBefore room between gapStart and the patient's arrival.
      for (let i = 0; i < blockers.length - 1 && availableSlots.length < maxSlots; i++) {
        const gapStart = blockers[i].end;
        const gapEnd = blockers[i + 1].start;
        // We only need the gap-END to be in the future. If we're already
        // inside the gap (gapStart < now < gapEnd), there's still bookable
        // time from `now` to gapEnd — previously this branch skipped any
        // gap whose start was in the past, leaving the user with "no
        // slots" after a morning appointment had passed.
        if (isAfter(gapEnd, now) && isBefore(gapStart, gapEnd)) {
          // First valid arrival = gapStart + bufferBefore (prep time after
          // the previous appointment ends), clamped to `now` so we don't
          // offer past slots, then aligned to the clock grid.
          const earliestArrival = addMinutes(gapStart, maxBufferBefore);
          const effectiveStart = isAfter(now, earliestArrival) ? now : earliestArrival;
          let slotTime = alignSlotStartUp(effectiveStart);
          while (isBefore(slotTime, gapEnd) && availableSlots.length < maxSlots) {
            const remaining = differenceInMinutes(gapEnd, slotTime);
            const { fitsAll, fitsLimited } = calculateServiceFitFromArrival(remaining, services);
            if (fitsAll || fitsLimited) {
              availableSlots.push({
                date: slotTime,
                time: format(slotTime, "HH:mm"),
                availableMinutes: remaining,
                fitsAllServices: fitsAll,
                fitsLimitedServices: fitsLimited,
              });
            }
            slotTime = addMinutes(slotTime, SLOT_DURATION);
          }
        }
      }

      // Gap after last blocker — same bufferBefore behaviour as
      // between-blockers (preceding appointment needs cleanup time).
      const lastBlocker = blockers[blockers.length - 1];
      // Need dayEnd in the future (else nothing bookable today) AND
      // blocker.end before dayEnd (else there's no gap). Previously
      // this required blocker.end > now, which wrongly excluded the
      // post-blocker gap whenever the user was already inside it.
      if (isAfter(dayEnd, now) && isBefore(lastBlocker.end, dayEnd)) {
        const earliestArrival = addMinutes(lastBlocker.end, maxBufferBefore);
        const effectiveStart = isAfter(now, earliestArrival) ? now : earliestArrival;
        let slotTime = alignSlotStartUp(effectiveStart);
        while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
          const remaining = differenceInMinutes(dayEnd, slotTime);
          const { fitsAll, fitsLimited } = calculateServiceFitFromArrival(remaining, services);
          if (fitsAll || fitsLimited) {
            availableSlots.push({
              date: slotTime,
              time: format(slotTime, "HH:mm"),
              availableMinutes: remaining,
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

    // See findNextAvailableSlots above for the slotTime/displayStart
    // model — same semantics applied here for the single-service path.

    // Entire day free
    if (blockers.length === 0) {
      let slotTime = alignSlotStartUp(currentTime);
      while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
        const remaining = differenceInMinutes(dayEnd, slotTime);
        if (canServiceFitFromArrival(remaining, service)) {
          availableSlots.push({
            date: slotTime,
            time: format(slotTime, "HH:mm"),
            availableMinutes: remaining,
            fitsAllServices: true,
            fitsLimitedServices: false,
          });
        }
        slotTime = addMinutes(slotTime, SLOT_DURATION);
      }
    } else {
      // Gap before first blocker
      if (isBefore(currentTime, blockers[0].start)) {
        let slotTime = alignSlotStartUp(currentTime);
        while (isBefore(slotTime, blockers[0].start) && availableSlots.length < maxSlots) {
          const remaining = differenceInMinutes(blockers[0].start, slotTime);
          if (canServiceFitFromArrival(remaining, service)) {
            availableSlots.push({
              date: slotTime,
              time: format(slotTime, "HH:mm"),
              availableMinutes: remaining,
              fitsAllServices: true,
              fitsLimitedServices: false,
            });
          }
          slotTime = addMinutes(slotTime, SLOT_DURATION);
        }
      }

      // Gaps between blockers — see findNextAvailableSlots for the
      // gapEnd-vs-now condition; same fix applied here.
      for (let i = 0; i < blockers.length - 1 && availableSlots.length < maxSlots; i++) {
        const gapStart = blockers[i].end;
        const gapEnd = blockers[i + 1].start;
        if (isAfter(gapEnd, now) && isBefore(gapStart, gapEnd)) {
          const earliestArrival = addMinutes(gapStart, bufferBefore);
          const effectiveStart = isAfter(now, earliestArrival) ? now : earliestArrival;
          let slotTime = alignSlotStartUp(effectiveStart);
          while (isBefore(slotTime, gapEnd) && availableSlots.length < maxSlots) {
            const remaining = differenceInMinutes(gapEnd, slotTime);
            if (canServiceFitFromArrival(remaining, service)) {
              availableSlots.push({
                date: slotTime,
                time: format(slotTime, "HH:mm"),
                availableMinutes: remaining,
                fitsAllServices: true,
                fitsLimitedServices: false,
              });
            }
            slotTime = addMinutes(slotTime, SLOT_DURATION);
          }
        }
      }

      // Gap after last blocker — see findNextAvailableSlots for the
      // dayEnd-vs-now condition; same fix applied here.
      const lastBlocker = blockers[blockers.length - 1];
      if (isAfter(dayEnd, now) && isBefore(lastBlocker.end, dayEnd)) {
        const earliestArrival = addMinutes(lastBlocker.end, bufferBefore);
        const effectiveStart = isAfter(now, earliestArrival) ? now : earliestArrival;
        let slotTime = alignSlotStartUp(effectiveStart);
        while (isBefore(slotTime, dayEnd) && availableSlots.length < maxSlots) {
          const remaining = differenceInMinutes(dayEnd, slotTime);
          if (canServiceFitFromArrival(remaining, service)) {
            availableSlots.push({
              date: slotTime,
              time: format(slotTime, "HH:mm"),
              availableMinutes: remaining,
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
    .from("service")
    .select("*")
    .in("id", serviceIds)
    .eq("is_active", true);

  if (!services || services.length === 0) return [];

  // Get staff to check (all available for booking if not specified)
  const staffQuery = supabase
    .from("practice_member")
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
    supabase.from("staff_break").select("*").in("staff_id", staffIdsToCheck),
    // staff_time_off uses date-only starts_on/ends_on (not timestamp) — the
    // dentaloptima-core schema renamed these from the legacy starts_at/ends_at.
    supabase
      .from("staff_time_off")
      .select("starts_on, ends_on, staff_id")
      .in("staff_id", staffIdsToCheck)
      .lte("starts_on", endDate.toISOString().slice(0, 10))
      .gte("ends_on", now.toISOString().slice(0, 10)),
    // appointment no longer has service_id — services moved to the
    // appointment_service join table when the schema went many-to-many.
    // The engine only uses starts_at/ends_at for collision detection.
    supabase
      .from("appointment")
      .select("starts_at, ends_at, staff_id")
      .in("staff_id", staffIdsToCheck)
      .in("status", ["SCHEDULED", "CONFIRMED", "ARRIVED", "IN_PROGRESS"])
      .is("deleted_at", null)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", endDate.toISOString())
      .order("starts_at"),
    supabase
      .from("practice_hours")
      .select("weekday, open_time, close_time")
      .is("effective_to", null)
      .order("weekday"),
    // practice_closure also uses date-only starts_on/ends_on.
    supabase
      .from("practice_closure")
      .select("starts_on, ends_on, reason")
      .gte("ends_on", now.toISOString().slice(0, 10))
      .lte("starts_on", endDate.toISOString().slice(0, 10)),
    supabase
      .from("blocked_time")
      .select("starts_at, ends_at, staff_id")
      .in("staff_id", staffIdsToCheck)
      .gte("ends_at", now.toISOString())
      .lte("starts_at", endDate.toISOString()),
  ]);

  // The engine downstream still speaks the legacy column shape: weekday as
  // ISO int (1-7, not 'MON'/'TUE'/...), starts_at/ends_at on time-off and
  // closures (not date-only). Translate once here so the engine doesn't
  // need to know about the schema rename. Mirrors availabilityDataFetcher.
  const WEEKDAY_TO_INT: Record<string, number> = {
    MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7,
  };
  const weekdayInt = (w: unknown): number =>
    typeof w === "number" ? w : typeof w === "string" ? (WEEKDAY_TO_INT[w] ?? 0) : 0;
  const dateStartIso = (d: string) => `${d}T00:00:00`;
  const dateEndIso = (d: string) => `${d}T23:59:59`;

  // Mutate the result rows in place so the existing grouping below stays
  // unchanged — staff_id is preserved, only the timestamp/weekday fields
  // are reshaped to the engine's expected names.
  schedulesRes.data = (schedulesRes.data ?? []).map((r: any) => ({
    ...r,
    weekday: weekdayInt(r.weekday),
  }));
  breaksRes.data = (breaksRes.data ?? []).map((r: any) => ({
    ...r,
    weekday: weekdayInt(r.weekday),
  }));
  timeOffRes.data = (timeOffRes.data ?? []).map((r: any) => ({
    staff_id: r.staff_id,
    starts_at: dateStartIso(r.starts_on),
    ends_at: dateEndIso(r.ends_on),
  }));
  practiceHoursRes.data = (practiceHoursRes.data ?? [])
    .filter((r: any) => r.open_time && r.close_time)
    .map((r: any) => ({
      weekday: weekdayInt(r.weekday),
      start_time: r.open_time,
      end_time: r.close_time,
    }));
  practiceClosuresRes.data = (practiceClosuresRes.data ?? []).map((r: any) => ({
    starts_at: dateStartIso(r.starts_on),
    ends_at: dateEndIso(r.ends_on),
    reason: r.reason ?? null,
  }));

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

import { toZonedTime } from "date-fns-tz";
import type { Appointment } from "@/hooks/useAppointments";
import { UK_TIMEZONE } from "@/lib/constants";

export const getWeekdayISO = (date: Date) => (date.getDay() === 0 ? 7 : date.getDay());

export const checkAppointmentOverlap = (
  appointment: Appointment,
  allAppointments: Appointment[]
) => {
  // Early return for resolved appointments
  const resolvedStatuses = ["CANCELLED", "NO_SHOW", "COMPLETED"];
  if (resolvedStatuses.includes(appointment.status) || !appointment.staff) return false;

  const aptStart = new Date(appointment.starts_at).getTime();
  const aptEnd = new Date(appointment.ends_at).getTime();

  // Pre-filter to only SCHEDULED appointments for the same staff
  const scheduledSameStaff = allAppointments.filter(
    (other) => 
      other.id !== appointment.id &&
      other.status === "SCHEDULED" &&
      other.staff?.id === appointment.staff.id
  );

  return scheduledSameStaff.some((other) => {
    const otherStart = new Date(other.starts_at).getTime();
    const otherEnd = new Date(other.ends_at).getTime();

    return (
      (aptStart >= otherStart && aptStart < otherEnd) ||
      (aptEnd > otherStart && aptEnd <= otherEnd) ||
      (aptStart <= otherStart && aptEnd >= otherEnd)
    );
  });
};

export const hasBreakConflict = (
  apt: Appointment,
  breaksMap: Record<string, { start: number; end: number }[]>
) => {
  const start = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
  const end = toZonedTime(new Date(apt.ends_at), UK_TIMEZONE);
  const weekday = getWeekdayISO(start);
  const key = `${apt.staff.id}-${weekday}`;
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const breaks = breaksMap[key] || [];
  return breaks.some((b) => (
    (startMin >= b.start && startMin < b.end) ||
    (endMin > b.start && endMin <= b.end) ||
    (startMin <= b.start && endMin >= b.end)
  ));
};

export const isOutsideWorkingHours = (
  apt: Appointment,
  availabilityMap: Record<string, { start: number; end: number }>
) => {
  const start = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
  const weekday = getWeekdayISO(start);
  const key = `${apt.staff.id}-${weekday}`;
  const avail = availabilityMap[key];
  if (!avail) return true;
  const startMin = start.getHours() * 60 + start.getMinutes();
  return startMin < avail.start || startMin >= avail.end;
};

export const hasAppointmentWarning = (
  apt: Appointment,
  allAppointments: Appointment[],
  breaksMap: Record<string, { start: number; end: number }[]>,
  availabilityMap: Record<string, { start: number; end: number }>
) => {
  // Don't show warnings for resolved appointments
  const resolvedStatuses = ["CANCELLED", "NO_SHOW", "COMPLETED"];
  if (resolvedStatuses.includes(apt.status)) return false;

  const overlap = checkAppointmentOverlap(apt, allAppointments);
  const breakConflict = hasBreakConflict(apt, breaksMap);
  const outside = isOutsideWorkingHours(apt, availabilityMap);
  // Services live in the `appointment_service` join now; a missing/empty
  // `services` array means we couldn't price or duration-check the slot.
  const missingService = !apt.services || apt.services.length === 0;
  return overlap || breakConflict || outside || missingService;
};

// Visual language for each appointment status. Covers all 8 enum values
// (SCHEDULED → CONFIRMED → ARRIVED → IN_PROGRESS → COMPLETED, plus
// CANCELLED / NO_SHOW / RESCHEDULED). Each one gets a distinct hue so an
// operator scanning the calendar can tell at a glance which appointments
// still need confirming vs. are already through the door.
export const getStatusColor = (status: string, hasOverlap: boolean = false) => {
  if (hasOverlap) {
    return {
      bg: "bg-red-50 dark:bg-red-950/20",
      hover: "hover:bg-red-100 dark:hover:bg-red-950/30",
      border: "border-red-500",
    };
  }

  switch (status) {
    case "CONFIRMED":
      // Patient has confirmed — locked-in. Teal sits between SCHEDULED blue
      // and COMPLETED green to read as "on the way to done".
      return {
        bg: "bg-teal-50 dark:bg-teal-950/20",
        hover: "hover:bg-teal-100 dark:hover:bg-teal-950/30",
        border: "border-teal-500",
      };
    case "ARRIVED":
      // In the practice, waiting. Amber = active state, needs attention.
      return {
        bg: "bg-amber-50 dark:bg-amber-950/20",
        hover: "hover:bg-amber-100 dark:hover:bg-amber-950/30",
        border: "border-amber-500",
      };
    case "IN_PROGRESS":
      // Treatment is happening right now.
      return {
        bg: "bg-purple-50 dark:bg-purple-950/20",
        hover: "hover:bg-purple-100 dark:hover:bg-purple-950/30",
        border: "border-purple-500",
      };
    case "COMPLETED":
      return {
        bg: "bg-green-50 dark:bg-green-950/20",
        hover: "hover:bg-green-100 dark:hover:bg-green-950/30",
        border: "border-green-600",
      };
    case "CANCELLED":
      return {
        bg: "bg-gray-100 dark:bg-gray-800/50",
        hover: "hover:bg-gray-200 dark:hover:bg-gray-800/70",
        border: "border-gray-400",
      };
    case "NO_SHOW":
      return {
        bg: "bg-orange-50 dark:bg-orange-950/20",
        hover: "hover:bg-orange-100 dark:hover:bg-orange-950/30",
        border: "border-orange-500",
      };
    case "RESCHEDULED":
      // Tombstone — the live appointment is at rescheduled_to_id. Muted
      // indigo so operators see "this slot used to be here" without it
      // visually competing with active appointments.
      return {
        bg: "bg-indigo-50/60 dark:bg-indigo-950/10",
        hover: "hover:bg-indigo-100/70 dark:hover:bg-indigo-950/20",
        border: "border-indigo-400",
      };
    case "SCHEDULED":
    default:
      return {
        bg: "bg-blue-50 dark:bg-blue-950/20",
        hover: "hover:bg-blue-100 dark:hover:bg-blue-950/30",
        border: "border-blue-500",
      };
  }
};

export const getStatusTextColor = (status: string) => {
  switch (status) {
    case "CONFIRMED":   return "text-teal-700 dark:text-teal-400";
    case "ARRIVED":     return "text-amber-700 dark:text-amber-400";
    case "IN_PROGRESS": return "text-purple-700 dark:text-purple-400";
    case "COMPLETED":   return "text-green-700 dark:text-green-400";
    case "CANCELLED":   return "text-red-700 dark:text-red-400";
    case "NO_SHOW":     return "text-orange-700 dark:text-orange-400";
    case "RESCHEDULED": return "text-indigo-600 dark:text-indigo-400";
    case "SCHEDULED":
    default:            return "text-blue-700 dark:text-blue-400";
  }
};

// Shared constants across the application

/**
 * Get the configured clinic timezone
 * This is loaded from app_settings on app startup and cached
 * Defaults to Europe/London if not configured
 */
let CACHED_TIMEZONE = "Europe/London";

export function setClinicTimezone(timezone: string) {
  CACHED_TIMEZONE = timezone;
}

export function getClinicTimezone(): string {
  return CACHED_TIMEZONE;
}

/**
 * Legacy constant - kept for backwards compatibility
 * IMPORTANT: Use getClinicTimezone() for dynamic timezone support
 * This constant will always be "Europe/London" for compatibility
 */
export const UK_TIMEZONE = "Europe/London";

export const SLOT_DURATION = 30; // minutes

// Appointment statuses (for appointment table)
export const APPOINTMENT_STATUS = {
  SCHEDULED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

// Booking request statuses (for booking_request table)
export const BOOKING_REQUEST_STATUS = {
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  WAITLIST: "WAITLIST",
} as const;

export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUS)[keyof typeof BOOKING_REQUEST_STATUS];

// Staff roles
export const STAFF_ROLE = {
  ADMIN: "admin",
  STAFF: "staff",
} as const;

export type StaffRole = (typeof STAFF_ROLE)[keyof typeof STAFF_ROLE];

// Badge variants mapping
export const STATUS_TO_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  NEW: "default", // Blue - brand new, needs attention
  VIEWED: "secondary", // Purple/accent - has been seen
  IN_PROGRESS: "outline", // Muted - being worked on
  SCHEDULED: "default",
  CONFIRMED: "secondary",
  COMPLETED: "outline",
  CANCELLED: "destructive",
  REJECTED: "destructive",
  NO_SHOW: "destructive",
  WAITLIST: "secondary",
};

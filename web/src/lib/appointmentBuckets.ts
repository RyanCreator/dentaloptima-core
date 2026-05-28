// Classifies a today's-list appointment into a UX bucket the Dashboard
// renders as its own section. "Late" isn't a DB status — it's a derived
// state: still SCHEDULED/CONFIRMED but the planned start has passed.
// Keeping it computed means no migration and no risk of stuck-LATE rows
// (the row "un-lates" itself the moment the operator marks ARRIVED).

export type AppointmentBucket =
  | "in_treatment" // IN_PROGRESS — currently being seen
  | "waiting"     // ARRIVED — checked in, in the waiting room
  | "late"        // SCHEDULED/CONFIRMED + starts_at < now
  | "upcoming"    // SCHEDULED/CONFIRMED + starts_at >= now
  | "cancelled"   // CANCELLED / NO_SHOW / RESCHEDULED — didn't happen today
  | "completed";  // COMPLETED — successfully finished

export interface BucketableAppointment {
  status: string;
  starts_at: string;
}

export function getAppointmentBucket(
  apt: BucketableAppointment,
  now: Date,
): AppointmentBucket {
  switch (apt.status) {
    case "IN_PROGRESS":
      return "in_treatment";
    case "ARRIVED":
      return "waiting";
    case "SCHEDULED":
    case "CONFIRMED":
      return new Date(apt.starts_at).getTime() < now.getTime() ? "late" : "upcoming";
    case "COMPLETED":
      return "completed";
    default:
      return "cancelled";
  }
}

/**
 * Minutes the patient is currently late by (positive) or how soon they're
 * arriving (negative). Used by the "Late" section to show "12 min late".
 */
export function minutesLate(apt: BucketableAppointment, now: Date): number {
  return Math.round((now.getTime() - new Date(apt.starts_at).getTime()) / 60_000);
}

/** Whether a status is one the operator can act on (vs. a finished one). */
export function isActionableStatus(status: string): boolean {
  return ![
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
    "RESCHEDULED",
  ].includes(status);
}

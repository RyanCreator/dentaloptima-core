import { format, differenceInMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusColor, getStatusTextColor } from "@/lib/appointmentUtils";
import type { Appointment } from "@/hooks/useAppointments";
import { UK_TIMEZONE } from "@/lib/constants";

interface AppointmentCardProps {
  appointment: Appointment;
  hasOverlap: boolean;
  hasWarning: boolean;
  onClick: (e?: React.MouseEvent) => void;
  variant?: "day" | "week" | "month";
}

// Convenience: an appointment may have many services in the new schema.
// Pull the primary one (lowest display_order) for the headline label,
// and count the rest for a "+N more" badge.
function summariseServices(appt: Appointment): {
  primaryName: string;
  extraCount: number;
  anyNhs: boolean;
} {
  const services = appt.services ?? [];
  if (services.length === 0) {
    return { primaryName: "(no service)", extraCount: 0, anyNhs: false };
  }
  return {
    primaryName: services[0].service.name,
    extraCount: services.length - 1,
    anyNhs: services.some((s) => s.service.is_nhs),
  };
}

export function AppointmentCard({
  appointment,
  hasOverlap,
  hasWarning,
  onClick,
  variant = "day",
}: AppointmentCardProps) {
  const statusColors = getStatusColor(appointment.status, hasOverlap);
  const startTime = toZonedTime(new Date(appointment.starts_at), UK_TIMEZONE);
  const endTime = toZonedTime(new Date(appointment.ends_at), UK_TIMEZONE);
  // Duration from the actual booked window — more reliable than per-service
  // duration when there are multiple services on the appointment.
  const durationMinutes = differenceInMinutes(endTime, startTime);
  const summary = summariseServices(appointment);
  const accentColor = appointment.staff.color_hex || "hsl(var(--primary))";

  if (variant === "day") {
    return (
      <button
        onClick={(e) => onClick(e)}
        className={cn(
          "w-full text-left p-3 sm:p-4 transition-colors flex items-start gap-3 sm:gap-4 border-l-4",
          statusColors.bg,
          statusColors.hover,
          statusColors.border,
        )}
      >
        <div className="flex flex-col items-start min-w-[70px] sm:min-w-[85px] pt-1">
          <div className="text-xs sm:text-sm font-medium whitespace-nowrap">
            {format(startTime, "HH:mm")} - {format(endTime, "HH:mm")}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {durationMinutes} min
          </div>
        </div>
        <div
          className="w-1 rounded-full flex-shrink-0 self-stretch"
          style={{ backgroundColor: hasOverlap ? "#ef4444" : accentColor }}
        />
        <div className="flex-1 min-w-0 py-0.5">
          <div className="font-medium mb-1 text-sm sm:text-base">
            {appointment.patient.full_name}
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center gap-1.5 flex-wrap">
            <span>{summary.primaryName}</span>
            {summary.extraCount > 0 && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">
                +{summary.extraCount} more
              </span>
            )}
            {summary.anyNhs && (
              <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 font-medium leading-none">NHS</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {appointment.staff.full_name ?? "Unassigned"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={cn(
            "text-[10px] sm:text-xs whitespace-nowrap font-medium",
            getStatusTextColor(appointment.status),
          )}>
            {appointment.status}
          </div>
          {hasWarning && (
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Appointment warning" />
          )}
        </div>
      </button>
    );
  }

  if (variant === "week") {
    return (
      <button
        onClick={(e) => onClick(e)}
        className={cn(
          "w-full text-left p-1.5 sm:p-2 rounded text-xs transition-colors",
          statusColors.bg,
          statusColors.hover,
        )}
        style={{
          borderLeft: `3px solid ${hasOverlap ? "#ef4444" : accentColor}`,
        }}
      >
        <div className="font-medium truncate text-xs">
          {format(startTime, "HH:mm")}
          {hasWarning && (
            <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-amber-500" aria-hidden />
          )}
        </div>
        <div className="text-muted-foreground truncate text-xs hidden sm:block">
          {appointment.patient.full_name}
        </div>
      </button>
    );
  }

  // month variant
  return (
    <button
      onClick={(e) => onClick(e)}
      className={cn(
        "w-full text-left px-0.5 sm:px-1 py-0.5 rounded text-[10px] sm:text-xs transition-colors truncate",
        statusColors.bg,
        statusColors.hover,
      )}
    >
      <span className="hidden sm:inline">
        {format(startTime, "HH:mm")}
        {hasOverlap && <span className="ml-1 text-red-600 dark:text-red-400">⚠</span>}
      </span>
      <span className="sm:hidden">•</span>
    </button>
  );
}

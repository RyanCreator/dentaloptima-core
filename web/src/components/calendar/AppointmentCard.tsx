import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { AlertTriangle, Heart } from "lucide-react";
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

  if (variant === "day") {
    return (
      <button
        onClick={(e) => onClick(e)}
        className={cn(
          "w-full text-left p-3 sm:p-4 transition-colors flex items-start gap-3 sm:gap-4 border-l-4",
          statusColors.bg,
          statusColors.hover,
          statusColors.border
        )}
      >
        <div className="flex flex-col items-start min-w-[70px] sm:min-w-[85px] pt-1">
          <div className="text-xs sm:text-sm font-medium whitespace-nowrap">
            {format(startTime, "HH:mm")} - {format(endTime, "HH:mm")}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {appointment.service.duration_minutes} min
          </div>
        </div>
        <div
          className="w-1 rounded-full flex-shrink-0 self-stretch"
          style={{
            backgroundColor: hasOverlap ? "#ef4444" : (appointment.staff.colour_tag || "hsl(var(--primary))"),
          }}
        />
        <div className="flex-1 min-w-0 py-0.5">
          <div className="font-medium mb-1 text-sm sm:text-base flex items-center gap-1.5">
            {appointment.patient.full_name}
            {appointment.patient.is_pregnant && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-medium leading-none">
                <AlertTriangle className="h-3 w-3" />Pregnant
              </span>
            )}
            {appointment.patient.takes_anticoagulant && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-800 rounded px-1.5 py-0.5 font-medium leading-none">
                <Heart className="h-3 w-3" />Anticoagulant
              </span>
            )}
            {appointment.patient.no_show_count >= 3 && (
              <span className="inline-flex items-center text-[10px] bg-gray-200 text-gray-800 rounded px-1.5 py-0.5 font-medium leading-none">
                {appointment.patient.no_show_count} no-shows
              </span>
            )}
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center gap-1.5">
            {appointment.service.name}
            {appointment.service.is_nhs && (
              <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 font-medium leading-none">NHS</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {appointment.staff.full_name}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={cn(
            "text-[10px] sm:text-xs whitespace-nowrap font-medium",
            getStatusTextColor(appointment.status)
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
          statusColors.hover
        )}
        style={{
          borderLeft: `3px solid ${hasOverlap ? "#ef4444" : (appointment.staff.colour_tag || "hsl(var(--primary))")}`,
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
        statusColors.hover
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

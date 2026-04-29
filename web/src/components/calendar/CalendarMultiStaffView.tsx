import { useState, useEffect } from "react";
import { format, isSameDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/hooks/useAppointments";
import type { BlockedTimeEntry } from "@/hooks/useBlockedTime";
import { UK_TIMEZONE } from "@/lib/constants";

interface CalendarMultiStaffViewProps {
  selectedDay: Date;
  appointments: Appointment[];
  blockedTimeEntries: BlockedTimeEntry[];
  staff: any[];
  onAppointmentClick: (apt: Appointment) => void;
  checkOverlap: (apt: Appointment) => boolean;
  checkWarning: (apt: Appointment) => boolean;
  startHour?: number;
  endHour?: number;
}

export function CalendarMultiStaffView({
  selectedDay,
  appointments,
  blockedTimeEntries,
  staff,
  onAppointmentClick,
  checkOverlap,
  checkWarning,
  startHour = 8,
  endHour = 20,
}: CalendarMultiStaffViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Check if selected day is today
  const today = toZonedTime(new Date(), UK_TIMEZONE);
  const isToday = isSameDay(selectedDay, today);

  // Generate hour slots
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i
  );

  // Group appointments by staff
  const appointmentsByStaff = appointments.reduce((acc, apt) => {
    const staffId = apt.staff?.id || "unknown";
    if (!acc[staffId]) acc[staffId] = [];
    acc[staffId].push(apt);
    return acc;
  }, {} as Record<string, Appointment[]>);

  // Group blocked time by staff
  const blockedTimeByStaff = blockedTimeEntries.reduce((acc, block) => {
    const staffId = block.staff_id || "unknown";
    if (!acc[staffId]) acc[staffId] = [];
    acc[staffId].push(block);
    return acc;
  }, {} as Record<string, BlockedTimeEntry[]>);

  // Calculate current time indicator position
  const getCurrentTimePosition = () => {
    if (!isToday) return null;

    const now = toZonedTime(currentTime, UK_TIMEZONE);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (currentHour < startHour || currentHour >= endHour) return null;

    const hourIndex = currentHour - startHour;
    const pixelsPerHour = 80; // Height per hour slot
    const pixelsFromMinutes = (currentMinute / 60) * pixelsPerHour;

    return (hourIndex * pixelsPerHour) + pixelsFromMinutes;
  };

  const currentTimePosition = getCurrentTimePosition();

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <div className="relative min-w-[800px]">
          {/* Header Row - Staff Names */}
          <div className="sticky top-0 z-10 bg-card border-b">
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${staff.length}, 1fr)` }}>
              <div className="p-3 border-r font-medium text-sm text-muted-foreground">Time</div>
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="p-3 border-r last:border-r-0 font-medium text-sm truncate text-center"
                  style={{
                    borderLeft: member.colour_tag ? `3px solid ${member.colour_tag}` : undefined,
                  }}
                >
                  {member.full_name}
                </div>
              ))}
            </div>
          </div>

          {/* Current Time Indicator */}
          {currentTimePosition !== null && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: `${currentTimePosition + 49}px` }} /* +49 to account for header */
            >
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full ml-[80px]" />
                <div className="flex-1 h-0.5 bg-green-500" />
              </div>
              <div className="absolute left-2 -top-2 text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-950 px-1.5 py-0.5 rounded shadow-sm">
                {format(currentTime, "HH:mm")}
              </div>
            </div>
          )}

          {/* Timeline Grid */}
          <div className="divide-y">
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid relative"
                style={{
                  gridTemplateColumns: `80px repeat(${staff.length}, 1fr)`,
                  minHeight: '80px',
                }}
              >
                {/* Time Label */}
                <div className="flex items-start justify-end pr-3 pt-2 text-xs font-medium text-muted-foreground border-r">
                  {format(new Date().setHours(hour, 0, 0, 0), "h:mm a")}
                </div>

                {/* Staff Columns */}
                {staff.map((member) => {
                  const staffAppointments = (appointmentsByStaff[member.id] || []).filter((apt) => {
                    const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
                    const aptHour = aptStart.getHours();
                    return aptHour === hour || (aptHour === hour - 1 && aptStart.getMinutes() > 30);
                  });

                  return (
                    <div
                      key={member.id}
                      className="relative border-r last:border-r-0 p-1 hover:bg-muted/20 transition-colors"
                    >
                      {/* 30-minute divider line */}
                      <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-muted-foreground/10" />

                      {/* Appointments */}
                      {staffAppointments.map((apt) => {
                        const hasOverlap = checkOverlap(apt);
                        const hasWarning = checkWarning(apt);
                        const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
                        const aptEnd = toZonedTime(new Date(apt.ends_at), UK_TIMEZONE);
                        const topPercent = (aptStart.getMinutes() / 60) * 100;

                        return (
                          <button
                            key={apt.id}
                            onClick={() => onAppointmentClick(apt)}
                            className={cn(
                              "absolute left-1 right-1 rounded px-1.5 py-1 text-left text-[10px] transition-all hover:shadow-md hover:z-10",
                              apt.status === "COMPLETED" && "bg-green-100 border-l-2 border-green-600 dark:bg-green-950/30",
                              apt.status === "CANCELLED" && "bg-gray-100 border-l-2 border-gray-400 dark:bg-gray-800/50 opacity-60",
                              apt.status === "NO_SHOW" && "bg-orange-100 border-l-2 border-orange-500 dark:bg-orange-950/30",
                              apt.status === "SCHEDULED" && "bg-blue-100 border-l-2 border-blue-500 dark:bg-blue-950/30",
                              hasOverlap && "bg-red-100 border-l-2 border-red-600 dark:bg-red-950/30"
                            )}
                            style={{
                              top: `${topPercent}%`,
                              minHeight: '30px',
                            }}
                          >
                            <div className="font-medium truncate text-[10px]">
                              {format(aptStart, "HH:mm")}
                            </div>
                            <div className="truncate text-[9px] text-muted-foreground">
                              {apt.patient.full_name}
                            </div>
                            <div className="truncate text-[8px] text-muted-foreground">
                              {apt.service.name}
                            </div>
                            {hasWarning && (
                              <div className="text-amber-600 text-[8px]">⚠</div>
                            )}
                          </button>
                        );
                      })}

                      {/* Blocked Time */}
                      {(blockedTimeByStaff[member.id] || [])
                        .filter((block) => {
                          const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
                          const blockHour = blockStart.getHours();
                          return blockHour === hour || (blockHour === hour - 1 && blockStart.getMinutes() > 30);
                        })
                        .map((block) => {
                          const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
                          const blockEnd = toZonedTime(new Date(block.ends_at), UK_TIMEZONE);
                          const topPercent = (blockStart.getMinutes() / 60) * 100;

                          return (
                            <div
                              key={block.id}
                              className="absolute left-1 right-1 rounded px-1.5 py-1 text-left text-[10px] bg-gray-200 border-l-2 border-gray-500 dark:bg-gray-800/70"
                              style={{
                                top: `${topPercent}%`,
                                minHeight: '30px',
                              }}
                            >
                              <div className="font-medium truncate text-[10px] flex items-center gap-0.5">
                                <Ban className="h-2.5 w-2.5" />
                                {format(blockStart, "HH:mm")}
                              </div>
                              <div className="truncate text-[9px] text-muted-foreground font-semibold">
                                BLOCKED
                              </div>
                              <div className="truncate text-[8px] text-muted-foreground">
                                {block.reason}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

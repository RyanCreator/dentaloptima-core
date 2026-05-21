import { format, isSameDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppointmentCard } from "./AppointmentCard";
import type { Appointment } from "@/hooks/useAppointments";
import { UK_TIMEZONE } from "@/lib/constants";

interface CalendarGridViewProps {
  currentDate: Date;
  viewMode: "week" | "month" | "day";
  appointments: Appointment[];
  staff: any[];
  selectedStaffId: string;
  onStaffChange: (id: string) => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  onToday: () => void;
  onViewModeChange: (mode: "week" | "month" | "day") => void;
  onDayClick: (day: Date) => void;
  onAppointmentClick: (apt: Appointment) => void;
  onAddAppointment: () => void;
  checkOverlap: (apt: Appointment) => boolean;
  checkWarning: (apt: Appointment) => boolean;
}

export function CalendarGridView({
  currentDate,
  viewMode,
  appointments,
  staff,
  selectedStaffId,
  onStaffChange,
  onNavigatePrevious,
  onNavigateNext,
  onToday,
  onViewModeChange,
  onDayClick,
  onAppointmentClick,
  onAddAppointment,
  checkOverlap,
  checkWarning,
}: CalendarGridViewProps) {
  const ukNow = toZonedTime(currentDate, UK_TIMEZONE);
  
  const getDays = () => {
    if (viewMode === "week") {
      const start = startOfWeek(ukNow, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    } else {
      const start = startOfMonth(ukNow);
      const end = endOfMonth(ukNow);
      const days = [];
      for (let d = start; d <= end; d = addDays(d, 1)) {
        days.push(d);
      }
      return days;
    }
  };

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter(apt => {
      const aptDate = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
      const matchesDay = isSameDay(aptDate, day);
      const matchesStaff = selectedStaffId === "all" || apt.staff.id === selectedStaffId;
      return matchesDay && matchesStaff;
    });
  };

  const days = getDays();
  const today = toZonedTime(new Date(), UK_TIMEZONE);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3">
        {/* Row 1: Date Navigation - Centered on mobile, justified on desktop */}
        <div className="flex items-center justify-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button onClick={onNavigatePrevious} variant="outline" size="sm" aria-label={viewMode === "week" ? "Previous week" : "Previous month"}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base sm:text-lg font-semibold min-w-[140px] sm:min-w-[180px] text-center">
              {format(currentDate, viewMode === "week" ? "'Week of' MMM d" : "MMMM yyyy")}
            </h2>
            <Button onClick={onNavigateNext} variant="outline" size="sm" aria-label={viewMode === "week" ? "Next week" : "Next month"}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={onAddAppointment} size="sm" className="hidden sm:flex">
            <Plus className="h-4 w-4 mr-2" />
            New Appointment
          </Button>
        </div>

        {/* Row 2: Filters and View Controls */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Mobile: New Appointment button */}
          <Button onClick={onAddAppointment} size="sm" className="sm:hidden w-full">
            <Plus className="h-4 w-4 mr-2" />
            New Appointment
          </Button>

          {/* Staff filter + cycler. When a specific staff member is
              selected we add prev/next arrows so users can sweep through
              the team one column at a time without re-opening the
              dropdown — meaningful on smaller tablets where the multi
              -column view is cramped. */}
          <div className="flex items-center gap-1 w-full sm:w-auto">
            {selectedStaffId !== "all" && staff.length > 1 && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Previous staff member"
                onClick={() => {
                  const idx = staff.findIndex((m) => m.id === selectedStaffId);
                  const prev = idx > 0 ? staff[idx - 1] : staff[staff.length - 1];
                  if (prev) onStaffChange(prev.id);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Select value={selectedStaffId} onValueChange={onStaffChange}>
              <SelectTrigger className="flex-1 sm:w-[180px]">
                <SelectValue placeholder="Filter by staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStaffId !== "all" && staff.length > 1 && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Next staff member"
                onClick={() => {
                  const idx = staff.findIndex((m) => m.id === selectedStaffId);
                  const next = idx < staff.length - 1 ? staff[idx + 1] : staff[0];
                  if (next) onStaffChange(next.id);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* View Mode Buttons */}
          <div className="flex gap-2 sm:ml-auto">
            <Button onClick={onToday} variant="outline" size="sm" className="flex-1 sm:flex-none">
              Today
            </Button>
            <Button
              onClick={() => onViewModeChange("week")}
              variant={viewMode === "week" ? "default" : "outline"}
              size="sm"
              className="flex-1 sm:flex-none"
            >
              Week
            </Button>
            <Button
              onClick={() => onViewModeChange("month")}
              variant={viewMode === "month" ? "default" : "outline"}
              size="sm"
              className="flex-1 sm:flex-none"
            >
              Month
            </Button>
          </div>
        </div>
      </div>

      {/* Week View */}
      {viewMode === "week" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2">
          {days.map((day) => {
            const dayAppointments = getAppointmentsForDay(day);
            const isToday = isSameDay(day, today);

            return (
              <div
                key={day.toISOString()}
                onClick={() => onDayClick(day)}
                className={cn(
                  "bg-card rounded-lg border p-3 min-h-[120px] sm:min-h-[160px] lg:min-h-[200px] cursor-pointer hover:border-primary/50 transition-colors",
                  isToday && "border-primary ring-2 ring-primary/20"
                )}
              >
                <div className="font-medium text-sm mb-2 flex items-baseline justify-between sm:flex-col sm:justify-start">
                  <div className="text-xs text-muted-foreground uppercase">{format(day, "EEE")}</div>
                  <div className={cn("text-xl sm:text-2xl", isToday && "text-primary font-bold")}>
                    {format(day, "d")}
                  </div>
                </div>
                <div className="space-y-1">
                  {dayAppointments.slice(0, 3).map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      hasOverlap={checkOverlap(apt)}
                      hasWarning={checkWarning(apt)}
                      onClick={(e: any) => {
                        e.stopPropagation();
                        onAppointmentClick(apt);
                      }}
                      variant="week"
                    />
                  ))}
                  {dayAppointments.length > 3 && (
                    <div className="text-xs text-muted-foreground pl-1">
                      +{dayAppointments.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Month View */}
      {viewMode === "month" && (
        <div>
          <div className="hidden md:grid grid-cols-7 gap-1 mb-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="text-center font-medium text-xs p-2 text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-0.5 sm:gap-1">
            {days.map((day) => {
              const dayAppointments = getAppointmentsForDay(day);
              const isToday = isSameDay(day, today);

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => onDayClick(day)}
                  className={cn(
                    "bg-card border p-1 sm:p-2 min-h-[60px] sm:min-h-[80px] lg:min-h-[100px] cursor-pointer hover:border-primary/50 transition-colors",
                    isToday && "border-primary bg-primary/5 ring-1 ring-primary/20"
                  )}
                >
                  <div className={cn(
                    "text-xs sm:text-sm font-medium mb-1 text-center sm:text-left",
                    isToday && "text-primary font-bold"
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayAppointments.slice(0, 2).map((apt) => (
                      <AppointmentCard
                        key={apt.id}
                        appointment={apt}
                        hasOverlap={checkOverlap(apt)}
                        hasWarning={checkWarning(apt)}
                        onClick={(e: any) => {
                          e.stopPropagation();
                          onAppointmentClick(apt);
                        }}
                        variant="month"
                      />
                    ))}
                    {dayAppointments.length > 2 && (
                      <div className="text-[10px] sm:text-xs text-muted-foreground text-center sm:text-left">
                        +{dayAppointments.length - 2}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

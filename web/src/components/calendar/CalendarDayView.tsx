import { useState, Fragment } from "react";
import { format, isSameDay, differenceInMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Plus, Eye, EyeOff, ChevronLeft, ChevronRight, List, Clock, Users, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppointmentCard } from "./AppointmentCard";
import { CalendarTimelineView } from "./CalendarTimelineView";
import { CalendarMultiStaffView } from "./CalendarMultiStaffView";
import type { Appointment } from "@/hooks/useAppointments";
import type { BlockedTimeEntry } from "@/hooks/useBlockedTime";
import { UK_TIMEZONE } from "@/lib/constants";

interface CalendarDayViewProps {
  selectedDay: Date;
  appointments: Appointment[];
  allAppointments: Appointment[];
  blockedTimeEntries: BlockedTimeEntry[];
  showCancelled: boolean;
  onToggleCancelled: () => void;
  staff: any[];
  selectedStaffId: string;
  onStaffChange: (id: string) => void;
  onAddAppointment: (date?: Date, time?: string, staffId?: string) => void;
  onBlockTime?: (date?: Date, time?: string, staffId?: string) => void;
  onAppointmentClick: (apt: Appointment) => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  checkOverlap: (apt: Appointment) => boolean;
  checkWarning: (apt: Appointment) => boolean;
  // Optional reload trigger for timeline drag-to-move. Parent calls
  // loadAppointments() so the moved appointment renders in its new slot.
  onAppointmentMoved?: () => void;
}

export function CalendarDayView({
  selectedDay,
  appointments,
  blockedTimeEntries,
  showCancelled,
  onToggleCancelled,
  staff,
  selectedStaffId,
  onStaffChange,
  onAddAppointment,
  onBlockTime,
  onAppointmentClick,
  onNavigatePrevious,
  onNavigateNext,
  checkOverlap,
  checkWarning,
  onAppointmentMoved,
}: CalendarDayViewProps) {
  const [dayViewMode, setDayViewMode] = useState<"list" | "timeline" | "multi-staff">("timeline");

  // Filter appointments by staff
  const filteredAppointments = selectedStaffId === "all"
    ? appointments
    : appointments.filter(apt => apt.staff.id === selectedStaffId);

  // Filter blocked time by selected day and staff
  const filteredBlockedTime = blockedTimeEntries.filter(block => {
    const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
    const blockEnd = toZonedTime(new Date(block.ends_at), UK_TIMEZONE);
    const dayMatches = isSameDay(blockStart, selectedDay) || isSameDay(blockEnd, selectedDay);
    const staffMatches = selectedStaffId === "all" || block.staff_id === selectedStaffId;
    return dayMatches && staffMatches;
  });

  const sortedAppointments = filteredAppointments
    .slice()
    .sort((a, b) => {
      const aTime = toZonedTime(new Date(a.starts_at), UK_TIMEZONE).getTime();
      const bTime = toZonedTime(new Date(b.starts_at), UK_TIMEZONE).getTime();
      return aTime - bTime;
    });

  // Sort blocked time entries
  const sortedBlockedTime = filteredBlockedTime
    .slice()
    .sort((a, b) => {
      const aTime = toZonedTime(new Date(a.starts_at), UK_TIMEZONE).getTime();
      const bTime = toZonedTime(new Date(b.starts_at), UK_TIMEZONE).getTime();
      return aTime - bTime;
    });

  // Group appointments by staff to compute gaps within each staff member's schedule
  const appointmentsByStaff = sortedAppointments.reduce((acc, apt) => {
    const id = apt.staff?.id || "unknown";
    (acc[id] ||= []).push(apt);
    return acc;
  }, {} as Record<string, Appointment[]>);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/* Mobile Layout: Stacked */}
        <div className="flex flex-col gap-3 sm:hidden">
          {/* Navigation - Centered */}
          <div className="flex items-center justify-center gap-2">
            <Button onClick={onNavigatePrevious} variant="outline" size="sm" aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[140px] text-center">
              <h2 className="text-base font-semibold">
                {format(selectedDay, "EEEE")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {format(selectedDay, "MMM d, yyyy")}
              </p>
            </div>
            <Button onClick={onNavigateNext} variant="outline" size="sm" aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            {/* View Mode Toggle */}
            <div className="grid grid-cols-3 border rounded-md">
              <Button
                onClick={() => setDayViewMode("list")}
                variant={dayViewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none rounded-l-md"
              >
                <List className="h-4 w-4 mr-2" />
                List
              </Button>
              <Button
                onClick={() => setDayViewMode("timeline")}
                variant={dayViewMode === "timeline" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
              >
                <Clock className="h-4 w-4 mr-2" />
                Timeline
              </Button>
              <Button
                onClick={() => setDayViewMode("multi-staff")}
                variant={dayViewMode === "multi-staff" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none rounded-r-md"
              >
                <Users className="h-4 w-4 mr-2" />
                Compare
              </Button>
            </div>

            <Button onClick={() => onAddAppointment(selectedDay)} size="sm" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Appointment
            </Button>
            {onBlockTime && (
              <Button onClick={() => onBlockTime(selectedDay)} variant="outline" size="sm" className="w-full">
                <Ban className="h-4 w-4 mr-2" />
                Block Time
              </Button>
            )}
            <Button onClick={onToggleCancelled} variant="outline" size="sm" className="w-full">
              {showCancelled ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
            </Button>
          </div>

          {/* Staff Filter - Hide in multi-staff view */}
          {dayViewMode !== "multi-staff" && (
            <Select value={selectedStaffId} onValueChange={onStaffChange}>
              <SelectTrigger className="w-full">
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
          )}
        </div>

        {/* Day summary */}
        {(() => {
          const scheduled = filteredAppointments.filter(a => a.status === "SCHEDULED").length;
          const completed = filteredAppointments.filter(a => a.status === "COMPLETED").length;
          const cancelled = filteredAppointments.filter(a => a.status === "CANCELLED").length;
          const total = filteredAppointments.length;
          const parts: string[] = [];
          if (scheduled > 0) parts.push(`${scheduled} scheduled`);
          if (completed > 0) parts.push(`${completed} completed`);
          if (cancelled > 0 && showCancelled) parts.push(`${cancelled} cancelled`);
          return total > 0 ? (
            <p className="hidden sm:block text-xs text-muted-foreground">
              {total} appointment{total !== 1 ? "s" : ""}{parts.length > 0 ? ` — ${parts.join(", ")}` : ""}
              {sortedBlockedTime.length > 0 ? ` · ${sortedBlockedTime.length} blocked` : ""}
            </p>
          ) : null;
        })()}

        {/* Desktop Layout: Responsive with wrapping */}
        <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 lg:gap-3">
          {/* Left: Navigation */}
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={onNavigatePrevious} variant="outline" size="sm" aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[140px] lg:min-w-[180px] text-center">
              <h2 className="text-base lg:text-lg font-semibold">
                {format(selectedDay, "EEEE")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {format(selectedDay, "d MMM yyyy")}
              </p>
            </div>
            <Button onClick={onNavigateNext} variant="outline" size="sm" aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Right: Filter and Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex border rounded-md">
              <Button
                onClick={() => setDayViewMode("list")}
                variant={dayViewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none rounded-l-md"
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setDayViewMode("timeline")}
                variant={dayViewMode === "timeline" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                aria-label="Timeline view"
              >
                <Clock className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setDayViewMode("multi-staff")}
                variant={dayViewMode === "multi-staff" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none rounded-r-md"
                aria-label="Multi-staff view"
              >
                <Users className="h-4 w-4" />
              </Button>
            </div>

            {/* Staff Filter - Hide in multi-staff view */}
            {dayViewMode !== "multi-staff" && (
              <Select value={selectedStaffId} onValueChange={onStaffChange}>
              <SelectTrigger className="w-[140px] lg:w-[180px]">
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
            )}
            <Button onClick={() => onAddAppointment(selectedDay)} size="sm" className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden md:inline">Add Appointment</span>
              <span className="md:hidden">Add</span>
            </Button>
            {onBlockTime && (
              <Button onClick={() => onBlockTime(selectedDay)} variant="outline" size="sm" className="shrink-0">
                <Ban className="h-4 w-4 mr-2" />
                <span className="hidden md:inline">Block Time</span>
                <span className="md:hidden">Block</span>
              </Button>
            )}
            <Button onClick={onToggleCancelled} variant="outline" size="sm" className="shrink-0">
              {showCancelled ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              <span className="hidden md:inline">{showCancelled ? "Hide Cancelled" : "Show Cancelled"}</span>
              <span className="md:hidden">{showCancelled ? "Hide" : "Show"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content Area - List, Timeline, or Multi-Staff View */}
      {dayViewMode === "multi-staff" ? (
        <CalendarMultiStaffView
          selectedDay={selectedDay}
          appointments={appointments}
          blockedTimeEntries={filteredBlockedTime}
          staff={staff}
          onAppointmentClick={onAppointmentClick}
          checkOverlap={checkOverlap}
          checkWarning={checkWarning}
        />
      ) : dayViewMode === "timeline" ? (
        <CalendarTimelineView
          selectedDay={selectedDay}
          appointments={sortedAppointments}
          blockedTimeEntries={filteredBlockedTime}
          onAppointmentClick={onAppointmentClick}
          onAddAppointment={onAddAppointment}
          onBlockTime={onBlockTime}
          checkOverlap={checkOverlap}
          checkWarning={checkWarning}
          onAppointmentMoved={onAppointmentMoved}
        />
      ) : (
        <div className="bg-card rounded-lg border">
          {sortedAppointments.length === 0 && sortedBlockedTime.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-muted-foreground text-sm sm:text-base">
              No appointments or blocked time
            </div>
          ) : (
            <div className="divide-y">
              {/* Appointments grouped by staff */}
              {Object.entries(appointmentsByStaff).map(([staffId, staffApts]) => (
                <div key={`staff-group-${staffId}`}>
                  {staffApts.map((apt, index) => {
                    const nextApt = staffApts[index + 1];
                    let gapMinutes = 0;
                    if (nextApt) {
                      const currentEnd = toZonedTime(new Date(apt.ends_at), UK_TIMEZONE);
                      const nextStart = toZonedTime(new Date(nextApt.starts_at), UK_TIMEZONE);
                      gapMinutes = differenceInMinutes(nextStart, currentEnd);
                    }

                    const gapStartTime = nextApt ? format(toZonedTime(new Date(apt.ends_at), UK_TIMEZONE), "HH:mm") : "";

                    return (
                      <Fragment key={`day-item-${apt.id}`}>
                        <AppointmentCard
                          appointment={apt}
                          hasOverlap={checkOverlap(apt)}
                          hasWarning={checkWarning(apt)}
                          onClick={() => onAppointmentClick(apt)}
                          variant="day"
                        />
                        {gapMinutes >= 30 && (
                          <button
                            onClick={() => onAddAppointment(selectedDay, gapStartTime, apt.staff?.id)}
                            className="w-full bg-green-500/10 border-l-4 border-green-500 px-4 py-2 hover:bg-green-500/20 transition-colors text-left"
                            aria-label={`${gapMinutes} minute slot available`}
                          >
                            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                              {gapMinutes} minute slot available - Click to book
                            </p>
                          </button>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              ))}

              {/* Blocked Time Entries */}
              {sortedBlockedTime.map((block) => {
                const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
                const blockEnd = toZonedTime(new Date(block.ends_at), UK_TIMEZONE);
                const staffMember = staff.find(s => s.id === block.staff_id);

                return (
                  <div
                    key={`blocked-${block.id}`}
                    className="p-4 bg-gray-100 dark:bg-gray-800/50 border-l-4 border-gray-500"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        <span className="font-semibold text-sm">BLOCKED TIME</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {format(blockStart, "HH:mm")} - {format(blockEnd, "HH:mm")}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">{block.reason}</div>
                    {staffMember && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {staffMember.full_name}
                      </div>
                    )}
                    {block.notes && (
                      <div className="mt-1 text-xs text-muted-foreground italic">
                        {block.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

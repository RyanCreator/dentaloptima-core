import { useState, useEffect, useMemo } from "react";
import { format, isSameDay, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Plus, Ban, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/hooks/useAppointments";
import type { BlockedTimeEntry } from "@/hooks/useBlockedTime";
import { UK_TIMEZONE } from "@/lib/constants";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import { useRescheduleAppointment } from "@/hooks/useRescheduleAppointment";

interface CalendarTimelineViewProps {
  selectedDay: Date;
  appointments: Appointment[];
  blockedTimeEntries: BlockedTimeEntry[];
  onAppointmentClick: (apt: Appointment) => void;
  onAddAppointment: (date?: Date, time?: string) => void;
  onBlockTime?: (date?: Date, time?: string) => void;
  checkOverlap: (apt: Appointment) => boolean;
  checkWarning: (apt: Appointment) => boolean;
  // Optional: parent calls this after a successful drag-to-reschedule so it
  // can reload appointments. Without it, drag still works but the calendar
  // will keep showing the old position until the next refresh.
  onAppointmentMoved?: () => void;
  startHour?: number;
  endHour?: number;
}

export function CalendarTimelineView({
  selectedDay,
  appointments,
  blockedTimeEntries,
  onAppointmentClick,
  onAddAppointment,
  onBlockTime,
  checkOverlap,
  checkWarning,
  onAppointmentMoved,
  startHour = 8,
  endHour = 20,
}: CalendarTimelineViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [draggingApt, setDraggingApt] = useState<Appointment | null>(null);
  const { reschedule } = useRescheduleAppointment();

  // 8px activation distance lets clicks still open the appointment sheet —
  // a click never moves the pointer that far. Anything bigger feels like a
  // genuine drag intent.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const apt = event.active.data.current?.appointment as Appointment | undefined;
    if (apt) setDraggingApt(apt);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingApt(null);
    const apt = event.active.data.current?.appointment as Appointment | undefined;
    const drop = event.over?.data.current as { hour: number; minute: number } | undefined;
    if (!apt || !drop) return;

    // Build the new starts_at as wall-clock time on selectedDay in the UK
    // timezone, then convert to UTC for storage. Without the round-trip a
    // non-UK browser would write the wrong instant for a UK appointment.
    const wallClock = setMilliseconds(
      setSeconds(setMinutes(setHours(selectedDay, drop.hour), drop.minute), 0),
      0
    );
    const newStartsAt = fromZonedTime(wallClock, UK_TIMEZONE);

    const ok = await reschedule(apt, newStartsAt);
    if (ok) onAppointmentMoved?.();
  }

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Check if selected day is today
  const today = toZonedTime(new Date(), UK_TIMEZONE);
  const isToday = isSameDay(selectedDay, today);

  // Calculate current time indicator position
  const getCurrentTimePosition = () => {
    if (!isToday) return null;

    const now = toZonedTime(currentTime, UK_TIMEZONE);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Only show if within business hours
    if (currentHour < startHour || currentHour >= endHour) return null;

    // Calculate pixel position from the top
    const hourIndex = currentHour - startHour;
    const pixelsPerHour = 60; // Minimum height per hour
    const pixelsFromMinutes = (currentMinute / 60) * pixelsPerHour;

    return (hourIndex * pixelsPerHour) + pixelsFromMinutes;
  };

  const currentTimePosition = getCurrentTimePosition();

  // Generate hour slots
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i
  );

  // Pre-bucket appointments by hour once per render. Without memoisation the
  // previous implementation filtered the full appointments array once per
  // hour slot on every minute-tick re-render (12 hours × N appointments),
  // causing jank at scale. Now it's O(N) once, then O(1) per lookup.
  //
  // Preserves the original semantics: an appointment appears in its start
  // hour, AND also in the next hour if it started in the second half of the
  // previous hour (> :30) — visual spillover indicator.
  const appointmentsByHour = useMemo(() => {
    const byHour = new Map<number, Appointment[]>();
    const addTo = (hour: number, apt: Appointment) => {
      const bucket = byHour.get(hour);
      if (bucket) bucket.push(apt);
      else byHour.set(hour, [apt]);
    };
    for (const apt of appointments) {
      const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
      const aptHour = aptStart.getHours();
      const aptMinute = aptStart.getMinutes();
      addTo(aptHour, apt);
      if (aptMinute > 30) addTo(aptHour + 1, apt);
    }
    return byHour;
  }, [appointments]);

  const getAppointmentsForHour = (hour: number) => appointmentsByHour.get(hour) ?? [];

  const getAppointmentStyle = (apt: Appointment, hour: number) => {
    const start = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
    const end = toZonedTime(new Date(apt.ends_at), UK_TIMEZONE);

    const startHour = start.getHours();
    const startMinute = start.getMinutes();
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

    // Calculate position within the hour slot
    const topOffset = startMinute;
    const height = durationMinutes;

    return {
      top: `${topOffset}px`,
      height: `${height}px`,
      minHeight: '40px',
    };
  };

  // Pre-bucket blocked time by hour, same pattern as appointments above.
  const blockedTimeByHour = useMemo(() => {
    const byHour = new Map<number, BlockedTimeEntry[]>();
    const addTo = (hour: number, block: BlockedTimeEntry) => {
      const bucket = byHour.get(hour);
      if (bucket) bucket.push(block);
      else byHour.set(hour, [block]);
    };
    for (const block of blockedTimeEntries) {
      const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
      const blockHour = blockStart.getHours();
      const blockMinute = blockStart.getMinutes();
      addTo(blockHour, block);
      if (blockMinute > 30) addTo(blockHour + 1, block);
    }
    return byHour;
  }, [blockedTimeEntries]);

  const getBlockedTimeForHour = (hour: number) => blockedTimeByHour.get(hour) ?? [];

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingApt(null)}
    >
    <div className="bg-card rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[600px] relative">
          {/* Current Time Indicator */}
          {currentTimePosition !== null && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: `${currentTimePosition}px` }}
            >
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full ml-[80px]" />
                <div className="flex-1 h-0.5 bg-green-500" />
              </div>
              <div className="absolute left-2 -top-2 text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-950 px-1 rounded">
                {format(currentTime, "HH:mm")}
              </div>
            </div>
          )}

          {/* Timeline Grid */}
          <div className="divide-y">
            {hours.map((hour) => {
              const hourAppointments = getAppointmentsForHour(hour);
              const timeString = format(new Date().setHours(hour, 0, 0, 0), "HH:mm");

              return (
                <div
                  key={hour}
                  className="relative grid grid-cols-[80px,1fr] min-h-[60px] hover:bg-muted/30 transition-colors"
                >
                  {/* Time Label */}
                  <div className="flex items-start justify-end pr-4 pt-2 text-sm font-medium text-muted-foreground border-r">
                    {format(new Date().setHours(hour, 0, 0, 0), "h:mm a")}
                  </div>

                  {/* Appointment Area */}
                  <div className="relative p-2 group">
                    {/* Drop zones — two per hour for 30-min snap. Behind the
                        appointment chips so they only highlight when an
                        appointment is being dragged over the empty space. */}
                    <DropZone hour={hour} minute={0} />
                    <DropZone hour={hour} minute={30} />

                    {/* 30-minute divider line */}
                    <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-muted-foreground/20" />

                    {/* Action buttons - show on hover */}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                      <Button
                        onClick={() => onAddAppointment(selectedDay, timeString)}
                        variant="ghost"
                        size="sm"
                        title="Add Appointment"
                        aria-label={`Add appointment at ${timeString}`}
                        className="bg-background/90 hover:bg-background"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      {onBlockTime && (
                        <Button
                          onClick={() => onBlockTime(selectedDay, timeString)}
                          variant="ghost"
                          size="sm"
                          title="Block Time"
                          aria-label={`Block time at ${timeString}`}
                          className="bg-background/90 hover:bg-background"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Appointments and Blocked Time */}
                    <div className="relative h-full space-y-1">
                      {hourAppointments.map((apt) => {
                        const hasOverlap = checkOverlap(apt);
                        const hasWarning = checkWarning(apt);
                        const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
                        const aptEnd = toZonedTime(new Date(apt.ends_at), UK_TIMEZONE);

                        return (
                          <DraggableAppointment
                            key={apt.id}
                            apt={apt}
                            onClick={() => onAppointmentClick(apt)}
                            className={cn(
                              "absolute left-2 right-2 rounded p-2 text-left text-xs transition-all hover:shadow-md hover:z-10 z-10",
                              apt.status === "COMPLETED" && "bg-green-100 border-l-4 border-green-600 dark:bg-green-950/30",
                              apt.status === "CANCELLED" && "bg-gray-100 border-l-4 border-gray-400 dark:bg-gray-800/50 opacity-60",
                              apt.status === "NO_SHOW" && "bg-orange-100 border-l-4 border-orange-500 dark:bg-orange-950/30",
                              apt.status === "SCHEDULED" && "bg-blue-100 border-l-4 border-blue-500 dark:bg-blue-950/30",
                              hasOverlap && "bg-red-100 border-l-4 border-red-600 dark:bg-red-950/30"
                            )}
                            style={{
                              top: `${(aptStart.getMinutes() / 60) * 100}%`,
                              minHeight: '40px',
                            }}
                          >
                            <div className="font-medium truncate">
                              {format(aptStart, "HH:mm")} - {format(aptEnd, "HH:mm")}
                            </div>
                            <div className="truncate text-muted-foreground">
                              {apt.patient.full_name}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {apt.service.name} • {apt.staff.full_name}
                            </div>
                            {hasWarning && (
                              <div className="text-amber-600 text-[10px]">⚠ Warning</div>
                            )}
                          </DraggableAppointment>
                        );
                      })}

                      {/* Blocked Time Entries */}
                      {getBlockedTimeForHour(hour).map((block) => {
                        const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
                        const blockEnd = toZonedTime(new Date(block.ends_at), UK_TIMEZONE);

                        return (
                          <div
                            key={block.id}
                            className="absolute left-2 right-2 rounded p-2 text-left text-xs bg-gray-200 border-l-4 border-gray-500 dark:bg-gray-800/70"
                            style={{
                              top: `${(blockStart.getMinutes() / 60) * 100}%`,
                              minHeight: '40px',
                            }}
                          >
                            <div className="font-medium truncate flex items-center gap-1">
                              <Ban className="h-3 w-3" />
                              {format(blockStart, "HH:mm")} - {format(blockEnd, "HH:mm")}
                            </div>
                            <div className="truncate text-muted-foreground font-semibold">
                              BLOCKED
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {block.reason}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

    {/* Floating ghost of the appointment being dragged. Plain card so the
        user sees what they're moving without the styling weight of the real
        chip. */}
    <DragOverlay>
      {draggingApt ? (
        <div className="rounded p-2 text-xs bg-blue-100 border-l-4 border-blue-500 shadow-lg max-w-[260px]">
          <div className="font-medium truncate">{draggingApt.patient.full_name}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {draggingApt.service.name}
          </div>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}

// -----------------------------------------------------------------------------
// Drag & drop sub-components
// -----------------------------------------------------------------------------

// One half of an hour cell, registered with @dnd-kit as a droppable. Two of
// these stack inside each hour to give 30-min snap precision. Highlights when
// hovered with an active drag.
function DropZone({
  hour,
  minute,
}: {
  hour: number;
  minute: 0 | 30;
}) {
  const id = `slot:${hour}:${minute}`;
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { hour, minute },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute left-0 right-0 h-1/2 transition-colors",
        minute === 0 ? "top-0" : "bottom-0",
        isOver && "bg-primary/10 ring-1 ring-primary/40 ring-inset"
      )}
      aria-hidden="true"
    />
  );
}

// Wraps the appointment chip with @dnd-kit's draggable. Uses the
// activation-distance sensor so a click still fires the parent's onClick
// (open detail sheet). Drag handle icon appears on hover for discoverability.
function DraggableAppointment({
  apt,
  children,
  onClick,
  className,
  style,
}: {
  apt: Appointment;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: apt.id,
    data: { appointment: apt },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Only treat as a click if dnd-kit didn't capture it as a drag.
        if (!isDragging) onClick();
        e.stopPropagation();
      }}
      role="button"
      tabIndex={0}
      style={style}
      className={cn(
        className,
        "cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-30"
      )}
    >
      {/* Drag handle hint — appears on hover so the affordance is discoverable
          without cluttering the chip. */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-60 pointer-events-none">
        <GripVertical className="w-3 h-3" />
      </div>
      {children}
    </div>
  );
}

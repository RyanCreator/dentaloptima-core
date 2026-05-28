import { useState, useEffect, useMemo, useRef } from "react";
import { format, isSameDay, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Plus, GripVertical, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/appointmentUtils";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ScheduleOverlay } from "./ScheduleOverlay";
import { SlotActionDialog } from "./SlotActionDialog";
import { BlockedTimeChip } from "./BlockedTimeChip";
import type { DayContext } from "@/hooks/useDayContext";
import { SLOT_ROW_HEIGHT_PX, type SlotMinutes } from "@/hooks/usePracticeSetting";

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
  // Schedule context for shading out-of-hours, closures, and breaks.
  // Optional so the timeline still renders cleanly during the brief window
  // before the parent's useDayContext load resolves.
  dayContext?: DayContext;
  // Which staff member's breaks to overlay. "all" / undefined = none, since
  // overlaying one person's lunch on a mixed view would be misleading.
  selectedStaffId?: string;
  // Visual grid granularity. Drives both the dashed divider count per hour
  // and the drag-to-reschedule snap precision. Defaults to 30 min when
  // unspecified to match the legacy behaviour.
  slotMinutes?: SlotMinutes;
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
  dayContext,
  selectedStaffId,
  slotMinutes = 30,
}: CalendarTimelineViewProps) {
  // Expand the visible hour range if any appointment or block sits outside
  // the default 8am-8pm window. Without this, an early-morning emergency
  // booking (e.g. 07:00) or a late evening slot would render with no
  // hour bucket and silently disappear from the day view.
  const earliestApptHour = appointments.reduce((min, a) => {
    const h = toZonedTime(new Date(a.starts_at), UK_TIMEZONE).getHours();
    return h < min ? h : min;
  }, startHour);
  const earliestBlockHour = blockedTimeEntries.reduce((min, b) => {
    const h = toZonedTime(new Date(b.starts_at), UK_TIMEZONE).getHours();
    return h < min ? h : min;
  }, startHour);
  const latestApptEndHour = appointments.reduce((max, a) => {
    const end = toZonedTime(new Date(a.ends_at), UK_TIMEZONE);
    // Round up to the next hour bucket so a 19:30 end still gets the
    // 20:00 slot rendered.
    const h = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
    return h > max ? h : max;
  }, endHour);
  const latestBlockEndHour = blockedTimeEntries.reduce((max, b) => {
    const end = toZonedTime(new Date(b.ends_at), UK_TIMEZONE);
    const h = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
    return h > max ? h : max;
  }, endHour);
  const effectiveStartHour = Math.min(startHour, earliestApptHour, earliestBlockHour);
  const effectiveEndHour = Math.min(24, Math.max(endHour, latestApptEndHour, latestBlockEndHour));

  const slotsPerHour = Math.max(1, Math.round(60 / slotMinutes));
  // Row height scales up at fine granularity so 10-min slots aren't stuck
  // at ~10px tall. Stays at 60 for 20/30/60 min so the calendar doesn't
  // look different from the legacy default.
  const pixelsPerHour = SLOT_ROW_HEIGHT_PX[slotMinutes].single;
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
    if (currentHour < effectiveStartHour || currentHour >= effectiveEndHour) return null;

    // Calculate pixel position from the top using the same row height the
    // grid uses, so the indicator line stays in sync as granularity changes.
    const hourIndex = currentHour - effectiveStartHour;
    const pixelsFromMinutes = (currentMinute / 60) * pixelsPerHour;

    return (hourIndex * pixelsPerHour) + pixelsFromMinutes;
  };

  const currentTimePosition = getCurrentTimePosition();

  // Generate hour slots
  const hours = Array.from(
    { length: effectiveEndHour - effectiveStartHour },
    (_, i) => effectiveStartHour + i
  );

  // Pre-bucket appointments by their START hour. With the new "actual
  // duration as pixel height" rendering, chips that span more than an hour
  // visually overflow into subsequent hour cells (overflow: visible on
  // both the hour row and the appointment area). One render per
  // appointment — no spillover ghosts in the next hour bucket — so the
  // chip's size always matches its duration cleanly.
  const appointmentsByHour = useMemo(() => {
    const byHour = new Map<number, Appointment[]>();
    for (const apt of appointments) {
      const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
      const aptHour = aptStart.getHours();
      const bucket = byHour.get(aptHour);
      if (bucket) bucket.push(apt);
      else byHour.set(aptHour, [apt]);
    }
    return byHour;
  }, [appointments]);

  const getAppointmentsForHour = (hour: number) => appointmentsByHour.get(hour) ?? [];

  // Pre-bucket blocked time by start hour only, same pattern as
  // appointments above. The block renders with actual-duration height so
  // it visually spans the right number of slots without needing a second
  // ghost render in the following hour.
  const blockedTimeByHour = useMemo(() => {
    const byHour = new Map<number, BlockedTimeEntry[]>();
    for (const block of blockedTimeEntries) {
      const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
      const blockHour = blockStart.getHours();
      const bucket = byHour.get(blockHour);
      if (bucket) bucket.push(block);
      else byHour.set(blockHour, [block]);
    }
    return byHour;
  }, [blockedTimeEntries]);

  const getBlockedTimeForHour = (hour: number) => blockedTimeByHour.get(hour) ?? [];

  // Only show breaks when the user has filtered to one specific staff
  // member — overlaying everyone's lunch would clutter the grid and lie
  // about availability.
  const breaksForView =
    dayContext && selectedStaffId && selectedStaffId !== "all"
      ? dayContext.staffBreaks.get(selectedStaffId) ?? []
      : [];

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
          {/* Schedule context overlay: shades out-of-hours, breaks, and
              closures. Sits behind appointment chips (z-0 vs chip z-10) so
              the chips are still readable + draggable. */}
          {dayContext && !dayContext.loading && (
            <ScheduleOverlay
              dayContext={dayContext}
              startHour={effectiveStartHour}
              endHour={effectiveEndHour}
              pixelsPerHour={pixelsPerHour}
              breaks={breaksForView}
              leftOffsetPx={80}
            />
          )}

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

              return (
                <div
                  key={hour}
                  className="relative grid grid-cols-[80px,1fr]"
                  style={{ minHeight: `${pixelsPerHour}px` }}
                >
                  {/* Time Label */}
                  <div className="flex items-start justify-end pr-4 pt-2 text-sm font-medium text-muted-foreground border-r">
                    {format(new Date().setHours(hour, 0, 0, 0), "h:mm a")}
                  </div>

                  {/* Appointment Area — a single hover-tracking surface.
                      Earlier we had one Popover + one button per slot, but
                      the @dnd-kit + Radix Slot ref-composition caused flaky
                      hover. Tracking pointer position on the parent and
                      computing the slot from Y is bullet-proof and fewer
                      DOM nodes. dnd-kit gets its own invisible ghost
                      droppables for drag-to-reschedule snap. */}
                  <HourSlotSurface
                    hour={hour}
                    slotsPerHour={slotsPerHour}
                    selectedDay={selectedDay}
                    onAddAppointment={onAddAppointment}
                    onBlockTime={onBlockTime}
                  >
                    {/* Inner divider lines — one between each pair of slots,
                        so a 4-slots-per-hour grid gets 3 dashed lines.
                        pointer-events-none so they don't intercept clicks. */}
                    {Array.from({ length: slotsPerHour - 1 }, (_, i) => (
                      <div
                        key={`divider-${hour}-${i}`}
                        className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/20 pointer-events-none"
                        style={{ top: `${((i + 1) / slotsPerHour) * 100}%` }}
                      />
                    ))}

                    {/* Appointments and Blocked Time */}
                    <div className="relative h-full space-y-1">
                      {hourAppointments.map((apt) => {
                        const hasOverlap = checkOverlap(apt);
                        const hasWarning = checkWarning(apt);
                        const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
                        const aptEnd = toZonedTime(new Date(apt.ends_at), UK_TIMEZONE);
                        // Pixel-precise positioning so a 30-minute chip
                        // is exactly half the height of a 60-minute chip,
                        // regardless of granularity zoom or viewport width.
                        // Top is offset within the start hour; height is the
                        // full duration in pixels (so longer chips overflow
                        // visually into the next hour cell — that's why the
                        // appointment area has overflow: visible).
                        const topPx = (aptStart.getMinutes() / 60) * pixelsPerHour;
                        const durationMin = Math.max(
                          5,
                          (aptEnd.getTime() - aptStart.getTime()) / 60000,
                        );
                        const heightPx = (durationMin / 60) * pixelsPerHour;

                        const colors = getStatusColor(apt.status, hasOverlap);
                        // Hover tooltip surfaces the patient name and a
                        // one-line summary without crowding the chip face.
                        const serviceSummary = apt.services
                          ?.map((s) => s.service?.name)
                          .filter(Boolean)
                          .join(", ") || "—";
                        const tooltip = [
                          apt.patient.full_name,
                          `${format(aptStart, "HH:mm")}–${format(aptEnd, "HH:mm")}`,
                          serviceSummary,
                          apt.staff.full_name,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <DraggableAppointment
                            key={apt.id}
                            apt={apt}
                            onClick={() => onAppointmentClick(apt)}
                            title={tooltip}
                            className={cn(
                              "group absolute left-2 right-2 rounded p-2 text-left text-xs transition-all hover:shadow-md hover:z-20 z-10 overflow-hidden border-l-4",
                              colors.bg,
                              colors.hover,
                              colors.border,
                              apt.status === "CANCELLED" && "opacity-60",
                              apt.status === "RESCHEDULED" && "opacity-70",
                            )}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                            }}
                          >
                            {/* Single-line horizontal layout — time on the
                                left, service taking the flex middle (truncates
                                when narrow), staff name pinned to the right.
                                Putting staff on the right means a clinician
                                can scan a day for their own name without
                                reading every chip's body. Patient name is
                                intentionally omitted — click-through opens
                                the detail sheet for that lookup. */}
                            <div className="flex items-center gap-2 leading-tight">
                              <span className="font-medium tabular-nums shrink-0">
                                {format(aptStart, "HH:mm")}–{format(aptEnd, "HH:mm")}
                              </span>
                              <span className="font-medium truncate flex-1 min-w-0">
                                {apt.services
                                  ?.map((s) => s.service?.name)
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                              </span>
                              {hasWarning && heightPx < 65 && (
                                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                              )}
                              {selectedStaffId === "all" && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[40%] shrink-0">
                                  {apt.staff.full_name}
                                </span>
                              )}
                            </div>
                            {hasWarning && heightPx >= 65 && (
                              <div className="flex items-center gap-1 text-amber-600 text-[10px] mt-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Warning</span>
                              </div>
                            )}
                            <ResizeHandle
                              apt={apt}
                              pixelsPerHour={pixelsPerHour}
                              slotMinutes={slotMinutes}
                              onResized={onAppointmentMoved}
                            />
                          </DraggableAppointment>
                        );
                      })}

                      {/* Blocked Time Entries — same pixel-precise sizing
                          as appointments so the visual span matches the
                          actual blocked window. Click to unblock. */}
                      {getBlockedTimeForHour(hour).map((block) => {
                        const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
                        const blockEnd = toZonedTime(new Date(block.ends_at), UK_TIMEZONE);
                        const topPx = (blockStart.getMinutes() / 60) * pixelsPerHour;
                        const durationMin = Math.max(
                          5,
                          (blockEnd.getTime() - blockStart.getTime()) / 60000,
                        );
                        const heightPx = (durationMin / 60) * pixelsPerHour;
                        return (
                          <BlockedTimeChip
                            key={block.id}
                            block={block}
                            variant="timeline"
                            style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                          />
                        );
                      })}
                    </div>
                  </HourSlotSurface>
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
            {draggingApt.services
              ?.map((s) => s.service?.name)
              .filter(Boolean)
              .join(", ") || "—"}
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

// Single hover-tracking surface for one hour cell. Replaces the previous
// per-slot SelectableSlot pattern, which combined dnd-kit useDroppable refs
// with Radix PopoverTrigger asChild on the same DOM node. That combo was
// the root cause of the "hover only highlights in some places" bug —
// Radix's Slot composeRefs occasionally lost the dnd-kit ref's pointer
// wiring, leaving sub-regions of slots unhoverable.
//
// New shape:
//   - parent div listens for onPointerMove / onPointerLeave / onClick
//   - cursor Y → slot index → highlight + popover anchor
//   - dnd-kit gets per-slot invisible droppables ("ghosts") so drag-to-
//     reschedule still snaps to the configured granularity, but those
//     ghosts are pointer-events-none and don't compete with hover
function HourSlotSurface({
  hour,
  slotsPerHour,
  selectedDay,
  onAddAppointment,
  onBlockTime,
  children,
}: {
  hour: number;
  slotsPerHour: number;
  selectedDay: Date;
  onAddAppointment: (date?: Date, time?: string) => void;
  onBlockTime?: (date?: Date, time?: string) => void;
  children?: React.ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const slotForY = (clientY: number): number | null => {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top;
    if (y < 0 || y >= rect.height) return null;
    const raw = Math.floor((y / rect.height) * slotsPerHour);
    return Math.min(slotsPerHour - 1, Math.max(0, raw));
  };

  const minuteFor = (idx: number) => Math.round((idx * 60) / slotsPerHour);
  const timeStringFor = (idx: number) =>
    `${String(hour).padStart(2, "0")}:${String(minuteFor(idx)).padStart(2, "0")}`;

  const closePopover = () => setOpenIdx(null);

  const heightPercent = 100 / slotsPerHour;
  const highlightIdx = openIdx ?? hoveredIdx;

  return (
    <div
      ref={surfaceRef}
      className="relative p-2 h-full"
      onPointerMove={(e) => {
        const idx = slotForY(e.clientY);
        if (idx !== hoveredIdx) setHoveredIdx(idx);
      }}
      onPointerLeave={() => setHoveredIdx(null)}
      onClick={(e) => {
        // Chips have stopPropagation on their click handlers, so chip clicks
        // never reach here. This handler only fires for clicks on empty
        // slot space.
        if (e.target !== e.currentTarget && !(e.currentTarget as HTMLElement).contains(e.target as Node)) return;
        const idx = slotForY(e.clientY);
        if (idx !== null) setOpenIdx(idx);
      }}
    >
      {/* Hidden droppables so drag-to-reschedule still snaps to slots. */}
      {Array.from({ length: slotsPerHour }, (_, i) => (
        <DropZoneGhost
          key={`drop-${hour}-${i}`}
          hour={hour}
          minute={minuteFor(i)}
          topPercent={(i / slotsPerHour) * 100}
          heightPercent={heightPercent}
        />
      ))}

      {children}

      {/* Hover / open highlight overlay — always rendered when there's a
          slot to highlight, so we don't have to mount/unmount on each move
          (smoother visual). Pointer-events-none so it never intercepts
          clicks on chips or the surface itself. */}
      {highlightIdx !== null && (
        <div
          className={cn(
            "absolute left-0 right-0 pointer-events-none transition-colors",
            openIdx !== null && openIdx === highlightIdx
              ? "bg-primary/20 ring-1 ring-primary/50 ring-inset"
              : "bg-primary/10 ring-1 ring-primary/30 ring-inset",
          )}
          style={{
            top: `${(highlightIdx / slotsPerHour) * 100}%`,
            height: `${heightPercent}%`,
          }}
          aria-hidden
        >
          {hoveredIdx === highlightIdx && openIdx === null && (
            <span className="absolute inset-0 flex items-center justify-center gap-1 text-[10px] text-primary font-medium opacity-70">
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">{timeStringFor(highlightIdx)}</span>
            </span>
          )}
        </div>
      )}

      {/* Centered dialog for the chosen slot. Replaced the side-anchored
          popover so device-size variation doesn't push the chooser into a
          weird spot, and to give the two intents (book vs. block) more
          visual weight. */}
      <SlotActionDialog
        open={openIdx !== null}
        onOpenChange={(o) => !o && closePopover()}
        time={openIdx !== null ? timeStringFor(openIdx) : ""}
        onBook={() => {
          if (openIdx === null) return;
          onAddAppointment(selectedDay, timeStringFor(openIdx));
          closePopover();
        }}
        onBlock={() => {
          if (openIdx === null || !onBlockTime) return;
          onBlockTime(selectedDay, timeStringFor(openIdx));
          closePopover();
        }}
      />
    </div>
  );
}

// Invisible droppable target for one slot. Registers with @dnd-kit so a
// drag-to-reschedule operation snaps to the slot's minute, but doesn't
// participate in hover/click — those are handled by the parent surface.
function DropZoneGhost({
  hour,
  minute,
  topPercent,
  heightPercent,
}: {
  hour: number;
  minute: number;
  topPercent: number;
  heightPercent: number;
}) {
  const id = `slot:${hour}:${minute}`;
  const { setNodeRef, isOver } = useDroppable({ id, data: { hour, minute } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute left-0 right-0 pointer-events-none transition-colors",
        isOver && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
      )}
      style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
      aria-hidden
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
  title,
}: {
  apt: Appointment;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
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
      title={title}
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

// Bottom-edge resize handle. Bypasses dnd-kit by using native pointer
// events and stopping propagation in pointerDown so the parent chip's
// drag-to-move listener doesn't pick this up. Snaps the new duration
// to the timeline's slot granularity.
function ResizeHandle({
  apt,
  pixelsPerHour,
  slotMinutes,
  onResized,
}: {
  apt: Appointment;
  pixelsPerHour: number;
  slotMinutes: number;
  onResized?: () => void;
}) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const chipEl = e.currentTarget.parentElement as HTMLElement | null;
    if (!chipEl) return;
    const startY = e.clientY;
    const aptStart = new Date(apt.starts_at);
    const aptEnd = new Date(apt.ends_at);
    const startDurationMin = (aptEnd.getTime() - aptStart.getTime()) / 60000;
    const startHeightPx = (startDurationMin / 60) * pixelsPerHour;

    let lastSnappedMin = startDurationMin;

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      const deltaMin = (dy / pixelsPerHour) * 60;
      const newDurationMin = Math.max(slotMinutes, startDurationMin + deltaMin);
      // Snap to the slot grid so the visual jumps cleanly to the next slot.
      const snapped = Math.max(slotMinutes, Math.round(newDurationMin / slotMinutes) * slotMinutes);
      lastSnappedMin = snapped;
      chipEl.style.height = `${(snapped / 60) * pixelsPerHour}px`;
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (lastSnappedMin === startDurationMin) return;
      const newEndsAt = new Date(aptStart.getTime() + lastSnappedMin * 60_000);
      const { error } = await supabase
        .from("appointment")
        .update({ ends_at: newEndsAt.toISOString() })
        .eq("id", apt.id);
      if (error) {
        // 23P01 = exclusion_violation. The GiST constraint
        // appointment_staff_id_practice_id_tstzrange_excl blocks
        // overlapping non-cancelled appointments for the same staff —
        // surface that as the actual reason rather than a generic toast.
        const isOverlap =
          error.code === "23P01" || /overlap|exclusion/i.test(error.message);
        toast.error(
          isOverlap
            ? "Can't extend — overlaps with the next appointment"
            : "Couldn't resize appointment",
        );
        chipEl.style.height = `${startHeightPx}px`;
      } else {
        toast.success(`Duration changed to ${lastSnappedMin} min`);
        onResized?.();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-60 hover:!opacity-90 transition-opacity bg-foreground/30 rounded-b"
      title="Drag to resize duration"
    />
  );
}

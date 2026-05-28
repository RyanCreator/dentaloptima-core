import { useMemo, useState, useEffect } from "react";
import { format, isSameDay, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Coffee, Plane, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/appointmentUtils";
import type { Appointment } from "@/hooks/useAppointments";
import type { BlockedTimeEntry } from "@/hooks/useBlockedTime";
import { UK_TIMEZONE } from "@/lib/constants";
import { ScheduleOverlay } from "./ScheduleOverlay";
import { SlotActionDialog } from "./SlotActionDialog";
import { BlockedTimeChip } from "./BlockedTimeChip";
import { type DayContext, timeToMinutes } from "@/hooks/useDayContext";
import { SLOT_ROW_HEIGHT_PX, type SlotMinutes } from "@/hooks/usePracticeSetting";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useRescheduleAppointment } from "@/hooks/useRescheduleAppointment";
import {
  useStaffServiceMatrix,
  canStaffPerformServices,
} from "@/hooks/useStaffServiceMatrix";
import { logger } from "@/lib/logger";

interface CalendarMultiStaffViewProps {
  selectedDay: Date;
  appointments: Appointment[];
  blockedTimeEntries: BlockedTimeEntry[];
  staff: any[];
  onAppointmentClick: (apt: Appointment) => void;
  // Optional add/block callbacks. When supplied, every empty slot (per
  // staff × per minute) becomes clickable via a Book / Block popover —
  // matching the single-staff timeline's UX.
  onAddAppointment?: (date?: Date, time?: string, staffId?: string) => void;
  onBlockTime?: (date?: Date, time?: string, staffId?: string) => void;
  checkOverlap: (apt: Appointment) => boolean;
  checkWarning: (apt: Appointment) => boolean;
  startHour?: number;
  endHour?: number;
  // Practice-wide schedule context. Drives out-of-hours shading + closure
  // overlay over the whole grid, plus per-staff break / time-off shading on
  // each column.
  dayContext?: DayContext;
  // Visual grid granularity — drives the dashed divider count per hour and
  // (via SLOT_ROW_HEIGHT_PX) the row height so 10-min slots zoom in.
  slotMinutes?: SlotMinutes;
  /** Called after a successful drag-to-move so the parent can refetch. */
  onAppointmentMoved?: () => void;
}

const HEADER_HEIGHT_PX = 49;

export function CalendarMultiStaffView({
  selectedDay,
  appointments,
  blockedTimeEntries,
  staff,
  onAppointmentClick,
  onAddAppointment,
  onBlockTime,
  checkOverlap,
  checkWarning,
  startHour = 8,
  endHour = 20,
  dayContext,
  slotMinutes = 30,
  onAppointmentMoved,
}: CalendarMultiStaffViewProps) {
  const slotsPerHour = Math.max(1, Math.round(60 / slotMinutes));
  const ROW_HEIGHT_PX = SLOT_ROW_HEIGHT_PX[slotMinutes].multi;
  const [currentTime, setCurrentTime] = useState(new Date());

  // Drag-across-staff machinery. The chip is draggable; each slot in each
  // staff column is a droppable identified by `${staffId}:${hour}:${minute}`.
  // Drop validates that the target staff is assigned to every service on
  // the appointment (staff_service join) — if not, we reject and tell the
  // operator why instead of silently failing on the FK/exclusion path.
  const [draggingApt, setDraggingApt] = useState<Appointment | null>(null);
  const matrix = useStaffServiceMatrix();
  const { reschedule } = useRescheduleAppointment();

  // 8px activation distance lets a chip click still fire onAppointmentClick —
  // anything bigger feels like an intentional drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Service ids on the appointment being dragged. Computed once per drag
  // so per-column eligibility checks don't re-scan services[] on every
  // hover frame.
  const draggingServiceIds = useMemo(() => {
    if (!draggingApt) return [] as string[];
    return (draggingApt.services ?? [])
      .map((s) => s.service?.id)
      .filter((id): id is string => !!id);
  }, [draggingApt]);

  // Per-staff eligibility — set during drag, used to dim ineligible columns.
  const eligibleStaffIds = useMemo(() => {
    if (!draggingApt) return new Set<string>();
    const out = new Set<string>();
    for (const member of staff) {
      if (canStaffPerformServices(matrix, member.id, draggingServiceIds)) {
        out.add(member.id);
      }
    }
    return out;
  }, [draggingApt, draggingServiceIds, matrix, staff]);

  function handleDragStart(event: DragStartEvent) {
    const apt = event.active.data.current?.appointment as Appointment | undefined;
    if (apt) setDraggingApt(apt);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const apt = event.active.data.current?.appointment as Appointment | undefined;
    setDraggingApt(null);
    const drop = event.over?.data.current as
      | { staffId: string; hour: number; minute: number }
      | undefined;
    if (!apt || !drop) return;

    const serviceIds = (apt.services ?? [])
      .map((s) => s.service?.id)
      .filter((id): id is string => !!id);

    // Eligibility check FIRST — same DB call would fail more cryptically
    // (FK or business-logic error) without the friendlier message.
    if (!canStaffPerformServices(matrix, drop.staffId, serviceIds)) {
      const targetName =
        staff.find((m) => m.id === drop.staffId)?.full_name ?? "this clinician";
      const eligibleNames = staff
        .filter((m) => m.id !== drop.staffId && canStaffPerformServices(matrix, m.id, serviceIds))
        .map((m) => m.full_name)
        .filter(Boolean);
      const hint =
        eligibleNames.length > 0
          ? `Try ${eligibleNames.slice(0, 2).join(" or ")}.`
          : "No one else is assigned to this service — cancel and rebook?";
      toast.error(`${targetName} isn't assigned to this service. ${hint}`);
      return;
    }

    // Wall-clock time on selectedDay in UK timezone → UTC instant.
    const wallClock = setMilliseconds(
      setSeconds(setMinutes(setHours(selectedDay, drop.hour), drop.minute), 0),
      0,
    );
    const newStartsAt = fromZonedTime(wallClock, UK_TIMEZONE);

    // Same staff + same time → no-op.
    const sameStaff = apt.staff?.id === drop.staffId;
    const sameTime = new Date(apt.starts_at).getTime() === newStartsAt.getTime();
    if (sameStaff && sameTime) return;

    if (sameStaff) {
      const ok = await reschedule(apt, newStartsAt);
      if (ok) onAppointmentMoved?.();
      return;
    }

    // Cross-staff move: update staff_id alongside the new times. Preserve
    // duration exactly; dragging changes who/when, not how long. The
    // queue-pending flag is stamped via the existing reschedule notif
    // path so reception can confirm-and-send rather than spamming patients.
    const originalDurationMs =
      new Date(apt.ends_at).getTime() - new Date(apt.starts_at).getTime();
    const newEndsAt = new Date(newStartsAt.getTime() + originalDurationMs);

    if (newStartsAt < new Date()) {
      toast.error("Can't drop an appointment in the past");
      return;
    }

    const oldStarts = new Date(apt.starts_at);
    const { error } = await supabase
      .from("appointment")
      .update({
        staff_id: drop.staffId,
        starts_at: newStartsAt.toISOString(),
        ends_at: newEndsAt.toISOString(),
      })
      .eq("id", apt.id);

    if (error) {
      const isOverlap =
        (error as any).code === "23P01" || /overlap|exclusion/i.test(error.message);
      toast.error(
        isOverlap
          ? "That slot conflicts with another appointment for the target staff"
          : "Couldn't move appointment",
      );
      logger.error("Cross-staff move failed", error);
      return;
    }

    // Queue the patient notification for the bell tray — same convention
    // as drag-within-staff and edit-form reschedules.
    if (apt.status === "SCHEDULED") {
      const { markNotificationPending } = await import("@/hooks/useNotificationQueue");
      await markNotificationPending(apt.id, "RESCHEDULED", oldStarts);
    }
    const newStaffName = staff.find((m) => m.id === drop.staffId)?.full_name ?? "staff";
    toast.success(`Reassigned to ${newStaffName}`);
    onAppointmentMoved?.();
  }

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
    const pixelsFromMinutes = (currentMinute / 60) * ROW_HEIGHT_PX;

    return (hourIndex * ROW_HEIGHT_PX) + pixelsFromMinutes;
  };

  const currentTimePosition = getCurrentTimePosition();
  const totalBodyHeight = (endHour - startHour) * ROW_HEIGHT_PX;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingApt(null)}
    >
    <div className="bg-card rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <div className="relative min-w-[800px]">
          {/* Header Row - Staff Names */}
          <div className="sticky top-0 z-30 bg-card border-b">
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${staff.length}, 1fr)` }}>
              <div className="p-3 border-r font-medium text-sm text-muted-foreground">Time</div>
              {staff.map((member) => {
                const isOff = (dayContext?.staffTimeOff.get(member.id)?.length ?? 0) > 0;
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "p-3 border-r last:border-r-0 font-medium text-sm truncate text-center",
                      isOff && "text-muted-foreground",
                    )}
                    style={{
                      borderLeft: member.color_hex ? `3px solid ${member.color_hex}` : undefined,
                    }}
                  >
                    <div className="truncate">{member.full_name}</div>
                    {isOff && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/40 rounded px-1.5 py-0.5">
                        <Plane className="h-2.5 w-2.5" />
                        Off
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Practice-wide overlay: out-of-hours and closures stretch across
              all columns (offset right of the time-label column). The grid
              header sits above with z-30 so this stays in the body bounds. */}
          {dayContext && !dayContext.loading && (
            <div
              className="absolute pointer-events-none z-0"
              style={{
                top: `${HEADER_HEIGHT_PX}px`,
                left: 0,
                right: 0,
                height: `${totalBodyHeight}px`,
              }}
            >
              <ScheduleOverlay
                dayContext={dayContext}
                startHour={startHour}
                endHour={endHour}
                pixelsPerHour={ROW_HEIGHT_PX}
                leftOffsetPx={80}
              />
            </div>
          )}

          {/* Per-staff column overlay: breaks + time-off scrim. Uses the same
              grid template as the body so columns line up exactly. */}
          {dayContext && !dayContext.loading && (
            <div
              className="absolute pointer-events-none z-[1] grid"
              style={{
                top: `${HEADER_HEIGHT_PX}px`,
                left: 0,
                right: 0,
                height: `${totalBodyHeight}px`,
                gridTemplateColumns: `80px repeat(${staff.length}, 1fr)`,
              }}
            >
              <div /> {/* time column placeholder */}
              {staff.map((member) => (
                <StaffColumnOverlay
                  key={member.id}
                  staffId={member.id}
                  dayContext={dayContext}
                  startHour={startHour}
                  endHour={endHour}
                  pixelsPerHour={ROW_HEIGHT_PX}
                />
              ))}
            </div>
          )}

          {/* Current Time Indicator */}
          {currentTimePosition !== null && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: `${currentTimePosition + HEADER_HEIGHT_PX}px` }}
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
                  minHeight: `${ROW_HEIGHT_PX}px`,
                }}
              >
                {/* Time Label — bg-card so the schedule overlay's tint can't
                    leak into the time gutter. */}
                <div className="flex items-start justify-end pr-3 pt-2 text-xs font-medium text-muted-foreground border-r bg-card">
                  {format(new Date().setHours(hour, 0, 0, 0), "h:mm a")}
                </div>

                {/* Staff Columns */}
                {staff.map((member) => {
                  // One render per appointment — at its start hour. The chip
                  // gets a real pixel height matching its duration so it
                  // visually overflows into the next hour cell when needed,
                  // rather than ghost-rendering twice.
                  const staffAppointments = (appointmentsByStaff[member.id] || []).filter((apt) => {
                    const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
                    return aptStart.getHours() === hour;
                  });

                  // Eligibility scrim — when a drag is in progress, dim
                  // columns where the target staff isn't assigned to the
                  // appointment's services. Same scrim shows on every hour
                  // row so the visual cue spans the whole column.
                  const isIneligibleForDrag =
                    !!draggingApt && !eligibleStaffIds.has(member.id);

                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "relative border-r last:border-r-0 p-1",
                        isIneligibleForDrag &&
                          "bg-muted/40 opacity-50 transition-opacity",
                      )}
                    >
                      {/* Per-slot click targets. Cover the full cell height
                          stacked top-to-bottom. Each opens a popover with
                          Book / Block options scoped to this staff member at
                          this exact minute. Behind appointments visually but
                          clickable on empty space. */}
                      {(onAddAppointment || onBlockTime) &&
                        Array.from({ length: slotsPerHour }, (_, i) => {
                          const slotMinute = Math.round((i * 60) / slotsPerHour);
                          return (
                            <MultiStaffSlot
                              key={`slot-${hour}-${i}`}
                              hour={hour}
                              minute={slotMinute}
                              topPercent={(i / slotsPerHour) * 100}
                              heightPercent={100 / slotsPerHour}
                              selectedDay={selectedDay}
                              staffId={member.id}
                              staffName={member.full_name}
                              onAddAppointment={onAddAppointment}
                              onBlockTime={onBlockTime}
                            />
                          );
                        })}

                      {/* Drop-zone ghosts — one per slot, identified by
                          staff+hour+minute. Pointer-events-none so they
                          don't intercept slot clicks; only dnd-kit uses
                          them, via the over.data shape. */}
                      {Array.from({ length: slotsPerHour }, (_, i) => {
                        const slotMinute = Math.round((i * 60) / slotsPerHour);
                        return (
                          <MultiStaffDropGhost
                            key={`drop-${hour}-${i}`}
                            staffId={member.id}
                            hour={hour}
                            minute={slotMinute}
                            topPercent={(i / slotsPerHour) * 100}
                            heightPercent={100 / slotsPerHour}
                            eligible={!draggingApt || eligibleStaffIds.has(member.id)}
                          />
                        );
                      })}

                      {/* Inner slot dividers — slotsPerHour - 1 dashed lines
                          per hour cell. pointer-events-none so they don't
                          intercept slot clicks. */}
                      {Array.from({ length: slotsPerHour - 1 }, (_, i) => (
                        <div
                          key={`divider-${hour}-${i}`}
                          className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/10 pointer-events-none"
                          style={{ top: `${((i + 1) / slotsPerHour) * 100}%` }}
                        />
                      ))}

                      {/* Appointments — pixel-precise height so 30-min and
                          60-min chips look genuinely different, regardless
                          of granularity zoom or viewport width. */}
                      {staffAppointments.map((apt) => {
                        const hasOverlap = checkOverlap(apt);
                        const hasWarning = checkWarning(apt);
                        const aptStart = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
                        const aptEnd = toZonedTime(new Date(apt.ends_at), UK_TIMEZONE);
                        const topPx = (aptStart.getMinutes() / 60) * ROW_HEIGHT_PX;
                        const durationMin = Math.max(
                          5,
                          (aptEnd.getTime() - aptStart.getTime()) / 60000,
                        );
                        const heightPx = (durationMin / 60) * ROW_HEIGHT_PX;

                        const colors = getStatusColor(apt.status, hasOverlap);
                        const serviceSummary = apt.services
                          ?.map((s) => s.service?.name)
                          .filter(Boolean)
                          .join(", ") || "—";
                        const tooltip = [
                          apt.patient.full_name,
                          `${format(aptStart, "HH:mm")}–${format(aptEnd, "HH:mm")}`,
                          serviceSummary,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <DraggableMultiAppointment
                            key={apt.id}
                            apt={apt}
                            onClick={() => onAppointmentClick(apt)}
                            title={tooltip}
                            className={cn(
                              // z-10 keeps chips above the schedule overlays
                              // (out-of-hours, breaks, time-off scrim).
                              "absolute left-1 right-1 rounded px-2 py-1.5 text-left transition-all hover:shadow-md hover:z-20 z-10 overflow-hidden border-l-2",
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
                            {/* Multi-staff: time + service. Staff is
                                implied by the column. Patient name lives in
                                the detail sheet — clicking opens it. */}
                            <div className="font-semibold truncate text-[13px] leading-tight flex items-center gap-1">
                              <span>{format(aptStart, "HH:mm")}</span>
                              {hasWarning && (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              )}
                            </div>
                            {heightPx >= 36 && (
                              <div className="truncate text-xs leading-snug text-muted-foreground mt-0.5">
                                {apt.services
                                  ?.map((s) => s.service?.name)
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                              </div>
                            )}
                          </DraggableMultiAppointment>
                        );
                      })}

                      {/* Blocked Time — same pixel-precise height as
                          appointments. */}
                      {(blockedTimeByStaff[member.id] || [])
                        .filter((block) => {
                          const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
                          return blockStart.getHours() === hour;
                        })
                        .map((block) => {
                          const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
                          const blockEnd = toZonedTime(new Date(block.ends_at), UK_TIMEZONE);
                          const topPx = (blockStart.getMinutes() / 60) * ROW_HEIGHT_PX;
                          const durationMin = Math.max(
                            5,
                            (blockEnd.getTime() - blockStart.getTime()) / 60000,
                          );
                          const heightPx = (durationMin / 60) * ROW_HEIGHT_PX;

                          return (
                            <BlockedTimeChip
                              key={block.id}
                              block={block}
                              variant="multistaff"
                              style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                            />
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
    <DragOverlay>
      {draggingApt ? (
        <div className="rounded p-2 text-xs bg-blue-100 border-l-4 border-blue-500 shadow-lg max-w-[220px]">
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

// Per-column overlay: paints the staff member's lunch / break windows and a
// full-column scrim when they're on time-off. Sits in a parallel grid that
// uses the same column template as the body, so left/right edges line up
// with the actual staff column even when the user resizes the viewport.
function StaffColumnOverlay({
  staffId,
  dayContext,
  startHour,
  endHour,
  pixelsPerHour,
}: {
  staffId: string;
  dayContext: DayContext;
  startHour: number;
  endHour: number;
  pixelsPerHour: number;
}) {
  const breaks = dayContext.staffBreaks.get(staffId) ?? [];
  const timeOff = dayContext.staffTimeOff.get(staffId) ?? [];
  const isOff = timeOff.length > 0;

  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;
  const totalHeight = (endHour - startHour) * pixelsPerHour;

  const minutesToY = (minutes: number) => {
    const clamped = Math.max(startMinutes, Math.min(endMinutes, minutes));
    return ((clamped - startMinutes) / 60) * pixelsPerHour;
  };

  const reasonLabel = isOff
    ? timeOffTypeLabel(timeOff[0].time_off_type)
    : null;

  return (
    <div className="relative" style={{ height: `${totalHeight}px` }}>
      {/* Time-off: gentle scrim so overlapping appointments are still
          visible; the header badge has already announced the status. */}
      {isOff && (
        <div className="absolute inset-0 bg-amber-50/60 dark:bg-amber-950/20 border-l-2 border-amber-300/40 dark:border-amber-800/40">
          <div className="px-1.5 pt-1 text-[9px] font-semibold uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">
            Off · {reasonLabel}
          </div>
        </div>
      )}

      {/* Recurring breaks. */}
      {breaks.map((b) => {
        const startM = timeToMinutes(b.start_time);
        const endM = timeToMinutes(b.end_time);
        if (startM === null || endM === null) return null;
        if (endM <= startMinutes || startM >= endMinutes) return null;
        const top = minutesToY(startM);
        const height = minutesToY(endM) - top;
        return (
          <div
            key={`break-${b.id}`}
            className="absolute left-0 right-0 bg-amber-100/60 dark:bg-amber-950/30 border-y border-amber-200/50 dark:border-amber-900/40 flex items-center px-1.5 gap-1 text-[9px] font-medium text-amber-900 dark:text-amber-200"
            style={{ top: `${top}px`, height: `${Math.max(height, 12)}px` }}
            title={`${b.label} ${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}`}
          >
            <Coffee className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Per-staff slot click target. Same UX shape as the single-staff timeline's
// SelectableSlot but scoped to one staff member, so the popover passes
// `staffId` to onAddAppointment / onBlockTime and the booking sheet opens
// pre-filled to the right person.
function MultiStaffSlot({
  hour,
  minute,
  topPercent,
  heightPercent,
  selectedDay,
  staffId,
  staffName,
  onAddAppointment,
  onBlockTime,
}: {
  hour: number;
  minute: number;
  topPercent: number;
  heightPercent: number;
  selectedDay: Date;
  staffId: string;
  staffName?: string | null;
  onAddAppointment?: (date?: Date, time?: string, staffId?: string) => void;
  onBlockTime?: (date?: Date, time?: string, staffId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const showHighlight = hovering || open;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "absolute left-0 right-0 cursor-pointer transition-colors",
          showHighlight && "bg-primary/10 ring-1 ring-primary/30 ring-inset",
          open && "bg-primary/20 ring-primary/50",
        )}
        style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
        aria-label={`Open actions for ${staffName ?? "staff"} at ${timeString}`}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <SlotActionDialog
        open={open}
        onOpenChange={setOpen}
        time={timeString}
        staffName={staffName}
        onBook={() => {
          onAddAppointment?.(selectedDay, timeString, staffId);
          setOpen(false);
        }}
        onBlock={() => {
          onBlockTime?.(selectedDay, timeString, staffId);
          setOpen(false);
        }}
      />
    </>
  );
}

// Draggable wrapper for a multi-staff appointment chip. Uses an
// 8px activation distance so a click still falls through to the parent's
// onAppointmentClick — anything bigger is treated as a drag intent.
function DraggableMultiAppointment({
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
    id: `multi-${apt.id}`,
    data: { appointment: apt },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
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
        isDragging && "opacity-30",
      )}
    >
      {children}
    </div>
  );
}

// Invisible drop target tied to one (staff, hour, minute) slot in the
// multi-staff grid. When eligible=false (target staff isn't assigned to
// the dragged appointment's services), the cell isn't allowed to absorb
// the drop and we paint a soft "not allowed" hint while hovered.
function MultiStaffDropGhost({
  staffId,
  hour,
  minute,
  topPercent,
  heightPercent,
  eligible,
}: {
  staffId: string;
  hour: number;
  minute: number;
  topPercent: number;
  heightPercent: number;
  eligible: boolean;
}) {
  const id = `multi-slot:${staffId}:${hour}:${minute}`;
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { staffId, hour, minute },
    disabled: !eligible,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute left-0 right-0 pointer-events-none transition-colors",
        isOver && eligible && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
        isOver && !eligible && "bg-red-500/10 ring-1 ring-red-500/40 ring-inset",
      )}
      style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
      aria-hidden
    />
  );
}

function timeOffTypeLabel(type: string): string {
  // Maps the staff_time_off_type enum (HOLIDAY/SICK/TRAINING/COMPASSIONATE/OTHER)
  // to a friendly badge label.
  switch (type) {
    case "HOLIDAY":
      return "Holiday";
    case "SICK":
      return "Sick";
    case "TRAINING":
      return "Training";
    case "COMPASSIONATE":
      return "Leave";
    default:
      return "Off";
  }
}

import { Coffee, Lock } from "lucide-react";
import {
  type DayContext,
  type StaffBreakForDay,
  timeToMinutes,
} from "@/hooks/useDayContext";

// Renders the "when is the practice (or this staff member) actually working?"
// shading layer behind appointment chips. Sits inside the same `relative`
// container as the timeline grid and uses the same `pixelsPerHour` ladder, so
// shading lines up with hour rows pixel-perfect.
//
// Layers, top to bottom (lowest opacity first so appointments stay legible):
//   1. Out-of-hours bands at the top + bottom of the visible window
//   2. Per-staff breaks (when a staff filter is active or in multi-staff)
//   3. Partial-day closure slices
//   4. Full-day closure tint over everything
//
// Click-through: the whole overlay is `pointer-events-none` so the user can
// still click empty cells to add appointments and grab chips to drag them.

interface ScheduleOverlayProps {
  dayContext: DayContext;
  startHour: number;
  endHour: number;
  pixelsPerHour: number;
  /**
   * Breaks to render. In single-staff timeline this is the chosen staff's
   * breaks (or empty when "All staff" is filtered, since breaks are per-person
   * and overlaying one set on a mixed view would be misleading).
   */
  breaks?: StaffBreakForDay[];
  /** Optional left offset to align with the appointment column rather than the time-label column. */
  leftOffsetPx?: number;
}

export function ScheduleOverlay({
  dayContext,
  startHour,
  endHour,
  pixelsPerHour,
  breaks = [],
  leftOffsetPx = 0,
}: ScheduleOverlayProps) {
  const totalHeight = (endHour - startHour) * pixelsPerHour;
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  // Pixel y for an absolute minutes-from-midnight value, clamped to the
  // visible window so a 06:00 break or 22:00 closure doesn't paint outside.
  const minutesToY = (minutes: number) => {
    const clamped = Math.max(startMinutes, Math.min(endMinutes, minutes));
    return ((clamped - startMinutes) / 60) * pixelsPerHour;
  };

  const openMin = timeToMinutes(dayContext.practiceHours?.open_time);
  const closeMin = timeToMinutes(dayContext.practiceHours?.close_time);
  const hasHours = openMin !== null && closeMin !== null;

  const partialClosures = dayContext.closures.filter(
    (c) => !c.is_full_day && c.starts_time && c.ends_time,
  );

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-0"
      style={{
        left: `${leftOffsetPx}px`,
        right: 0,
        height: `${totalHeight}px`,
      }}
      aria-hidden
    >
      {/* Out-of-hours: only when we have explicit open/close times. If the
          practice is closed all weekday or there's no hours row, the closure
          banner above the grid carries the message instead — shading the
          entire grid would over-emphasise it. */}
      {hasHours && openMin > startMinutes && (
        <OutOfHoursBand top={0} height={minutesToY(openMin)} label="Closed" />
      )}
      {hasHours && closeMin < endMinutes && (
        <OutOfHoursBand
          top={minutesToY(closeMin)}
          height={totalHeight - minutesToY(closeMin)}
          label="Closed"
        />
      )}

      {/* Recurring breaks (lunch, etc.). Drawn above out-of-hours so the
          gradient still reads if a break butts up against close_time. */}
      {breaks.map((b) => {
        const startM = timeToMinutes(b.start_time);
        const endM = timeToMinutes(b.end_time);
        if (startM === null || endM === null || endM <= startMinutes || startM >= endMinutes) {
          return null;
        }
        const top = minutesToY(startM);
        const height = minutesToY(endM) - top;
        return (
          <div
            key={`break-${b.id}`}
            className="absolute left-0 right-0 bg-amber-100/60 dark:bg-amber-950/30 border-y border-amber-200/60 dark:border-amber-900/40 flex items-center px-3 gap-1.5 text-[10px] font-medium text-amber-900 dark:text-amber-200"
            style={{ top: `${top}px`, height: `${Math.max(height, 14)}px` }}
            title={`${b.label} ${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}`}
          >
            <Coffee className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {b.label} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
            </span>
          </div>
        );
      })}

      {/* Partial-day closures. e.g. early-close at 13:00 for staff training. */}
      {partialClosures.map((c) => {
        const startM = timeToMinutes(c.starts_time);
        const endM = timeToMinutes(c.ends_time);
        if (startM === null || endM === null) return null;
        if (endM <= startMinutes || startM >= endMinutes) return null;
        const top = minutesToY(startM);
        const height = minutesToY(endM) - top;
        return (
          <div
            key={`closure-${c.id}`}
            className="absolute left-0 right-0 bg-red-100/60 dark:bg-red-950/30 border-y border-red-200/70 dark:border-red-900/50 flex items-center px-3 gap-1.5 text-[10px] font-semibold text-red-700 dark:text-red-300"
            style={{ top: `${top}px`, height: `${Math.max(height, 14)}px` }}
            title={c.reason}
          >
            <Lock className="h-3 w-3 shrink-0" />
            <span className="truncate">Closed: {c.reason}</span>
          </div>
        );
      })}

      {/* Full-day closure: gentle red tint over everything. The banner above
          the timeline announces the reason — this just colour-codes the grid
          so it's visually obvious the day is unbookable. */}
      {dayContext.fullDayClosure && (
        <div className="absolute inset-0 bg-red-50/60 dark:bg-red-950/15" />
      )}
    </div>
  );
}

function OutOfHoursBand({
  top,
  height,
  label,
}: {
  top: number;
  height: number;
  label: string;
}) {
  if (height <= 0) return null;
  return (
    <div
      className="absolute left-0 right-0 bg-muted/50 dark:bg-muted/30"
      style={{ top: `${top}px`, height: `${height}px` }}
      aria-label={label}
    />
  );
}

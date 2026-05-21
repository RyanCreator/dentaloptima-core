import { useState, useMemo } from "react";
import { format, isFuture, isPast, parseISO, differenceInDays } from "date-fns";
import { Plus, Trash2, CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { TimeOff } from "@/hooks/useStaffTimeOff";

// Adapted to dentaloptima-core's date-only `staff_time_off` schema. The new
// table uses `starts_on` / `ends_on` (date) rather than the legacy
// `starts_at` / `ends_at` (timestamp). Half-day and custom-hours options
// were dropped — for partial days, use `blocked_time` (which is timestamp
// ranged and stays inside the calendar grid).

interface TimeOffManagerProps {
  timeOff: TimeOff[];
  staffId: string | undefined;
  onAddTimeOff: (dates: Date[], reason: string) => Promise<void>;
  onDeleteTimeOff: (id: string) => Promise<void>;
  reloadTimeOff: () => Promise<void>;
}

// staff_time_off date strings come back as YYYY-MM-DD. Construct a UTC-ish
// Date so day-comparison helpers (isFuture/isPast) read the same calendar
// day across timezones.
function toDate(d: string): Date {
  return parseISO(d);
}

export function TimeOffManager({
  timeOff,
  onAddTimeOff,
  onDeleteTimeOff,
}: TimeOffManagerProps) {
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [timeOffReason, setTimeOffReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAddTimeOff = async () => {
    if (selectedDates.length === 0) return;
    setSubmitting(true);
    await onAddTimeOff(selectedDates, timeOffReason);
    setSelectedDates([]);
    setTimeOffReason("");
    setSubmitting(false);
  };

  const { upcoming, past, current } = useMemo(() => {
    const upcoming: TimeOff[] = [];
    const past: TimeOff[] = [];
    const current: TimeOff[] = [];

    timeOff.forEach((to) => {
      const startDate = toDate(to.starts_on);
      const endDate = toDate(to.ends_on);

      if (isFuture(startDate)) {
        upcoming.push(to);
      } else if (isPast(endDate)) {
        past.push(to);
      } else {
        current.push(to);
      }
    });

    return { upcoming, past, current };
  }, [timeOff]);

  const getTimeOffBadgeColor = (to: TimeOff) => {
    const startDate = toDate(to.starts_on);
    const endDate = toDate(to.ends_on);

    if (isFuture(startDate))
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    if (isPast(endDate)) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  };

  const getDaysUntil = (to: TimeOff) => {
    const startDate = toDate(to.starts_on);
    const days = differenceInDays(startDate, new Date());
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days > 1) return `In ${days} days`;
    return null;
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="font-semibold">Time Off</h3>
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Time Off
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add Time Off</SheetTitle>
              <SheetDescription className="sr-only">
                Add full-day time off for this staff member. For partial-day blocks, use
                the calendar's Block Time button instead.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Select Date(s)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDates.length > 0
                        ? `${selectedDates.length} date(s) selected`
                        : "Pick dates"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={(dates) => setSelectedDates(dates || [])}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground mt-1">
                  Consecutive dates are saved as one entry; gaps create separate entries.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  placeholder="e.g., Holiday, Training, Sick"
                  value={timeOffReason}
                  onChange={(e) => setTimeOffReason(e.target.value)}
                />
              </div>

              <Button
                onClick={handleAddTimeOff}
                className="w-full"
                disabled={selectedDates.length === 0 || submitting}
              >
                {submitting ? "Adding..." : "Add Time Off"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {(current.length > 0 || upcoming.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {current.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Currently Off
                </span>
              </div>
              {current.map((to) => (
                <div key={to.id} className="text-sm text-amber-800 dark:text-amber-200">
                  Until {format(toDate(to.ends_on), "MMM d")}
                  {to.reason && <span className="text-xs ml-1">({to.reason})</span>}
                </div>
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Next Time Off
                </span>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">
                {format(toDate(upcoming[0].starts_on), "MMM d, yyyy")}
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {getDaysUntil(upcoming[0])}
                  {upcoming[0].reason && ` • ${upcoming[0].reason}`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Upcoming Time Off</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {upcoming.map((to) => (
              <div
                key={to.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTimeOffBadgeColor(to)}`}
                    >
                      {getDaysUntil(to)}
                    </span>
                  </div>
                  <p className="text-sm font-medium">
                    {format(toDate(to.starts_on), "PPP")}
                    {to.starts_on !== to.ends_on && ` – ${format(toDate(to.ends_on), "PPP")}`}
                  </p>
                  {to.reason && <p className="text-xs text-muted-foreground mt-1">{to.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteTimeOff(to.id)}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Past Time Off</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {past.slice(0, 5).map((to) => (
              <div
                key={to.id}
                className="flex items-center justify-between p-2 border rounded-lg bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {format(toDate(to.starts_on), "PP")}
                    {to.starts_on !== to.ends_on && ` – ${format(toDate(to.ends_on), "PP")}`}
                  </p>
                  {to.reason && <p className="text-xs text-muted-foreground/70">{to.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteTimeOff(to.id)}
                  className="shrink-0 h-6 w-6 p-0"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {past.length > 5 && (
              <p className="text-xs text-center text-muted-foreground py-1">
                +{past.length - 5} more past entries
              </p>
            )}
          </div>
        </div>
      )}

      {timeOff.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No time off scheduled</p>
      )}
    </div>
  );
}

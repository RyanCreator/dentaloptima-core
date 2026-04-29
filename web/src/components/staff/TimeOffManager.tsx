import { useState, useMemo } from "react";
import { format, isFuture, isPast, isToday, differenceInDays } from "date-fns";
import { Plus, Trash2, CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { TimeOff } from "@/hooks/useStaffTimeOff";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TimeOffManagerProps {
  timeOff: TimeOff[];
  staffId: string | undefined;
  onAddTimeOff: (
    dates: Date[],
    type: "full" | "half" | "custom",
    customStartTime: string,
    customEndTime: string,
    reason: string
  ) => Promise<void>;
  onDeleteTimeOff: (id: string) => Promise<void>;
  reloadTimeOff: () => Promise<void>;
}

export function TimeOffManager({ timeOff, staffId, onAddTimeOff, onDeleteTimeOff, reloadTimeOff }: TimeOffManagerProps) {
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [timeOffType, setTimeOffType] = useState<"full" | "half" | "custom">("full");
  const [customStartTime, setCustomStartTime] = useState("09:00");
  const [customEndTime, setCustomEndTime] = useState("17:00");
  const [timeOffReason, setTimeOffReason] = useState("");

  const handleAddTimeOff = async () => {
    if (selectedDates.length === 0) return;

    // For full days with multiple dates, check if they're consecutive
    if (timeOffType === "full" && selectedDates.length > 1) {
      // Sort dates
      const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());

      // Check if dates are consecutive
      let isConsecutive = true;
      for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i - 1]);
        const currentDate = new Date(sortedDates[i]);
        const daysDiff = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff !== 1) {
          isConsecutive = false;
          break;
        }
      }

      // If consecutive, create one block entry
      if (isConsecutive) {
        const starts_at = new Date(sortedDates[0].setHours(0, 0, 0, 0)).toISOString();
        const ends_at = new Date(sortedDates[sortedDates.length - 1].setHours(23, 59, 59, 999)).toISOString();

        if (!staffId) return;

        const { error } = await supabase.from("staff_time_off").insert({
          staff_id: staffId,
          starts_at,
          ends_at,
          reason: timeOffReason || null,
        });

        if (error) {
          toast.error("Failed to add time off");
        } else {
          toast.success(`Added time off block (${selectedDates.length} days)`);
          reloadTimeOff();
        }

        setSelectedDates([]);
        setTimeOffReason("");
        return;
      }
    }

    // Otherwise, use the original method (individual days or non-consecutive)
    await onAddTimeOff(selectedDates, timeOffType, customStartTime, customEndTime, timeOffReason);
    setSelectedDates([]);
    setTimeOffReason("");
  };

  // Categorize time off
  const { upcoming, past, current } = useMemo(() => {
    const now = new Date();
    const upcoming: TimeOff[] = [];
    const past: TimeOff[] = [];
    const current: TimeOff[] = [];

    timeOff.forEach((to) => {
      const startDate = new Date(to.starts_at);
      const endDate = new Date(to.ends_at);

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
    const startDate = new Date(to.starts_at);
    const endDate = new Date(to.ends_at);

    if (isFuture(startDate)) return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    if (isPast(endDate)) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  };

  const getDaysUntil = (to: TimeOff) => {
    const startDate = new Date(to.starts_at);
    const days = differenceInDays(startDate, new Date());
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days > 1) return `In ${days} days`;
    return null;
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="font-semibold">Time Off & Schedule Exceptions</h3>
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Time Off
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add Time Off / Exception</SheetTitle>
              <SheetDescription className="sr-only">
                Add a time off period or schedule exception for this staff member
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
              </div>

              <div className="space-y-2">
                <Label>Time Off Type</Label>
                <Select
                  value={timeOffType}
                  onValueChange={(v) => setTimeOffType(v as "full" | "half" | "custom")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Day</SelectItem>
                    <SelectItem value="half">Half Day (Morning)</SelectItem>
                    <SelectItem value="custom">Custom Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {timeOffType === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={customStartTime}
                      onChange={(e) => setCustomStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={customEndTime}
                      onChange={(e) => setCustomEndTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason (Optional)</Label>
                <Input
                  placeholder="e.g., Holiday, Training, etc."
                  value={timeOffReason}
                  onChange={(e) => setTimeOffReason(e.target.value)}
                />
              </div>

              <Button onClick={handleAddTimeOff} className="w-full" disabled={selectedDates.length === 0}>
                Add Time Off
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Time Off Summary Cards */}
      {(current.length > 0 || upcoming.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Current Time Off */}
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
                  Until {format(new Date(to.ends_at), "MMM d")}
                  {to.reason && <span className="text-xs ml-1">({to.reason})</span>}
                </div>
              ))}
            </div>
          )}

          {/* Next Upcoming */}
          {upcoming.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Next Time Off
                </span>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">
                {format(new Date(upcoming[0].starts_at), "MMM d, yyyy")}
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {getDaysUntil(upcoming[0])}
                  {upcoming[0].reason && ` • ${upcoming[0].reason}`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming Time Off */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Upcoming Time Off</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {upcoming.map((to) => (
              <div key={to.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTimeOffBadgeColor(to)}`}>
                      {getDaysUntil(to)}
                    </span>
                  </div>
                  <p className="text-sm font-medium">
                    {format(new Date(to.starts_at), "PPP")}
                    {new Date(to.starts_at).toDateString() !== new Date(to.ends_at).toDateString() &&
                      ` - ${format(new Date(to.ends_at), "PPP")}`}
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

      {/* Past Time Off */}
      {past.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Past Time Off</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {past.slice(0, 5).map((to) => (
              <div key={to.id} className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(to.starts_at), "PP")}
                    {new Date(to.starts_at).toDateString() !== new Date(to.ends_at).toDateString() &&
                      ` - ${format(new Date(to.ends_at), "PP")}`}
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

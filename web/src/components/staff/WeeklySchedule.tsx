import { useState } from "react";
import { Clock, Plus, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import type { Availability } from "@/hooks/useStaffSchedule";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Break {
  start: string;
  end: string;
}

interface WeeklyScheduleProps {
  schedule: Availability[];
  onUpdateDay: (weekday: number, updates: Partial<Availability>) => Promise<void>;
}

export function WeeklySchedule({ schedule, onUpdateDay }: WeeklyScheduleProps) {
  const [editingDay, setEditingDay] = useState<Availability | null>(null);
  const [isEditDayOpen, setIsEditDayOpen] = useState(false);
  const [editingBreaks, setEditingBreaks] = useState<Break[]>([]);
  const [breakErrors, setBreakErrors] = useState<string[]>([]);

  const openEditDay = (day: Availability) => {
    setEditingDay({ ...day });

    // Initialize breaks array from the day's breaks
    const breaks: Break[] = day.breaks && day.breaks.length > 0
      ? day.breaks.map(b => ({ start: b.start_time, end: b.end_time }))
      : [];

    setEditingBreaks(breaks);
    setBreakErrors([]);
    setIsEditDayOpen(true);
  };

  const validateBreaks = (): boolean => {
    if (!editingDay || !editingDay.is_working) return true;

    const workStart = timeToMinutes(editingDay.start_time);
    const workEnd = timeToMinutes(editingDay.end_time);
    const errors: string[] = [];

    editingBreaks.forEach((breakTime, index) => {
      const breakStart = timeToMinutes(breakTime.start);
      const breakEnd = timeToMinutes(breakTime.end);

      // Check if break times are valid
      if (breakStart >= breakEnd) {
        errors[index] = "Break end time must be after start time";
      } else if (breakStart < workStart) {
        errors[index] = `Break starts before working hours (${editingDay.start_time.slice(0, 5)})`;
      } else if (breakEnd > workEnd) {
        errors[index] = `Break ends after working hours (${editingDay.end_time.slice(0, 5)})`;
      } else if (breakStart < workStart || breakEnd > workEnd) {
        errors[index] = "Break must be within working hours";
      }
    });

    setBreakErrors(errors);
    return errors.filter(Boolean).length === 0;
  };

  const saveEditingDay = async () => {
    if (!editingDay) return;

    // Validate breaks before saving
    if (!validateBreaks()) {
      toast.error("Please fix break time errors before saving");
      return;
    }

    // Convert breaks from local format to Availability format
    const breaksToSave = editingBreaks.map(b => ({
      start_time: b.start,
      end_time: b.end,
    }));

    const updates = {
      ...editingDay,
      breaks: breaksToSave,
      no_break: editingBreaks.length === 0,
      // Keep legacy fields for backward compatibility
      break_start: editingBreaks.length > 0 ? editingBreaks[0].start : undefined,
      break_end: editingBreaks.length > 0 ? editingBreaks[0].end : undefined,
    };

    await onUpdateDay(editingDay.weekday, updates);
    setIsEditDayOpen(false);
    setEditingDay(null);
    setEditingBreaks([]);
    setBreakErrors([]);
  };

  const addBreak = () => {
    setEditingBreaks([...editingBreaks, { start: "12:00", end: "13:00" }]);
  };

  const removeBreak = (index: number) => {
    setEditingBreaks(editingBreaks.filter((_, i) => i !== index));
  };

  const updateBreak = (index: number, field: "start" | "end", value: string) => {
    const newBreaks = [...editingBreaks];
    newBreaks[index][field] = value;
    setEditingBreaks(newBreaks);

    // Clear error for this break when user makes changes
    const newErrors = [...breakErrors];
    newErrors[index] = "";
    setBreakErrors(newErrors);
  };

  const calculateDayHours = (day: Availability): number => {
    if (!day.is_working) return 0;

    const startMinutes = timeToMinutes(day.start_time);
    const endMinutes = timeToMinutes(day.end_time);
    let totalMinutes = endMinutes - startMinutes;

    // Subtract all break times
    if (day.breaks && day.breaks.length > 0) {
      day.breaks.forEach(breakTime => {
        const breakStart = timeToMinutes(breakTime.start_time);
        const breakEnd = timeToMinutes(breakTime.end_time);
        totalMinutes -= (breakEnd - breakStart);
      });
    }

    return totalMinutes / 60; // Return hours as decimal
  };

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const formatHours = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5" />
        Weekly Schedule
      </h3>

      {/* Grid layout for days */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {schedule.map((day) => {
          const hours = calculateDayHours(day);
          return (
            <button
              key={day.weekday}
              onClick={() => openEditDay(day)}
              className={`relative border rounded-lg p-4 transition-all text-left w-full ${
                day.is_working
                  ? "bg-card hover:bg-muted/50 border-border"
                  : "bg-muted/30 border-dashed border-muted-foreground/30"
              }`}
            >
              {/* Day header */}
              <div className="mb-3">
                <h4 className="font-medium text-sm">{WEEKDAYS[day.weekday - 1]}</h4>
              </div>

              {/* Day content */}
              <div className="space-y-3">
                {day.is_working ? (
                  <>
                    {/* Working hours - prominent display */}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">
                        {day.start_time.slice(0, 5)} - {day.end_time.slice(0, 5)}
                      </span>
                      <span className="text-sm font-semibold text-primary px-2 py-0.5 bg-primary/10 rounded">
                        {formatHours(hours)}
                      </span>
                    </div>

                    {/* Breaks - compact list */}
                    {day.breaks && day.breaks.length > 0 && (
                      <div className="pt-2 border-t space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {day.breaks.length} Break{day.breaks.length > 1 ? 's' : ''}
                        </span>
                        {day.breaks.map((breakTime, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                              {idx + 1}
                            </span>
                            <span>
                              {breakTime.start_time.slice(0, 5)} - {breakTime.end_time.slice(0, 5)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6">
                    <span className="text-sm text-muted-foreground">Day Off</span>
                  </div>
                )}
              </div>

              {/* Visual indicator bar */}
              {day.is_working && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20 rounded-b-lg">
                  <div
                    className="h-full bg-primary rounded-b-lg transition-all"
                    style={{ width: `${Math.min((hours / 12) * 100, 100)}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Edit Day Sheet */}
      <Sheet open={isEditDayOpen} onOpenChange={setIsEditDayOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit {editingDay && WEEKDAYS[editingDay.weekday - 1]}</SheetTitle>
            <SheetDescription className="sr-only">
              Configure working hours and breaks for this day
            </SheetDescription>
          </SheetHeader>
          {editingDay && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <Label>Working this day</Label>
                <Switch
                  checked={editingDay.is_working}
                  onCheckedChange={(checked) =>
                    setEditingDay({ ...editingDay, is_working: checked })
                  }
                />
              </div>

              {editingDay.is_working && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={editingDay.start_time.slice(0, 5)}
                        onChange={(e) =>
                          setEditingDay({ ...editingDay, start_time: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={editingDay.end_time.slice(0, 5)}
                        onChange={(e) =>
                          setEditingDay({ ...editingDay, end_time: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Breaks Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Breaks</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addBreak}
                        className="h-8"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Break
                      </Button>
                    </div>

                    {editingBreaks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                        No breaks scheduled
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {editingBreaks.map((breakTime, index) => (
                          <div key={index} className="space-y-2">
                            <div className={`flex items-end gap-2 p-3 border rounded-lg ${
                              breakErrors[index] ? "border-destructive bg-destructive/5" : "bg-muted/50"
                            }`}>
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Start</Label>
                                  <Input
                                    type="time"
                                    value={breakTime.start.slice(0, 5)}
                                    onChange={(e) => updateBreak(index, "start", e.target.value)}
                                    onBlur={validateBreaks}
                                    className={`h-9 ${breakErrors[index] ? "border-destructive" : ""}`}
                                    aria-invalid={!!breakErrors[index]}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">End</Label>
                                  <Input
                                    type="time"
                                    value={breakTime.end.slice(0, 5)}
                                    onChange={(e) => updateBreak(index, "end", e.target.value)}
                                    onBlur={validateBreaks}
                                    className={`h-9 ${breakErrors[index] ? "border-destructive" : ""}`}
                                    aria-invalid={!!breakErrors[index]}
                                  />
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeBreak(index)}
                                className="h-9 w-9 p-0 shrink-0"
                                aria-label="Remove break"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            {breakErrors[index] && (
                              <div className="flex items-start gap-2 text-xs text-destructive pl-3" role="alert">
                                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{breakErrors[index]}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <Button onClick={saveEditingDay} className="w-full">
                Save Changes
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

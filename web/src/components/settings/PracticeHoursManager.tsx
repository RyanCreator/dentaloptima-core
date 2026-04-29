import { useState } from "react";
import { Clock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePracticeHours, type PracticeHours } from "@/hooks/usePracticeHours";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface DaySchedule {
  weekday: number;
  hours: PracticeHours[];
}

export function PracticeHoursManager() {
  const { hours, loading, addHours, deleteHours } = usePracticeHours();
  const [editingDay, setEditingDay] = useState<DaySchedule | null>(null);
  const [isEditDayOpen, setIsEditDayOpen] = useState(false);
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newEndTime, setNewEndTime] = useState("17:00");

  // Group hours by weekday
  const getDaySchedule = (weekday: number): DaySchedule => {
    const dayHours = hours.filter(h => h.weekday === weekday);
    return { weekday, hours: dayHours };
  };

  const openEditDay = (weekday: number) => {
    const daySchedule = getDaySchedule(weekday);
    setEditingDay(daySchedule);
    setNewStartTime("09:00");
    setNewEndTime("17:00");
    setIsEditDayOpen(true);
  };

  const handleAddHours = async () => {
    if (!editingDay) return;

    await addHours(editingDay.weekday, newStartTime, newEndTime);
    // Refresh the editing day data
    const updated = getDaySchedule(editingDay.weekday);
    setEditingDay(updated);
    setNewStartTime("09:00");
    setNewEndTime("17:00");
  };

  const handleDeleteHours = async (id: string) => {
    const success = await deleteHours(id);
    if (success && editingDay) {
      // Refresh the editing day data
      const updated = getDaySchedule(editingDay.weekday);
      setEditingDay(updated);
    }
  };

  const calculateDayHours = (daySchedule: DaySchedule): number => {
    if (daySchedule.hours.length === 0) return 0;

    return daySchedule.hours.reduce((total, hour) => {
      const startMinutes = timeToMinutes(hour.start_time);
      const endMinutes = timeToMinutes(hour.end_time);
      return total + (endMinutes - startMinutes);
    }, 0) / 60; // Return hours as decimal
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

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5" />
        Practice Opening Hours
      </h3>

      {/* Grid layout for days */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WEEKDAYS.map((dayName, idx) => {
          const weekday = idx + 1;
          const daySchedule = getDaySchedule(weekday);
          const totalHours = calculateDayHours(daySchedule);

          return (
            <button
              key={weekday}
              onClick={() => openEditDay(weekday)}
              className={`relative border rounded-lg p-4 transition-all text-left w-full ${
                daySchedule.hours.length > 0
                  ? "bg-card hover:bg-muted/50 border-border"
                  : "bg-muted/30 border-dashed border-muted-foreground/30"
              }`}
            >
              {/* Day header */}
              <div className="mb-3">
                <h4 className="font-medium text-sm">{dayName}</h4>
              </div>

              {/* Day content */}
              <div className="space-y-3">
                {daySchedule.hours.length > 0 ? (
                  <>
                    {/* Hours display */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        {daySchedule.hours.map((hour) => (
                          <span key={hour.id} className="text-lg font-semibold">
                            {hour.start_time.slice(0, 5)} - {hour.end_time.slice(0, 5)}
                          </span>
                        ))}
                      </div>
                      <span className="text-sm font-semibold text-primary px-2 py-0.5 bg-primary/10 rounded">
                        {formatHours(totalHours)}
                      </span>
                    </div>

                    {/* Multiple periods indicator */}
                    {daySchedule.hours.length > 1 && (
                      <div className="pt-2 border-t">
                        <span className="text-xs font-medium text-muted-foreground">
                          {daySchedule.hours.length} periods
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6">
                    <span className="text-sm text-muted-foreground">Closed</span>
                  </div>
                )}
              </div>

              {/* Visual indicator bar */}
              {daySchedule.hours.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20 rounded-b-lg">
                  <div
                    className="h-full bg-primary rounded-b-lg transition-all"
                    style={{ width: `${Math.min((totalHours / 12) * 100, 100)}%` }}
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
              Configure practice operating hours for this day
            </SheetDescription>
          </SheetHeader>
          {editingDay && (
            <div className="space-y-4 pt-4">
              {/* Existing hours */}
              {editingDay.hours.length > 0 ? (
                <div className="space-y-2">
                  <Label>Current Opening Hours</Label>
                  <div className="space-y-2">
                    {editingDay.hours.map((hour, idx) => (
                      <div
                        key={hour.id}
                        className="flex items-end gap-2 p-3 border rounded-lg bg-muted/50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-medium">
                              {hour.start_time.slice(0, 5)} - {hour.end_time.slice(0, 5)}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteHours(hour.id)}
                          className="h-9 w-9 p-0 shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                  No opening hours set - practice closed on this day
                </p>
              )}

              {/* Add new hours */}
              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Add Opening Hours</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Start Time</Label>
                    <Input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End Time</Label>
                    <Input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
                <Button onClick={handleAddHours} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Hours
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

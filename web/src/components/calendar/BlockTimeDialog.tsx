import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useBlockedTime, CreateBlockedTimeParams } from "@/hooks/useBlockedTime";
import { toast } from "sonner";

interface BlockTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: any[];
  prefilledStaffId?: string;
  prefilledDate?: Date;
  prefilledTime?: string;
}

const COMMON_REASONS = [
  "Staff Meeting",
  "Training Session",
  "Lunch Break",
  "Admin Time",
  "Equipment Maintenance",
  "Team Planning",
  "Other",
];

// Generate time slots (30-minute intervals)
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      slots.push(timeStr);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

export function BlockTimeDialog({
  open,
  onOpenChange,
  staff,
  prefilledStaffId,
  prefilledDate,
  prefilledTime,
}: BlockTimeDialogProps) {
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");

  const { createBlockedTime, isCreating } = useBlockedTime();

  // Pre-fill form when props change
  useEffect(() => {
    if (open) {
      setSelectedStaff(prefilledStaffId || "");
      setSelectedDate(prefilledDate);
      setStartTime(prefilledTime || "");
      // Auto-set end time to 1 hour after start
      if (prefilledTime) {
        const [hours, minutes] = prefilledTime.split(":");
        const endHour = parseInt(hours) + 1;
        setEndTime(`${endHour.toString().padStart(2, "0")}:${minutes}`);
      }
    }
  }, [open, prefilledStaffId, prefilledDate, prefilledTime]);

  const handleSubmit = () => {
    if (!selectedStaff || !selectedDate || !startTime || !endTime || !reason) {
      return;
    }

    // Build ISO datetime strings
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);

    const startsAt = new Date(selectedDate);
    startsAt.setHours(startHours, startMinutes, 0, 0);

    const endsAt = new Date(selectedDate);
    endsAt.setHours(endHours, endMinutes, 0, 0);

    // Validation. The form has its own UI states for the rest; the
    // time-range check is the last gate before submit.
    if (endsAt <= startsAt) {
      toast.error("End time must be after start time");
      return;
    }

    const finalReason = reason === "Other" ? customReason : reason;

    const params: CreateBlockedTimeParams = {
      staff_id: selectedStaff,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: finalReason,
      notes: notes || undefined,
    };

    createBlockedTime(params, {
      onSuccess: () => {
        onOpenChange(false);
        // Reset form
        setSelectedStaff("");
        setSelectedDate(undefined);
        setStartTime("");
        setEndTime("");
        setReason("");
        setCustomReason("");
        setNotes("");
      },
    });
  };

  const isFormValid = () => {
    if (!selectedStaff || !selectedDate || !startTime || !endTime) return false;
    if (reason === "Other" && !customReason.trim()) return false;
    if (!reason) return false;

    // Check time range
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);
    const startMinutesTotal = startHours * 60 + startMinutes;
    const endMinutesTotal = endHours * 60 + endMinutes;

    return endMinutesTotal > startMinutesTotal;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Block Time</SheetTitle>
          <SheetDescription>
            Block time for meetings, training, or other non-patient activities
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* Staff Member */}
          <div className="space-y-2">
            <Label>Staff Member *</Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Start Time */}
          <div className="space-y-2">
            <Label>Start Time *</Label>
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select start time">
                  {startTime && (
                    <div className="flex items-center">
                      <Clock className="mr-2 h-4 w-4" />
                      {startTime}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {TIME_SLOTS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* End Time */}
          <div className="space-y-2">
            <Label>End Time *</Label>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select end time">
                  {endTime && (
                    <div className="flex items-center">
                      <Clock className="mr-2 h-4 w-4" />
                      {endTime}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {TIME_SLOTS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {startTime && endTime && (
              <>
                {(() => {
                  const [startHours, startMinutes] = startTime.split(":").map(Number);
                  const [endHours, endMinutes] = endTime.split(":").map(Number);
                  const startTotal = startHours * 60 + startMinutes;
                  const endTotal = endHours * 60 + endMinutes;
                  const duration = endTotal - startTotal;

                  if (duration <= 0) {
                    return (
                      <p className="text-xs text-destructive">
                        End time must be after start time
                      </p>
                    );
                  }

                  const hours = Math.floor(duration / 60);
                  const mins = duration % 60;
                  return (
                    <p className="text-xs text-muted-foreground">
                      Duration: {hours > 0 && `${hours}h `}{mins > 0 && `${mins}m`}
                    </p>
                  );
                })()}
              </>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Reason (if "Other" selected) */}
          {reason === "Other" && (
            <div className="space-y-2">
              <Label>Specify Reason *</Label>
              <Input
                placeholder="Enter reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              placeholder="Additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid() || isCreating}
              className="flex-1"
            >
              {isCreating ? "Blocking..." : "Block Time"}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

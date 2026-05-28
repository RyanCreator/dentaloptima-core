import { useState, useEffect } from "react";
import { format, addWeeks } from "date-fns";
import { CalendarIcon, Clock, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { logger } from "@/lib/logger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  findSlotsWithFilters,
  type SmartAvailabilityFilters,
} from "@/lib/availabilityEngine";
import { formatTime } from "@/lib/timeUtils";

interface SmartAvailabilityFinderProps {
  services: any[];
  staff: any[];
  onSlotSelected: (staffId: string, date: Date, time: string, serviceId: string) => void;
  // When the finder is opened from an enquiry, the patient already told
  // us what they want. Pre-fill the filters so the operator doesn't have
  // to re-enter everything; they just see suggested slots that match the
  // patient's preferences and can pick or widen the search.
  prefill?: {
    serviceId?: string | null;
    preferredAt?: string | null; // ISO timestamp
  };
}

// Maps a preferred-at hour to the `morning` / `afternoon` enum used by the
// availability engine. We keep the cutoff at 12:00 — anything before is
// morning, 12:00+ is afternoon (matches the public booking form's bands).
function timeOfDayFromHour(hour: number): "morning" | "afternoon" | undefined {
  if (hour >= 0 && hour < 12) return "morning";
  if (hour >= 12 && hour < 24) return "afternoon";
  return undefined;
}

export function SmartAvailabilityFinder({
  services,
  staff,
  onSlotSelected,
  prefill,
}: SmartAvailabilityFinderProps) {
  // Compute initial values from prefill once. We don't reset on prefill
  // changes because the operator may have intentionally widened filters.
  const initial = (() => {
    if (!prefill) return null;
    const preferredDate = prefill.preferredAt ? new Date(prefill.preferredAt) : null;
    return {
      serviceId: prefill.serviceId ?? "",
      startDate: preferredDate ?? undefined,
      timeOfDay: preferredDate ? timeOfDayFromHour(preferredDate.getHours()) : undefined,
    };
  })();

  const [selectedService, setSelectedService] = useState(initial?.serviceId ?? "");
  const [selectedStaff, setSelectedStaff] = useState<string>("anyone");
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | undefined>();
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<"morning" | "afternoon" | undefined>(
    initial?.timeOfDay,
  );
  const [startDate, setStartDate] = useState<Date | undefined>(initial?.startDate);
  const [weeksToCheck, setWeeksToCheck] = useState(4);

  // The patient's preferred-at, kept around for the callout at the top so
  // we can describe what the filters were prefilled FROM. Independent of
  // current filter state — the operator can change filters and this
  // remains as the original ask.
  const preferredAtIso = prefill?.preferredAt ?? null;
  const preferredService = prefill?.serviceId
    ? services.find((s) => s.id === prefill.serviceId)
    : null;
  const [loading, setLoading] = useState(false);
  const [suggestedSlots, setSuggestedSlots] = useState<
    Array<{
      slot: { date: Date; time: string; availableMinutes: number };
      staffId: string;
      staffName: string;
    }>
  >([]);

  // Days of week for filter
  const daysOfWeek = [
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
    { value: 7, label: "Sun" },
  ];

  // Search for slots when filters change
  useEffect(() => {
    if (selectedService) {
      searchSlots();
    } else {
      setSuggestedSlots([]);
    }
  }, [
    selectedService,
    selectedStaff,
    selectedDayOfWeek,
    selectedTimeOfDay,
    startDate,
    weeksToCheck,
  ]);

  const searchSlots = async () => {
    if (!selectedService) return;

    setLoading(true);

    const filters: SmartAvailabilityFilters = {
      serviceIds: [selectedService],
      staffIds: selectedStaff === "anyone" ? undefined : [selectedStaff],
      dayOfWeek: selectedDayOfWeek,
      timeOfDay: selectedTimeOfDay,
      startDate: startDate,
      weeksToCheck: weeksToCheck,
    };

    try {
      const results = await findSlotsWithFilters(filters, 3);
      setSuggestedSlots(results);
    } catch (error) {
      logger.error("Error finding slots", error);
      setSuggestedSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSlotClick = (slot: typeof suggestedSlots[0]) => {
    onSlotSelected(slot.staffId, slot.slot.date, slot.slot.time, selectedService);
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Find Available Slots</h3>
          {(preferredAtIso || preferredService) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Filters pre-filled from the enquiry — adjust to widen the search.
            </p>
          )}
        </div>
      </div>

      {/* Patient's stated preference — reminds the operator what was
          asked for, even if they've since widened the filters. */}
      {(preferredAtIso || preferredService) && (
        <div className="rounded-md border border-blue-300/60 bg-blue-50/60 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-100 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-700 dark:text-blue-300" />
          <div className="min-w-0 leading-relaxed">
            <span className="font-medium">Patient asked for:</span>{" "}
            {preferredService && (
              <span>{preferredService.name}</span>
            )}
            {preferredService && preferredAtIso && <span>, </span>}
            {preferredAtIso && (
              <span>
                {format(new Date(preferredAtIso), "EEE d MMM 'at' HH:mm")}
              </span>
            )}
            . Suggested slots below start from this preference; click one
            to book it directly.
          </div>
        </div>
      )}

      {/* Service Selection - Required */}
      <div className="space-y-2">
        <Label>Service *</Label>
        <Select value={selectedService} onValueChange={setSelectedService}>
          <SelectTrigger>
            <SelectValue placeholder="Select service" />
          </SelectTrigger>
          <SelectContent>
            {services.map((service) => (
              <SelectItem key={service.id} value={service.id}>
                {service.name} ({service.duration_minutes} mins)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filters Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Staff Filter */}
        <div className="space-y-2">
          <Label>Staff Member</Label>
          <Select value={selectedStaff} onValueChange={setSelectedStaff}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anyone">Anyone Available</SelectItem>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time of Day Filter */}
        <div className="space-y-2">
          <Label>Time of Day</Label>
          <Select
            value={selectedTimeOfDay || "any"}
            onValueChange={(val) =>
              setSelectedTimeOfDay(val === "any" ? undefined : (val as "morning" | "afternoon"))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any Time</SelectItem>
              <SelectItem value="morning">Morning (before 12pm)</SelectItem>
              <SelectItem value="afternoon">Afternoon (after 12pm)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Day of Week Filter */}
      <div className="space-y-2">
        <Label>Specific Day (optional)</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={selectedDayOfWeek === undefined ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedDayOfWeek(undefined)}
          >
            Any Day
          </Button>
          {daysOfWeek.map((day) => (
            <Button
              key={day.value}
              type="button"
              variant={selectedDayOfWeek === day.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDayOfWeek(day.value)}
            >
              {day.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Date Range Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Start Date */}
        <div className="space-y-2">
          <Label>Start From (optional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "PPP") : <span>Today</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                initialFocus
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Weeks to Check */}
        <div className="space-y-2">
          <Label>Search Window</Label>
          <Select
            value={weeksToCheck.toString()}
            onValueChange={(val) => setWeeksToCheck(parseInt(val))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">Next 2 weeks</SelectItem>
              <SelectItem value="4">Next 4 weeks</SelectItem>
              <SelectItem value="8">Next 8 weeks</SelectItem>
              <SelectItem value="12">Next 12 weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Suggested Slots */}
      {selectedService && (
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Suggested Appointments</h4>
            {loading && <span className="text-xs text-muted-foreground">Searching...</span>}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-muted/50 rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : suggestedSlots.length > 0 ? (
            <div className="space-y-2">
              {suggestedSlots.map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleSlotClick(item)}
                  // Hover state was `bg-accent` which is a saturated
                  // brand-blue (HSL 217 91% 60%) — the muted-grey text
                  // on top of it failed WCAG contrast in both light and
                  // dark mode. Use a subtle tint instead (bg-accent at
                  // 10% opacity) so the click-affordance is clear but
                  // text stays comfortably readable, and add a primary
                  // ring on hover for stronger "this is clickable" feel.
                  className="w-full flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-accent/10 hover:border-primary/40 hover:ring-1 hover:ring-primary/20 transition-colors text-left"
                >
                  <div className="flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground">
                      {format(item.slot.date, "EEEE, MMMM d, yyyy")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatTime(item.slot.time)} • {item.slot.availableMinutes} mins available
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span className="hidden sm:inline">{item.staffName}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No available slots found with current filters. Try adjusting your search criteria.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

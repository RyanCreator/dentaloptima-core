import { useState, useEffect } from "react";
import { findNextAvailableSlots } from "@/lib/availabilityEngine";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

interface UseAvailableSlotsProps {
  staffId: string;
  selectedDate: Date | undefined;
  serviceId: string;
  services: any[];
}

// Diagnostic reason when availableSlots comes back empty. Lets the caller
// render a message that actually says what's wrong + what to do about it.
// "ok" means there are slots; "loading"/"none" mean we haven't computed yet.
export type AvailabilityReason =
  | "ok"
  | "loading"
  | "no-staff-schedule"
  | "practice-closed-weekday"
  | "practice-closure"
  | "staff-on-holiday"
  | "fully-booked"
  | "missing-inputs";

// Staff-side slot calculator. Used by NewAppointment, WaitingListPage, and the
// enquiry BookingDialog — all internal workflows where the practice is booking
// on behalf of the patient. Public booking policy (min-notice / max-advance)
// is intentionally NOT applied here: it governs patient self-service only.
export function useAvailableSlots({
  staffId,
  selectedDate,
  serviceId,
  services,
}: UseAvailableSlotsProps) {
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [staffOnHoliday, setStaffOnHoliday] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<AvailabilityReason>("missing-inputs");

  useEffect(() => {
    if (staffId && selectedDate && serviceId) {
      calculateAvailableSlots();
    } else {
      setAvailableSlots([]);
      setStaffOnHoliday(false);
      setReason("missing-inputs");
    }
  }, [staffId, selectedDate, serviceId]);

  const calculateAvailableSlots = async () => {
    if (!staffId || !selectedDate || !serviceId) return;

    setLoading(true);
    setReason("loading");
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      setLoading(false);
      setReason("missing-inputs");
      return;
    }

    try {
      // Use centralized availability data fetcher
      const { fetchStaffAvailabilityData, hasTimeOff } = await import("@/lib/availabilityDataFetcher");

      const staffData = await fetchStaffAvailabilityData({
        staffId,
        date: selectedDate,
        includeAppointments: true,
        includePracticeHours: true,
        includePracticeClosures: true,
      });

      if (!staffData) {
        logger.error("Failed to fetch staff availability data");
        setAvailableSlots([]);
        setReason("missing-inputs");
        setLoading(false);
        return;
      }

      // Check for time off
      if (hasTimeOff(staffData)) {
        setAvailableSlots([]);
        setStaffOnHoliday(true);
        setReason("staff-on-holiday");
        setLoading(false);
        return;
      }

      setStaffOnHoliday(false);

      // Use the availability engine - check only the selected day (1 day).
      // No bookingPolicy passed: staff-side booking bypasses public-booking rules.
      const availableSlotObjects = findNextAvailableSlots(
        staffData,
        [service],
        1,
        100,
        selectedDate
      );

      // Filter to only slots on the selected date and extract times
      const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
      const slots = availableSlotObjects
        .filter((slot) => format(slot.date, "yyyy-MM-dd") === selectedDateStr)
        .map((slot) => slot.time);

      setAvailableSlots(slots);

      // Diagnostic — if no slots, work out *why* so the form can render
      // an actionable message. Cheap (no extra round-trips, just consult
      // the data we already have).
      if (slots.length === 0) {
        const isoWeekday = ((selectedDate.getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
        const dateStr = format(selectedDate, "yyyy-MM-dd");

        const closure = staffData.practiceClosures?.find(
          (c) => c.starts_at.slice(0, 10) <= dateStr && c.ends_at.slice(0, 10) >= dateStr,
        );
        if (closure) {
          setReason("practice-closure");
        } else if (!staffData.practiceHours?.some((ph) => ph.weekday === isoWeekday)) {
          setReason("practice-closed-weekday");
        } else if (!staffData.schedules?.some((s) => s.weekday === isoWeekday)) {
          setReason("no-staff-schedule");
        } else {
          setReason("fully-booked");
        }
      } else {
        setReason("ok");
      }
    } catch (error) {
      logger.error("Error calculating available slots", error);
      setAvailableSlots([]);
      setReason("missing-inputs");
    } finally {
      setLoading(false);
    }
  };

  return {
    availableSlots,
    staffOnHoliday,
    loading,
    reason,
  };
}

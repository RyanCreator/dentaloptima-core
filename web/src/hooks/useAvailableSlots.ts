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

  useEffect(() => {
    if (staffId && selectedDate && serviceId) {
      calculateAvailableSlots();
    } else {
      setAvailableSlots([]);
      setStaffOnHoliday(false);
    }
  }, [staffId, selectedDate, serviceId]);

  const calculateAvailableSlots = async () => {
    if (!staffId || !selectedDate || !serviceId) return;

    setLoading(true);
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      setLoading(false);
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
        setLoading(false);
        return;
      }

      // Check for time off
      if (hasTimeOff(staffData)) {
        setAvailableSlots([]);
        setStaffOnHoliday(true);
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
    } catch (error) {
      logger.error("Error calculating available slots", error);
      setAvailableSlots([]);
    } finally {
      setLoading(false);
    }
  };

  return {
    availableSlots,
    staffOnHoliday,
    loading,
  };
}

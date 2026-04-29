import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { UK_TIMEZONE } from "@/lib/constants";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  treatment_summary: string | null;
  actual_price: number | null;
  cancellation_reason: string | null;
  arrived_at: string | null;
  patient: {
    id: string;
    full_name: string;
    phone: string;
    is_pregnant: boolean | null;
    takes_anticoagulant: boolean | null;
    no_show_count: number;
  };
  staff: {
    id: string;
    full_name: string;
    colour_tag: string | null;
  };
  service: {
    id: string;
    name: string;
    duration_minutes: number;
    buffer_before_minutes?: number;
    buffer_after_minutes?: number;
    price?: number | null;
    treatment_type?: string | null;
    is_nhs?: boolean;
  };
}

export function useAppointments(
  currentDate: Date,
  viewMode: "week" | "month" | "day"
) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAppointments = async () => {
    setLoading(true);
    setError(null);
    // Compute the UK-local wall-clock day/week/month boundaries, then convert
    // those back to UTC instants. Without the fromZonedTime round-trip, a
    // non-UK browser would build the boundaries in its own timezone and miss
    // appointments near midnight UK time.
    const ukDate = toZonedTime(currentDate, UK_TIMEZONE);

    let startWallClock: Date;
    let endWallClock: Date;

    if (viewMode === "day") {
      startWallClock = startOfDay(ukDate);
      endWallClock = endOfDay(ukDate);
    } else if (viewMode === "week") {
      startWallClock = startOfWeek(ukDate, { weekStartsOn: 1 });
      endWallClock = endOfWeek(ukDate, { weekStartsOn: 1 });
    } else {
      startWallClock = startOfMonth(ukDate);
      endWallClock = endOfMonth(ukDate);
    }

    const startDate = fromZonedTime(startWallClock, UK_TIMEZONE);
    const endDate = fromZonedTime(endWallClock, UK_TIMEZONE);

    const { data, error } = await supabase
      .from("appointment")
      .select(`
        id,
        starts_at,
        ends_at,
        status,
        notes,
        treatment_summary,
        actual_price,
        cancellation_reason,
        arrived_at,
        patient:patient_id (id, full_name, phone, is_pregnant, takes_anticoagulant, no_show_count),
        staff:staff_id (id, full_name, colour_tag),
        service:service_id (id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, price, treatment_type, is_nhs)
      `)
      .gte("starts_at", startDate.toISOString())
      .lte("starts_at", endDate.toISOString())
      .order("starts_at");

    if (error) {
      logger.error("Error loading appointments", error);
      setError("Failed to load appointments");
      toast.error("Failed to load appointments");
      setLoading(false);
      return;
    }

    if (data) {
      setAppointments(data as Appointment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAppointments();
  }, [currentDate, viewMode]);

  return {
    appointments,
    loading,
    error,
    loadAppointments,
  };
}

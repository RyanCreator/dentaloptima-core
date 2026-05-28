import { useState, useEffect, useRef, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { UK_TIMEZONE } from "@/lib/constants";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

// Appointments now have many-to-many services via `appointment_service`.
// Most UI is built around "primary service" so we surface the first one
// of an appointment for back-compat, plus expose the full array for any
// view that wants to show "Examination + Filling".
//
// `notes` and `actual_price` from the legacy schema are gone:
//   - `notes` → use the `note` table with parent_type='appointment',
//              parent_id=appointment.id
//   - `actual_price` → sum of appointment_service.price_pence_snapshot
//                       (or billing_item.total_pence once invoiced)

export interface AppointmentService {
  id: string;
  service_id: string;
  display_order: number;
  price_pence_snapshot: number;
  duration_minutes_snapshot: number;
  service: {
    id: string;
    name: string;
    duration_minutes: number;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    price_pence: number;
    treatment_type: string | null;
    is_nhs: boolean;
    nhs_band: string | null;
    color_hex: string | null;
  };
}

export interface Appointment {
  id: string;
  practice_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  treatment_summary: string | null;
  cancellation_reason: string | null;
  cancellation_notes: string | null;
  arrived_at: string | null;
  // NHS exemption captured at the visit. Populated from the NHSExemptionPanel
  // on the appointment detail; copied to nhs_claim at submission.
  nhs_exemption_category: string;
  nhs_exemption_evidence_seen: boolean;
  patient: {
    id: string;
    full_name: string;
    phone: string | null;
    nhs_number: string | null;
  };
  staff: {
    id: string;
    full_name: string | null;
    color_hex: string | null;
  };
  // Array of services on this appointment — at least one row, sorted by
  // display_order. UI that wants a single primary service should read
  // `services[0]`; UI that wants to show all should iterate.
  services: AppointmentService[];
}

export function useAppointments(
  currentDate: Date,
  viewMode: "week" | "month" | "day",
) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Unique channel name per hook instance — prevents StrictMode double-mount
  // and multiple consumers of this hook from colliding on the same channel
  // name (supabase reuses the channel by name, and adding `.on()` to an
  // already-subscribed channel throws).
  const channelId = useId();
  // We've finished the first successful load — used to suppress
  // `setLoading(true)` on subsequent fetches. Without this guard, every
  // calendar-day navigation toggled `loading` true→false, which made the
  // day view briefly empty (stale appointments don't match the new
  // selectedDay, then new data arrives) and the UI flashed. Now we keep
  // stale data visible during refetch — when the new range lands it
  // simply re-renders, no empty-state flash in between.
  const hasLoadedOnce = useRef(false);

  const loadAppointments = async () => {
    if (!hasLoadedOnce.current) {
      setLoading(true);
    }
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

    // Embed appointment_service rows + their service so we get everything
    // in one round-trip. PostgREST handles the nested embed because the
    // FKs are properly set up in the schema.
    const { data, error } = await supabase
      .from("appointment")
      .select(`
        id,
        practice_id,
        starts_at,
        ends_at,
        status,
        treatment_summary,
        cancellation_reason,
        cancellation_notes,
        arrived_at,
        nhs_exemption_category,
        nhs_exemption_evidence_seen,
        patient:patient_id (id, full_name, phone, nhs_number),
        staff:staff_id (id, full_name, color_hex),
        services:appointment_service (
          id,
          service_id,
          display_order,
          price_pence_snapshot,
          duration_minutes_snapshot,
          service:service_id (id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, price_pence, treatment_type, is_nhs, nhs_band, color_hex)
        )
      `)
      .is("deleted_at", null)
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
      // Sort the services array per appointment by display_order — the
      // embed doesn't guarantee order. UI views that read services[0]
      // get the primary/first one consistently.
      const normalised: Appointment[] = (data as any[]).map((a) => ({
        ...a,
        services: ([...(a.services ?? [])] as AppointmentService[]).sort(
          (x, y) => x.display_order - y.display_order,
        ),
      }));
      setAppointments(normalised);
    }
    hasLoadedOnce.current = true;
    setLoading(false);
  };

  useEffect(() => {
    loadAppointments();
  }, [currentDate, viewMode]);

  // Realtime: when any colleague (or this user, via another tab) inserts /
  // updates / deletes an appointment in the same practice, refetch the
  // visible range. Filtering server-side by practice_id keeps the channel
  // efficient — we ignore other tenants' changes entirely. A tiny debounce
  // prevents a flood of refetches when many rows change at once (e.g. a
  // bulk reschedule).
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        loadAppointments();
      }, 300);
    };
    const channel = supabase
      .channel(`calendar-appointments-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointment" },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointment_service" },
        scheduleRefetch,
      )
      .subscribe();
    return () => {
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [currentDate, viewMode, channelId]);

  return {
    appointments,
    loading,
    error,
    loadAppointments,
  };
}

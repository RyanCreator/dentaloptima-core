import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/useNotifications";
import type { Appointment } from "@/hooks/useAppointments";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

// Used by drag-to-move on the calendar timeline. Centralises the recipe so
// the calendar component stays focused on UI and the same logic can be
// reused if we add drag-to-move to other views (multi-staff column, week
// grid). Returns success boolean so callers can roll back optimistic state.
export function useRescheduleAppointment() {
  const [saving, setSaving] = useState(false);
  const { sendAppointmentRescheduledNotification } = useNotifications();

  const reschedule = async (
    apt: Appointment,
    newStartsAt: Date
  ): Promise<boolean> => {
    if (saving) return false;

    // Same-time drag = no-op. Saves a network round-trip when the user picks
    // up an appointment and drops it back where it started.
    const oldStarts = new Date(apt.starts_at);
    if (oldStarts.getTime() === newStartsAt.getTime()) return true;

    if (newStartsAt < new Date()) {
      toast.error("Can't drop an appointment in the past");
      return false;
    }

    // Preserve the original duration exactly — dragging changes when, not
    // how long. Service buffers stay implicit in the existing duration.
    const originalDurationMs =
      new Date(apt.ends_at).getTime() - new Date(apt.starts_at).getTime();
    const newEndsAt = new Date(newStartsAt.getTime() + originalDurationMs);

    setSaving(true);
    try {
      const { error } = await supabase
        .from("appointment")
        .update({
          starts_at: newStartsAt.toISOString(),
          ends_at: newEndsAt.toISOString(),
        })
        .eq("id", apt.id);

      if (error) {
        // Most likely cause: the trg_check_appointment_overlap trigger fired.
        // Surface a friendlier message rather than the raw "P0001" text.
        const isOverlap = /overlap/i.test(error.message);
        toast.error(
          isOverlap
            ? "That slot conflicts with another appointment"
            : "Couldn't move appointment — please try again"
        );
        logger.error("Reschedule failed", error);
        return false;
      }

      // Fire-and-forget notification. Don't block the UI on email; the move
      // is the important bit. Only send for SCHEDULED appointments — we
      // don't want emails going out for cancelled ones being repositioned.
      if (apt.status === "SCHEDULED") {
        const oldDate = format(oldStarts, "EEEE, d MMMM yyyy");
        const oldTime = format(oldStarts, "HH:mm");
        const newDate = format(newStartsAt, "EEEE, d MMMM yyyy");
        const newTime = format(newStartsAt, "HH:mm");
        sendAppointmentRescheduledNotification(
          apt.patient.id,
          apt.id,
          oldDate,
          oldTime,
          newDate,
          newTime
        ).catch((err) => logger.error("Reschedule notification failed", err));
      }

      toast.success(`Moved to ${format(newStartsAt, "HH:mm")}`);
      return true;
    } catch (err) {
      logger.error("Reschedule unexpected error", err);
      toast.error("Couldn't move appointment");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { reschedule, saving };
}

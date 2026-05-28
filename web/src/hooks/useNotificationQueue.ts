import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/useNotifications";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { UK_TIMEZONE } from "@/lib/constants";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

// Powers the "notifications to send" tray in the calendar header.
//
// Replaces the previous behaviour where every reschedule / cancellation
// fired the patient email immediately — receptionists shuffling the day
// would generate a flood of "your appointment moved" messages, several
// of which were superseded before the patient even opened the first.
//
// The new flow: writes set appointment.notification_pending (and, for
// the first move per queue entry, notification_prev_starts_at). The
// tray lists each pending appointment; the operator chooses to Send or
// Dismiss when the schedule is settled.

export interface PendingNotification {
  appointment_id: string;
  practice_id: string;
  patient_id: string;
  patient_name: string;
  current_starts_at: string;
  prev_starts_at: string | null;
  kind: string;
  staff_name: string | null;
}

export function useNotificationQueue() {
  const [items, setItems] = useState<PendingNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const {
    sendAppointmentRescheduledNotification,
    sendAppointmentCancelledNotification,
  } = useNotifications();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("appointment")
      .select(
        `id, practice_id, patient_id, starts_at, notification_pending, notification_prev_starts_at,
         patient:patient_id (full_name),
         staff:staff_id (full_name)`,
      )
      .not("notification_pending", "is", null)
      .is("deleted_at", null)
      .order("starts_at", { ascending: true });

    if (error) {
      logger.error("Failed to load notification queue", error);
      setItems([]);
      setLoading(false);
      return;
    }

    const mapped: PendingNotification[] = (data ?? []).map((r: any) => ({
      appointment_id: r.id,
      practice_id: r.practice_id,
      patient_id: r.patient_id,
      patient_name: r.patient?.full_name ?? "Unknown patient",
      current_starts_at: r.starts_at,
      prev_starts_at: r.notification_prev_starts_at,
      kind: r.notification_pending,
      staff_name: r.staff?.full_name ?? null,
    }));
    setItems(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: keep the tray in sync as colleagues reschedule / dismiss.
  // Unique channel name so StrictMode double-mount + multiple consumers of
  // this hook don't collide on the same `notification-queue` name (which
  // throws "cannot add postgres_changes callbacks after subscribe").
  const channelId = useId();
  useEffect(() => {
    const channel = supabase
      .channel(`notification-queue-${channelId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointment" },
        () => load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, channelId]);

  const clearPending = async (id: string) => {
    const { error } = await supabase
      .from("appointment")
      .update({
        notification_pending: null,
        notification_prev_starts_at: null,
      })
      .eq("id", id);
    if (error) {
      toast.error("Couldn't clear pending notification");
      logger.error("Clear pending failed", error);
      return false;
    }
    return true;
  };

  const send = async (item: PendingNotification): Promise<boolean> => {
    setSendingId(item.appointment_id);
    try {
      if (item.kind === "RESCHEDULED") {
        // Fall back to the current time as the "old" anchor if we somehow
        // lost prev (shouldn't happen, but better than emailing an
        // unanchored "your appointment moved").
        const prev = item.prev_starts_at
          ? toZonedTime(new Date(item.prev_starts_at), UK_TIMEZONE)
          : toZonedTime(new Date(item.current_starts_at), UK_TIMEZONE);
        const curr = toZonedTime(new Date(item.current_starts_at), UK_TIMEZONE);
        await sendAppointmentRescheduledNotification(
          item.patient_id,
          item.appointment_id,
          format(prev, "EEEE, d MMMM yyyy"),
          format(prev, "HH:mm"),
          format(curr, "EEEE, d MMMM yyyy"),
          format(curr, "HH:mm"),
        );
      } else if (item.kind === "CANCELLED") {
        await sendAppointmentCancelledNotification(item.patient_id, item.appointment_id);
      } else {
        toast.error(`Unknown notification kind: ${item.kind}`);
        return false;
      }
      const cleared = await clearPending(item.appointment_id);
      if (cleared) {
        toast.success(`Notification sent to ${item.patient_name}`);
        await load();
      }
      return cleared;
    } catch (err) {
      logger.error("Send notification failed", err);
      toast.error("Couldn't send notification");
      return false;
    } finally {
      setSendingId(null);
    }
  };

  const dismiss = async (item: PendingNotification): Promise<boolean> => {
    const ok = await clearPending(item.appointment_id);
    if (ok) {
      toast.success("Notification dismissed");
      await load();
    }
    return ok;
  };

  return {
    items,
    loading,
    sendingId,
    reload: load,
    send,
    dismiss,
  };
}

// Helper used by the calendar's save paths. Writes the pending flag
// after a reschedule/cancellation so the queue picks it up.
export async function markNotificationPending(
  appointmentId: string,
  kind: "RESCHEDULED" | "CANCELLED",
  previousStartsAt: Date | null,
): Promise<void> {
  // Only set prev_starts_at on the FIRST move per queue entry — if
  // already pending and prev is set, leave it alone so the email still
  // says "moved from your original time to ..." rather than from an
  // intermediate position the patient never saw.
  const { data: existing } = await supabase
    .from("appointment")
    .select("notification_pending, notification_prev_starts_at")
    .eq("id", appointmentId)
    .maybeSingle();

  const patch: Record<string, unknown> = { notification_pending: kind };
  if (kind === "RESCHEDULED") {
    const alreadyHasPrev =
      existing?.notification_pending === "RESCHEDULED" &&
      !!existing?.notification_prev_starts_at;
    if (!alreadyHasPrev && previousStartsAt) {
      patch.notification_prev_starts_at = previousStartsAt.toISOString();
    }
  } else if (kind === "CANCELLED") {
    patch.notification_prev_starts_at = null;
  }

  const { error } = await supabase
    .from("appointment")
    .update(patch)
    .eq("id", appointmentId);
  if (error) {
    logger.error("Couldn't mark notification pending", error);
  }
}

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { format, parseISO, isSameDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/LoadingState";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useRequireAuth } from "@/hooks/useAuth";
import { useStaff } from "@/hooks/useStaff";
import { useServices } from "@/hooks/useServices";
import { markNotificationPending } from "@/hooks/useNotificationQueue";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import NewAppointmentForm from "./NewAppointment";
import { useAppointments } from "@/hooks/useAppointments";
import { useCalendarNavigation } from "@/hooks/useCalendarNavigation";
import { useStaffRules } from "@/hooks/useStaffRules";
import { checkAppointmentOverlap, hasAppointmentWarning } from "@/lib/appointmentUtils";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarGridView } from "@/components/calendar/CalendarGridView";
import { AppointmentDetailSheet } from "@/components/calendar/AppointmentDetailSheet";
import { BlockTimeDialog } from "@/components/calendar/BlockTimeDialog";
import { NotificationTray } from "@/components/calendar/NotificationTray";
import { useBlockedTime } from "@/hooks/useBlockedTime";
import { useUkBankHolidays } from "@/hooks/useUkBankHolidays";
import { usePracticeSetting } from "@/hooks/usePracticeSetting";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { RecentPatientsStrip } from "@/components/RecentPatientsStrip";
import type { Appointment } from "@/hooks/useAppointments";
import { UK_TIMEZONE, AppointmentStatus } from "@/lib/constants";

export default function Calendar() {
  const { loading } = useRequireAuth();
  const location = useLocation();
  const { staff } = useStaff();
  const { services } = useServices();
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  // Default OFF — cancelled chips clutter the day view on busy days; the
  // operator can toggle "Show Cancelled" when they specifically want to
  // see where the gaps came from. Week/month views ignore this flag
  // entirely and always exclude cancelled.
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState<Date>();
  const [editTime, setEditTime] = useState("");
  const [editStaffId, setEditStaffId] = useState("");
  const [editServiceId, setEditServiceId] = useState("");
  const [editStatus, setEditStatus] = useState<AppointmentStatus>("SCHEDULED");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [prefillStaffId, setPrefillStaffId] = useState<string | undefined>(undefined);
  const [prefillDate, setPrefillDate] = useState<Date | undefined>(undefined);
  const [prefillTime, setPrefillTime] = useState<string | undefined>(undefined);
  const [prefillServiceId, setPrefillServiceId] = useState<string | undefined>(undefined);
  const [isBlockTimeOpen, setIsBlockTimeOpen] = useState(false);
  const [blockTimePrefillStaffId, setBlockTimePrefillStaffId] = useState<string | undefined>(undefined);
  const [blockTimePrefillDate, setBlockTimePrefillDate] = useState<Date | undefined>(undefined);
  const [blockTimePrefillTime, setBlockTimePrefillTime] = useState<string | undefined>(undefined);

  // Close the New Appointment sheet AND wipe any prefill state that was
  // set by the last slot click. Without this, opening the form again via
  // the toolbar button or `b` shortcut inherits a stale prefilledTime,
  // which then triggers the "this time isn't in the schedule" warning
  // even though the user hasn't picked a time yet.
  const closeNewAppointment = () => {
    setIsNewAppointmentOpen(false);
    setPrefillStaffId(undefined);
    setPrefillDate(undefined);
    setPrefillTime(undefined);
    setPrefillServiceId(undefined);
  };

  const { breaksMap, availabilityMap } = useStaffRules();
  // Practice setting drives whether we show bank holidays at all and
  // which gov.uk feed to fetch. usePracticeSetting falls back to safe
  // defaults (show=true, england-and-wales) so a pre-migration practice
  // still renders.
  const { setting: practiceSetting } = usePracticeSetting();
  const { holidays: bankHolidays } = useUkBankHolidays(
    practiceSetting.bank_holidays_region,
    practiceSetting.show_bank_holidays,
  );
  const { currentDate, setCurrentDate, viewMode, setViewMode, selectedDay, setSelectedDay, navigatePrevious, navigateNext, navigatePreviousDay, navigateNextDay, goToToday, openDayView, backToCalendar } = useCalendarNavigation();

  // Keyboard shortcuts — only active while no sheets are open, so typing
  // in the New Appointment / Detail sheets isn't hijacked. `useMemo` is
  // implicit via the function identity: handlers close over the latest
  // state because the hook depends on `shortcuts` reference.
  const inViewerSheet = isSheetOpen || isNewAppointmentOpen || isBlockTimeOpen;
  const cycleStaff = (direction: 1 | -1) => {
    if (staff.length < 2) return;
    if (selectedStaffId === "all") {
      // Start from the beginning of the staff list when entering focus
      // mode via keyboard. Picking either end based on direction would
      // be cute but probably surprising.
      if (staff[0]) setSelectedStaffId(staff[0].id);
      return;
    }
    const idx = staff.findIndex((m) => m.id === selectedStaffId);
    const nextIdx = (idx + direction + staff.length) % staff.length;
    const next = staff[nextIdx];
    if (next) setSelectedStaffId(next.id);
  };
  useKeyboardShortcuts(
    {
      ArrowLeft: () => {
        if (selectedDay || viewMode === "day") navigatePreviousDay();
        else navigatePrevious();
      },
      ArrowRight: () => {
        if (selectedDay || viewMode === "day") navigateNextDay();
        else navigateNext();
      },
      t: goToToday,
      T: goToToday,
      b: () => setIsNewAppointmentOpen(true),
      B: () => setIsNewAppointmentOpen(true),
      "[": () => cycleStaff(-1),
      "]": () => cycleStaff(1),
    },
    { enabled: !inViewerSheet },
  );
  const { appointments, loading: appointmentsLoading, error: appointmentsError, loadAppointments } = useAppointments(currentDate, viewMode);
  const { blockedTimeEntries } = useBlockedTime();

  // ID of an appointment we should auto-open the detail sheet for once
  // the appointments array contains it. Set by deep-link navigation
  // (e.g. Dashboard's "Up next today" list); cleared once consumed so
  // a refresh of the appointments list doesn't re-open the sheet.
  const [pendingOpenAppointmentId, setPendingOpenAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.appointmentDate) {
      const date = parseISO(location.state.appointmentDate);
      const zonedDate = toZonedTime(date, UK_TIMEZONE);
      setSelectedDay(zonedDate);
      setViewMode("day");
      window.history.replaceState({}, document.title);

      if (location.state.appointmentId) {
        // Don't try to look it up here — the appointments fetch for the
        // new date may not have completed yet. Stash the ID and let the
        // follow-up effect open the sheet once the data arrives.
        setPendingOpenAppointmentId(location.state.appointmentId);
      }
    }
    
    if (location.state?.openNewAppointment) {
      setPrefillStaffId(location.state.prefilledStaffId);
      if (location.state.prefilledDate) {
        try {
          const d = new Date(location.state.prefilledDate);
          setPrefillDate(d);
          const zonedDate = toZonedTime(d, UK_TIMEZONE);
          setSelectedDay(zonedDate);
          setViewMode("day");
        } catch { }
      }
      setPrefillTime(location.state.prefilledTime);
      setPrefillServiceId(location.state.prefilledServiceId);
      setIsNewAppointmentOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // When a deep-link asked us to open a specific appointment, wait for
  // the appointments fetch to land that row, then open the detail sheet
  // once and clear the pending state. Re-runs every time `appointments`
  // changes so it survives a slow query without needing a blind setTimeout.
  useEffect(() => {
    if (!pendingOpenAppointmentId) return;
    const apt = appointments.find((a) => a.id === pendingOpenAppointmentId);
    if (apt) {
      openAppointmentDetail(apt);
      setPendingOpenAppointmentId(null);
    }
  }, [pendingOpenAppointmentId, appointments]);

  const getFilteredAppointments = () => {
    // Cancelled-visibility rule:
    //   - Week / month views always hide cancelled — they're clutter at
    //     the overview level and confuse the "what's actually booked"
    //     read of the calendar.
    //   - Day view (selectedDay set) respects the toggle, default ON so
    //     the operator sees cancellations as context when drilling in.
    const isDayView = !!selectedDay;
    const shouldShowCancelled = isDayView && showCancelled;
    let filtered = shouldShowCancelled
      ? appointments
      : appointments.filter((apt) => apt.status !== "CANCELLED");
    return selectedDay
      ? filtered.filter((apt) => {
          const aptDate = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
          return isSameDay(aptDate, selectedDay);
        })
      : filtered;
  };

  const openAppointmentDetail = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsSheetOpen(true);
    setIsEditing(false);
    // Time field in the form represents the PATIENT ARRIVAL time
    // (= stored starts_at + buffer_before). Without this offset, every
    // edit would slide the appointment earlier by buffer_before on save
    // because saveAppointmentChanges subtracts buffer from editTime.
    const storedStart = toZonedTime(new Date(appointment.starts_at), UK_TIMEZONE);
    const bufferBefore = appointment.services?.[0]?.service?.buffer_before_minutes ?? 0;
    const patientArrival = new Date(storedStart.getTime() + bufferBefore * 60_000);
    setEditDate(patientArrival);
    setEditTime(format(patientArrival, "HH:mm"));
    setEditStaffId(appointment.staff.id);
    // The new schema has many-to-many appointment_service. The single-pick
    // edit form pre-populates with the primary service (lowest display_order).
    // Saving will replace ALL appointment_service rows for now — multi-service
    // editing is a follow-up feature.
    setEditServiceId(appointment.services?.[0]?.service?.id ?? "");
    setEditStatus(appointment.status as AppointmentStatus);
    setEditNotes(appointment.treatment_summary ?? "");
  };

  const saveAppointmentChanges = async () => {
    if (!selectedAppointment || !editDate || !editServiceId) return;
    setIsSaving(true);

    try {
      const selectedService = services.find(s => s.id === editServiceId);
      if (!selectedService) {
        toast.error("Invalid service selected");
        setIsSaving(false);
        return;
      }

      const [hours, minutes] = editTime.split(":");
      const appointmentTime = new Date(editDate);
      appointmentTime.setHours(parseInt(hours), parseInt(minutes), 0);

      // editTime is the patient's arrival time. The stored starts_at
      // backs up by buffer_before so sterilisation/setup is reserved.
      const newStartsAt = new Date(appointmentTime);
      newStartsAt.setMinutes(newStartsAt.getMinutes() - (selectedService.buffer_before_minutes || 0));

      // Check if date/time has changed. Compare against the patient-arrival
      // equivalent of the original (stored starts_at + buffer_before of the
      // original service), so re-saving without changes doesn't falsely
      // report "changed".
      const originalService = selectedAppointment.services?.[0]?.service;
      const originalBufferBefore = originalService?.buffer_before_minutes ?? 0;
      const originalArrival = new Date(selectedAppointment.starts_at);
      originalArrival.setMinutes(originalArrival.getMinutes() + originalBufferBefore);
      const originalPrimaryServiceId = originalService?.id ?? "";
      const hasDateTimeChanged =
        appointmentTime.getTime() !== originalArrival.getTime() ||
        editStaffId !== selectedAppointment.staff.id ||
        editServiceId !== originalPrimaryServiceId;

      // Past-time check uses newStartsAt (what we'd actually store),
      // not appointmentTime — so a buffer-backed block can't be reserved
      // partly in the past.
      if (hasDateTimeChanged && newStartsAt < new Date()) {
        toast.error("Cannot reschedule appointments to a time in the past");
        setIsSaving(false);
        return;
      }

      const newEndsAt = new Date(appointmentTime);
      newEndsAt.setMinutes(newEndsAt.getMinutes() + selectedService.duration_minutes + (selectedService.buffer_after_minutes || 0));

      const previousStatus = selectedAppointment.status;

      // Update the appointment row itself. service_id is no longer on
      // `appointment` — services live in the `appointment_service` join,
      // updated separately below. treatment_summary replaces the legacy
      // notes column.
      const { error } = await supabase.from("appointment").update({
        starts_at: newStartsAt.toISOString(),
        ends_at: newEndsAt.toISOString(),
        staff_id: editStaffId,
        status: editStatus,
        treatment_summary: editNotes.trim() || null,
      }).eq("id", selectedAppointment.id);

      if (error) {
        const isOverlap =
          (error as any).code === "23P01" || /overlap|exclusion/i.test(error.message);
        toast.error(
          isOverlap
            ? "That slot overlaps with another appointment for the same staff member"
            : "Failed to update appointment",
        );
        return;
      }

      // If the service changed, replace the appointment_service rows. The
      // single-pick edit always normalises to one service for now —
      // multi-service editing is a follow-up.
      //
      // Order matters: insert the new row FIRST. The old delete-first
      // ordering left the appointment with zero services if the insert
      // failed (e.g. missing practice_id, RLS), and the failure was
      // silently swallowed because the result wasn't checked. New flow:
      //   1. Insert new appointment_service row.
      //   2. Only if insert succeeds, delete the previous row(s) by id.
      //   3. If insert fails, surface the error and bail without touching
      //      the existing service link.
      if (editServiceId !== originalPrimaryServiceId) {
        const previousServiceRowIds =
          selectedAppointment.services?.map((s) => s.id).filter(Boolean) ?? [];

        const { error: insertErr } = await supabase
          .from("appointment_service")
          .insert({
            practice_id: selectedAppointment.practice_id,
            appointment_id: selectedAppointment.id,
            service_id: editServiceId,
            // Place ahead of existing rows so the new one becomes primary
            // even before the cleanup delete lands.
            display_order: -1,
            price_pence_snapshot: selectedService.price_pence ?? 0,
            duration_minutes_snapshot: selectedService.duration_minutes,
          });
        if (insertErr) {
          logger.error("Failed to attach new service", insertErr);
          toast.error(`Failed to update service: ${insertErr.message}`);
          return;
        }

        if (previousServiceRowIds.length > 0) {
          const { error: deleteErr } = await supabase
            .from("appointment_service")
            .delete()
            .in("id", previousServiceRowIds);
          if (deleteErr) {
            // Soft-fail: the new row is in, the old one is just hanging
            // around. Surface as a non-fatal warning so the operator
            // knows to retry or clean up; appointment is still usable.
            logger.warn("New service attached but previous link not cleaned up", deleteErr);
            toast.warning("Service updated, but old link couldn't be removed. Try again or contact support.");
          }
        }
      }

      // Queue patient notifications rather than sending immediately —
      // reception can shuffle the day and Send when ready via the
      // notification tray. previousStartsAt is the time the patient last
      // knew about; markNotificationPending only writes it on the first
      // move per queue entry, so consecutive in-app reschedules still
      // resolve to one email saying "moved from your original time to X".
      if (editStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
        await markNotificationPending(selectedAppointment.id, "CANCELLED", null);
      } else if (editStatus === "SCHEDULED" && previousStatus === "SCHEDULED" && hasDateTimeChanged) {
        await markNotificationPending(
          selectedAppointment.id,
          "RESCHEDULED",
          new Date(selectedAppointment.starts_at),
        );
      }

      toast.success("Appointment updated successfully");
      setIsEditing(false);
      setIsSheetOpen(false);
      loadAppointments();
    } catch (error) {
      toast.error("Failed to update appointment");
    } finally {
      setIsSaving(false);
    }
  };

  const getAvailableStatuses = () => {
    if (!selectedAppointment) return ["SCHEDULED", "COMPLETED", "CANCELLED"];
    const isPastAppointment = new Date(selectedAppointment.starts_at) < new Date();
    const statuses = ["SCHEDULED", "COMPLETED", "CANCELLED"];
    if (isPastAppointment) statuses.push("NO_SHOW");
    return statuses;
  };

  const handleQuickStatusChange = async (status: AppointmentStatus, notes?: string, actualPrice?: number | null, treatmentSummary?: string, cancellationReason?: string) => {
    if (!selectedAppointment) return;

    try {
      const previousStatus = selectedAppointment.status;
      const updateData: any = { status };

      // The new appointment table uses cancellation_reason (enum) +
      // cancellation_notes (free text). Free-text notes during cancellation
      // go into cancellation_notes; treatment notes during completion go
      // into treatment_summary. The legacy single-purpose `notes` column
      // is gone.
      if (status === "CANCELLED") {
        updateData.cancelled_at = new Date().toISOString();
        // Structured reason is required at the UI layer — the
        // Cancellations report aggregates by enum, not by free-text
        // notes. Notes remain optional supplementary context.
        if (cancellationReason) updateData.cancellation_reason = cancellationReason;
        if (notes) updateData.cancellation_notes = notes;
      }

      if (status === "COMPLETED") {
        if (treatmentSummary) updateData.treatment_summary = treatmentSummary;
        updateData.completed_at = new Date().toISOString();
      }

      // actualPrice from CompleteAppointmentDialog is captured server-side
      // via the billing_item flow — not stored on appointment directly.
      // The legacy `actual_price` column is gone in dentaloptima-core.
      void actualPrice;

      // Update appointment status
      const { error } = await supabase
        .from("appointment")
        .update(updateData)
        .eq("id", selectedAppointment.id);

      if (error) {
        toast.error("Failed to update appointment status");
        return;
      }

      // Queue the patient cancellation notification rather than auto-sending.
      // Reception confirms via the bell tray once the schedule has settled.
      if (status === "CANCELLED") {
        await markNotificationPending(selectedAppointment.id, "CANCELLED", null);

        // Fan out the now-free slot to matching waitlist patients. Best-effort
        // — if it fails the cancellation itself still succeeded, the staff
        // can run "Offer to waitlist" manually from the appointment sheet
        // (when we add that button). Skipped silently if the practice has
        // disabled auto_offer_cancelled_slots in settings.
        try {
          const { data: offerResult } = await supabase.functions.invoke(
            "offer-cancelled-slot",
            { body: { appointment_id: selectedAppointment.id } }
          );
          if (offerResult?.success && (offerResult.sent ?? 0) > 0) {
            toast.success(`Slot offered to ${offerResult.sent} waitlist patient${offerResult.sent === 1 ? "" : "s"}`);
          }
        } catch (offerErr) {
          // Non-fatal: cancellation has already succeeded. Just log.
          console.error("Failed to offer slot to waitlist:", offerErr);
        }
      }

      // Auto-send-invoice on completion is a follow-up feature in
      // dentaloptima-core. The legacy app_settings table doesn't exist
      // yet in the new schema; per-practice booking settings will be
      // added when needed.

      const statusMessages: Record<AppointmentStatus, string> = {
        COMPLETED: "Appointment marked as completed",
        CANCELLED: "Appointment cancelled successfully",
        NO_SHOW: "Appointment marked as no-show",
        SCHEDULED: "Appointment status updated",
      };

      // Undo affordance — reverts the appointment back to its previous
      // status. We deliberately don't try to un-do the cancellation's side
      // effects (waitlist offers, patient notification) — those are
      // separate records of what happened at the time and shouldn't
      // silently disappear. Reverting just the status is the useful bit.
      const apptId = selectedAppointment.id;
      const isReversible = previousStatus !== status;
      toast.success(statusMessages[status] || "Status updated successfully", {
        duration: 8000,
        action: isReversible
          ? {
              label: "Undo",
              onClick: async () => {
                const revert: Record<string, unknown> = { status: previousStatus };
                // Clear the stamps we set so the row looks like its prior
                // state. Treatment summary captured during the action is
                // preserved (it's clinically captured info, not a status).
                if (status === "CANCELLED") {
                  revert.cancelled_at = null;
                  revert.cancellation_notes = null;
                  // Also clear the queued cancellation notification — the
                  // patient shouldn't be told about a cancellation that's
                  // been undone before they ever heard about it.
                  revert.notification_pending = null;
                  revert.notification_prev_starts_at = null;
                }
                if (status === "COMPLETED") {
                  revert.completed_at = null;
                }
                const { error: undoErr } = await supabase
                  .from("appointment")
                  .update(revert)
                  .eq("id", apptId);
                if (undoErr) {
                  toast.error("Couldn't undo");
                  return;
                }
                toast.success("Reverted");
                loadAppointments();
              },
            }
          : undefined,
      });
      setIsSheetOpen(false);
      loadAppointments();
    } catch (error) {
      toast.error("Failed to update appointment status");
    }
  };

  if (loading) return <Layout title="Calendar"><LoadingState count={5} /></Layout>;

  // Show full-page skeleton on the very first appointment fetch only — keep
  // existing data visible during day-to-day navigation to avoid flicker.
  if (appointmentsLoading && appointments.length === 0 && !appointmentsError) {
    return <Layout title="Calendar"><LoadingState count={5} /></Layout>;
  }

  // Show error banner above whatever calendar state exists (don't replace UI)
  if (appointmentsError && appointments.length === 0) {
    return (
      <Layout title="Calendar">
        <ErrorMessage title="Couldn't load appointments" message={appointmentsError} />
      </Layout>
    );
  }

  const filteredAppointments = getFilteredAppointments();

  if (viewMode === "day" && selectedDay) {
    return (
      <Layout title="Calendar" onBack={backToCalendar}>
        <CalendarDayView
          selectedDay={selectedDay}
          appointments={filteredAppointments}
          allAppointments={appointments}
          blockedTimeEntries={blockedTimeEntries}
          bankHolidays={bankHolidays}
          showCancelled={showCancelled}
          onToggleCancelled={() => setShowCancelled(!showCancelled)}
          staff={staff}
          selectedStaffId={selectedStaffId}
          onStaffChange={setSelectedStaffId}
          onAddAppointment={(date, time, staffId) => {
            if (date) setPrefillDate(date);
            if (time) setPrefillTime(time);
            if (staffId) setPrefillStaffId(staffId);
            setIsNewAppointmentOpen(true);
          }}
          onBlockTime={(date, time, staffId) => {
            if (date) setBlockTimePrefillDate(date);
            if (time) setBlockTimePrefillTime(time);
            if (staffId) setBlockTimePrefillStaffId(staffId);
            setIsBlockTimeOpen(true);
          }}
          onAppointmentClick={openAppointmentDetail}
          onNavigatePrevious={navigatePreviousDay}
          onNavigateNext={navigateNextDay}
          checkOverlap={(apt) => checkAppointmentOverlap(apt, appointments)}
          checkWarning={(apt) => hasAppointmentWarning(apt, appointments, breaksMap, availabilityMap)}
          onAppointmentMoved={loadAppointments}
          onToday={goToToday}
          headerExtras={<NotificationTray />}
        />
        
        <AppointmentDetailSheet
          appointment={selectedAppointment}
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          editDate={editDate}
          setEditDate={setEditDate}
          editTime={editTime}
          setEditTime={setEditTime}
          editStaffId={editStaffId}
          setEditStaffId={setEditStaffId}
          editServiceId={editServiceId}
          setEditServiceId={setEditServiceId}
          editStatus={editStatus}
          setEditStatus={setEditStatus}
          editNotes={editNotes}
          setEditNotes={setEditNotes}
          staff={staff}
          services={services}
          availableStatuses={getAvailableStatuses()}
          onSave={saveAppointmentChanges}
          onQuickStatusChange={handleQuickStatusChange}
          isSaving={isSaving}
        />

        <Sheet
          open={isNewAppointmentOpen}
          onOpenChange={(open) => (open ? setIsNewAppointmentOpen(true) : closeNewAppointment())}
        >
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>New Appointment</SheetTitle>
              <SheetDescription className="sr-only">
                Create a new appointment for a patient
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              <NewAppointmentForm
                onSuccess={() => { closeNewAppointment(); loadAppointments(); }}
                onCancel={closeNewAppointment}
                prefilledStaffId={prefillStaffId}
                prefilledDate={prefillDate}
                prefilledTime={prefillTime}
                prefilledServiceId={prefillServiceId}
              />
            </div>
          </SheetContent>
        </Sheet>

        <BlockTimeDialog
          open={isBlockTimeOpen}
          onOpenChange={(open) => {
            setIsBlockTimeOpen(open);
            if (!open) {
              setBlockTimePrefillStaffId(undefined);
              setBlockTimePrefillDate(undefined);
              setBlockTimePrefillTime(undefined);
            }
          }}
          staff={staff}
          prefilledStaffId={blockTimePrefillStaffId}
          prefilledDate={blockTimePrefillDate}
          prefilledTime={blockTimePrefillTime}
        />
      </Layout>
    );
  }

  return (
    <Layout title="Calendar">
      <div className="flex items-center justify-between gap-2 mb-2">
        <RecentPatientsStrip />
        <NotificationTray />
      </div>
      <CalendarGridView
        currentDate={currentDate}
        viewMode={viewMode}
        // filteredAppointments respects the week/month "always hide
        // cancelled" rule from getFilteredAppointments. The raw
        // `appointments` array is intentionally kept available for
        // overlap/warning checks below — those still need to consider
        // every booking, cancelled or not.
        appointments={filteredAppointments}
        bankHolidays={bankHolidays}
        staff={staff}
        selectedStaffId={selectedStaffId}
        onStaffChange={setSelectedStaffId}
        onNavigatePrevious={navigatePrevious}
        onNavigateNext={navigateNext}
        onToday={goToToday}
        onViewModeChange={setViewMode}
        onDayClick={openDayView}
        onAppointmentClick={openAppointmentDetail}
        onAddAppointment={() => setIsNewAppointmentOpen(true)}
        checkOverlap={(apt) => checkAppointmentOverlap(apt, appointments)}
        checkWarning={(apt) => hasAppointmentWarning(apt, appointments, breaksMap, availabilityMap)}
      />

      <AppointmentDetailSheet
        appointment={selectedAppointment}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        editDate={editDate}
        setEditDate={setEditDate}
        editTime={editTime}
        setEditTime={setEditTime}
        editStaffId={editStaffId}
        setEditStaffId={setEditStaffId}
        editServiceId={editServiceId}
        setEditServiceId={setEditServiceId}
        editStatus={editStatus}
        setEditStatus={setEditStatus}
        editNotes={editNotes}
        setEditNotes={setEditNotes}
        staff={staff}
        services={services}
        availableStatuses={getAvailableStatuses()}
        onSave={saveAppointmentChanges}
        onQuickStatusChange={handleQuickStatusChange}
        isSaving={isSaving}
      />

      <Sheet
        open={isNewAppointmentOpen}
        onOpenChange={(open) => (open ? setIsNewAppointmentOpen(true) : closeNewAppointment())}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>New Appointment</SheetTitle></SheetHeader>
          <div className="mt-6">
            <NewAppointmentForm
              onSuccess={() => { closeNewAppointment(); loadAppointments(); }}
              onCancel={closeNewAppointment}
              prefilledStaffId={prefillStaffId}
              prefilledDate={prefillDate}
              prefilledTime={prefillTime}
              prefilledServiceId={prefillServiceId}
            />
          </div>
        </SheetContent>
      </Sheet>

      <BlockTimeDialog
        open={isBlockTimeOpen}
        onOpenChange={(open) => {
          setIsBlockTimeOpen(open);
          if (!open) {
            // Clear prefilled values when dialog closes
            setBlockTimePrefillStaffId(undefined);
            setBlockTimePrefillDate(undefined);
            setBlockTimePrefillTime(undefined);
          }
        }}
        staff={staff}
        prefilledStaffId={blockTimePrefillStaffId}
        prefilledDate={blockTimePrefillDate}
        prefilledTime={blockTimePrefillTime}
      />
    </Layout>
  );
}

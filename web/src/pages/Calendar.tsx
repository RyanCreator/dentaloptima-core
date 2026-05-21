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
import { useNotifications } from "@/hooks/useNotifications";
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
import { useBlockedTime } from "@/hooks/useBlockedTime";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { RecentPatientsStrip } from "@/components/RecentPatientsStrip";
import type { Appointment } from "@/hooks/useAppointments";
import { UK_TIMEZONE, AppointmentStatus } from "@/lib/constants";

export default function Calendar() {
  const { loading } = useRequireAuth();
  const location = useLocation();
  const { staff } = useStaff();
  const { services } = useServices();
  const { sendAppointmentCancelledNotification, sendAppointmentRescheduledNotification } = useNotifications();
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
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

  const { breaksMap, availabilityMap } = useStaffRules();
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

  useEffect(() => {
    if (location.state?.appointmentDate) {
      const date = parseISO(location.state.appointmentDate);
      const zonedDate = toZonedTime(date, UK_TIMEZONE);
      setSelectedDay(zonedDate);
      setViewMode("day");
      window.history.replaceState({}, document.title);
      
      if (location.state.appointmentId) {
        setTimeout(() => {
          const apt = appointments.find(a => a.id === location.state.appointmentId);
          if (apt) openAppointmentDetail(apt);
        }, 500);
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

  const getFilteredAppointments = () => {
    let filtered = showCancelled ? appointments : appointments.filter(apt => apt.status !== "CANCELLED");
    return selectedDay ? filtered.filter(apt => {
      const aptDate = toZonedTime(new Date(apt.starts_at), UK_TIMEZONE);
      return isSameDay(aptDate, selectedDay);
    }) : filtered;
  };

  const openAppointmentDetail = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsSheetOpen(true);
    setIsEditing(false);
    const aptTime = toZonedTime(new Date(appointment.starts_at), UK_TIMEZONE);
    setEditDate(aptTime);
    setEditTime(format(aptTime, "HH:mm"));
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

      const newStartsAt = new Date(appointmentTime);
      newStartsAt.setMinutes(newStartsAt.getMinutes() - (selectedService.buffer_before_minutes || 0));

      // Check if date/time has changed
      const originalTime = new Date(selectedAppointment.starts_at);
      const originalPrimaryServiceId = selectedAppointment.services?.[0]?.service?.id ?? "";
      const hasDateTimeChanged =
        appointmentTime.getTime() !== originalTime.getTime() ||
        editStaffId !== selectedAppointment.staff.id ||
        editServiceId !== originalPrimaryServiceId;

      // Only prevent rescheduling to past if date/time is being changed
      if (hasDateTimeChanged && appointmentTime < new Date()) {
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
        toast.error("Failed to update appointment");
        return;
      }

      // If the service changed, replace the appointment_service rows. The
      // single-pick edit always normalises to one service for now —
      // multi-service editing is a follow-up.
      if (editServiceId !== originalPrimaryServiceId) {
        await supabase
          .from("appointment_service")
          .delete()
          .eq("appointment_id", selectedAppointment.id);
        await supabase.from("appointment_service").insert({
          appointment_id: selectedAppointment.id,
          service_id: editServiceId,
          display_order: 0,
          price_pence_snapshot: selectedService.price_pence ?? 0,
          duration_minutes_snapshot: selectedService.duration_minutes,
        });
      }

      // Send notifications
      if (editStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
        // Send cancellation notification
        await sendAppointmentCancelledNotification(
          selectedAppointment.patient.id,
          selectedAppointment.id,
          editNotes
        );
      } else if (editStatus === "SCHEDULED" && previousStatus === "SCHEDULED" && hasDateTimeChanged) {
        // Send reschedule notification (only for SCHEDULED appointments with time changes)
        const oldDate = format(new Date(selectedAppointment.starts_at), "EEEE, d MMMM yyyy");
        const oldTime = format(new Date(selectedAppointment.starts_at), "HH:mm");
        const newDate = format(appointmentTime, "EEEE, d MMMM yyyy");
        const newTime = format(appointmentTime, "HH:mm");

        await sendAppointmentRescheduledNotification(
          selectedAppointment.patient.id,
          selectedAppointment.id,
          oldDate,
          oldTime,
          newDate,
          newTime
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

  const handleQuickStatusChange = async (status: AppointmentStatus, notes?: string, actualPrice?: number | null, treatmentSummary?: string) => {
    if (!selectedAppointment) return;

    try {
      const previousStatus = selectedAppointment.status;
      const updateData: any = { status };

      // The new appointment table uses cancellation_reason (enum) +
      // cancellation_notes (free text). Free-text notes during cancellation
      // go into cancellation_notes; treatment notes during completion go
      // into treatment_summary. The legacy single-purpose `notes` column
      // is gone.
      if (status === "CANCELLED" && notes) {
        updateData.cancellation_notes = notes;
        updateData.cancelled_at = new Date().toISOString();
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

      // Send cancellation notification if appointment was cancelled
      if (status === "CANCELLED") {
        await sendAppointmentCancelledNotification(
          selectedAppointment.patient.id,
          selectedAppointment.id,
          notes
        );

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

        <Sheet open={isNewAppointmentOpen} onOpenChange={setIsNewAppointmentOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>New Appointment</SheetTitle>
              <SheetDescription className="sr-only">
                Create a new appointment for a patient
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              <NewAppointmentForm
                onSuccess={() => { setIsNewAppointmentOpen(false); loadAppointments(); }}
                onCancel={() => setIsNewAppointmentOpen(false)}
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
      <RecentPatientsStrip />
      <CalendarGridView
        currentDate={currentDate}
        viewMode={viewMode}
        appointments={appointments}
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

      <Sheet open={isNewAppointmentOpen} onOpenChange={setIsNewAppointmentOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>New Appointment</SheetTitle></SheetHeader>
          <div className="mt-6">
            <NewAppointmentForm
              onSuccess={() => { setIsNewAppointmentOpen(false); loadAppointments(); }}
              onCancel={() => setIsNewAppointmentOpen(false)}
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

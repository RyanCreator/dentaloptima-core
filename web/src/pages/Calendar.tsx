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
    setEditServiceId(appointment.service.id || "");
    setEditStatus(appointment.status as AppointmentStatus);
    setEditNotes(appointment.notes || "");
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
      const hasDateTimeChanged =
        appointmentTime.getTime() !== originalTime.getTime() ||
        editStaffId !== selectedAppointment.staff.id ||
        editServiceId !== selectedAppointment.service.id;

      // Only prevent rescheduling to past if date/time is being changed
      if (hasDateTimeChanged && appointmentTime < new Date()) {
        toast.error("Cannot reschedule appointments to a time in the past");
        setIsSaving(false);
        return;
      }

      const newEndsAt = new Date(appointmentTime);
      newEndsAt.setMinutes(newEndsAt.getMinutes() + selectedService.duration_minutes + (selectedService.buffer_after_minutes || 0));

      const previousStatus = selectedAppointment.status;

      const { error } = await supabase.from("appointment").update({
        starts_at: newStartsAt.toISOString(),
        ends_at: newEndsAt.toISOString(),
        staff_id: editStaffId,
        service_id: editServiceId,
        status: editStatus,
        notes: editNotes.trim() || null,
      }).eq("id", selectedAppointment.id);

      if (error) {
        toast.error("Failed to update appointment");
        return;
      }

      // no_show_count is maintained by trg_sync_patient_no_show_count

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

      // Save cancellation reason when cancelling
      if (status === "CANCELLED" && notes) {
        updateData.cancellation_reason = notes;
      } else if (notes) {
        updateData.notes = notes;
      }

      // Add actual_price and treatment_summary when completing appointment
      if (status === "COMPLETED" && actualPrice !== undefined) {
        updateData.actual_price = actualPrice;
      }
      if (status === "COMPLETED" && treatmentSummary) {
        updateData.treatment_summary = treatmentSummary;
      }

      // Handle post-appointment reminder cancellation/reset
      if (previousStatus === "COMPLETED" && (status === "SCHEDULED" || status === "CANCELLED")) {
        // Changing FROM completed - cancel any pending post-appointment reminder
        updateData.post_appointment_reminder_cancelled = true;
      } else if (status === "COMPLETED") {
        // Marking as COMPLETED - reset cancellation flag (in case it was completed before)
        updateData.post_appointment_reminder_cancelled = false;
      }

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

      // Auto-send invoice on completion if the practice opted in. Most
      // practices take payment chair-side and this would send a duplicate
      // bill — that's why the setting defaults off. Iterates every unpaid
      // billing item and fires send-invoice; idempotent because the
      // function reuses the row's invoice_number on resend.
      if (status === "COMPLETED") {
        try {
          const { data: settings } = await supabase
            .from("app_settings")
            .select("auto_send_invoice_on_completion")
            .single();
          if (settings?.auto_send_invoice_on_completion) {
            const { data: items } = await supabase
              .from("billing_item")
              .select("id, payment_status, amount, amount_paid")
              .eq("appointment_id", selectedAppointment.id)
              .in("payment_status", ["UNPAID", "PARTIALLY_PAID"]);
            const billable = (items ?? []).filter(
              (i) => Number(i.amount) - Number(i.amount_paid) > 0
            );
            for (const item of billable) {
              await supabase.functions.invoke("send-invoice", {
                body: { billing_item_id: item.id },
              });
            }
            if (billable.length > 0) {
              toast.success(
                `Invoice${billable.length === 1 ? "" : "s"} sent to patient`
              );
            }
          }
        } catch (invErr) {
          // Non-fatal — completion already saved. Practice can resend manually.
          console.error("Auto-send invoice failed:", invErr);
        }
      }

      // no_show_count is maintained by trg_sync_patient_no_show_count

      const statusMessages: Record<AppointmentStatus, string> = {
        COMPLETED: "Appointment marked as completed",
        CANCELLED: "Appointment cancelled successfully",
        NO_SHOW: "Appointment marked as no-show",
        SCHEDULED: "Appointment status updated",
      };

      toast.success(statusMessages[status] || "Status updated successfully");
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

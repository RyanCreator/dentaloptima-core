import { useEffect, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { CalendarIcon, Check, X, UserX, LogIn, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DetailSheet } from "@/components/DetailSheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CompleteAppointmentDialog } from "@/components/calendar/CompleteAppointmentDialog";
import { BillingSection } from "@/components/calendar/BillingSection";
import { NHSExemptionPanel, type NHSExemptionCategory } from "@/components/calendar/NHSExemptionPanel";
import { NHSClaimSheet } from "@/components/calendar/NHSClaimSheet";
import { findClaimForAppointment } from "@/lib/createNhsClaim";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/hooks/useAppointments";
import { UK_TIMEZONE, AppointmentStatus } from "@/lib/constants";
import { formatPrice } from "@/types/entities";

// cancellation_reason enum values (see DB). Keep label text human-friendly
// — these appear in the dialog dropdown AND aggregate on the Cancellations
// report, so consistency matters.
const CANCELLATION_REASONS: Array<{ value: string; label: string }> = [
  { value: "PATIENT_REQUEST", label: "Patient request" },
  { value: "PATIENT_NO_RESPONSE", label: "Patient didn't respond" },
  { value: "STAFF_UNAVAILABLE", label: "Staff unavailable" },
  { value: "PRACTICE_CLOSURE", label: "Practice closure" },
  { value: "EQUIPMENT_FAILURE", label: "Equipment failure" },
  { value: "EMERGENCY", label: "Emergency" },
  { value: "OTHER", label: "Other" },
];

interface AppointmentDetailSheetProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  editDate: Date | undefined;
  setEditDate: (date: Date | undefined) => void;
  editTime: string;
  setEditTime: (time: string) => void;
  editStaffId: string;
  setEditStaffId: (id: string) => void;
  editServiceId: string;
  setEditServiceId: (id: string) => void;
  editStatus: AppointmentStatus;
  setEditStatus: (status: AppointmentStatus) => void;
  editNotes: string;
  setEditNotes: (notes: string) => void;
  staff: any[];
  services: any[];
  availableStatuses: string[];
  onSave: () => void;
  onQuickStatusChange?: (
    status: AppointmentStatus,
    notes?: string,
    actualPrice?: number | null,
    treatmentSummary?: string,
    cancellationReason?: string,
  ) => Promise<void>;
  isSaving: boolean;
}

export function AppointmentDetailSheet({
  appointment,
  isOpen,
  onOpenChange,
  isEditing,
  setIsEditing,
  editDate,
  setEditDate,
  editTime,
  setEditTime,
  editStaffId,
  setEditStaffId,
  editServiceId,
  setEditServiceId,
  editStatus,
  setEditStatus,
  editNotes,
  setEditNotes,
  staff,
  services,
  availableStatuses,
  onSave,
  onQuickStatusChange,
  isSaving,
}: AppointmentDetailSheetProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  // Structured cancellation reason (required) + optional free-text notes.
  // The enum is what aggregates on the Cancellations report; notes is
  // free supplementary context.
  const [cancelReasonCode, setCancelReasonCode] = useState<string>("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [isQuickUpdating, setIsQuickUpdating] = useState(false);
  const [showNhsClaim, setShowNhsClaim] = useState(false);
  const [existingClaim, setExistingClaim] = useState<{ id: string; status: string } | null>(null);
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    alert_type: string;
    severity: string;
    title: string;
    detail: string | null;
  }>>([]);

  // Pull active medical alerts for the patient so reception sees
  // pregnancy / anticoagulant / allergy flags inline. Cheap query —
  // typically 0-3 rows per patient.
  useEffect(() => {
    if (!appointment) {
      setAlerts([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("medical_alert")
      .select("id, alert_type, severity, title, detail")
      .eq("patient_id", appointment.patient.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("severity", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setAlerts(data as typeof alerts);
      });
    return () => { cancelled = true; };
  }, [appointment?.patient?.id]);

  // Look up any existing FP17 claim for this appointment so we can swap
  // "Create FP17 claim" for "View FP17 claim" + status badge.
  useEffect(() => {
    if (!appointment) {
      setExistingClaim(null);
      return;
    }
    let cancelled = false;
    findClaimForAppointment(appointment.id).then((res) => {
      if (cancelled) return;
      if (res?.claim) setExistingClaim({ id: res.claim.id, status: res.claim.status });
      else setExistingClaim(null);
    });
    return () => {
      cancelled = true;
    };
  }, [appointment?.id, showNhsClaim]);

  if (!appointment) return null;

  const isPastAppointment = new Date(appointment.starts_at) < new Date();
  const currentStatus = appointment.status;

  // The new schema uses appointment_service for many-to-many. UI here shows
  // the primary (first) service in the headline and lists extras inline.
  // Editing a single "service" is still single-pick for now — multi-service
  // editing is a follow-up.
  const primaryService = appointment.services?.[0]?.service ?? null;
  const allServices = appointment.services ?? [];
  const totalDurationMin = differenceInMinutes(
    new Date(appointment.ends_at),
    new Date(appointment.starts_at),
  );

  const handleQuickStatusChange = async (status: AppointmentStatus) => {
    if (!onQuickStatusChange) return;

    if (status === "CANCELLED") {
      setShowCancelDialog(true);
      return;
    }

    if (status === "COMPLETED") {
      setShowCompleteDialog(true);
      return;
    }

    setIsQuickUpdating(true);
    try {
      await onQuickStatusChange(status);
    } finally {
      setIsQuickUpdating(false);
    }
  };

  const handleCancelWithReason = async () => {
    if (!onQuickStatusChange) return;
    if (!cancelReasonCode) {
      toast.error("Pick a cancellation reason");
      return;
    }

    setIsQuickUpdating(true);
    try {
      await onQuickStatusChange(
        "CANCELLED",
        cancelReason.trim() || undefined,
        undefined,
        undefined,
        cancelReasonCode,
      );
      setShowCancelDialog(false);
      setCancelReason("");
      setCancelReasonCode("");
    } finally {
      setIsQuickUpdating(false);
    }
  };

  const handleCompleteWithPrice = async (actualPrice: number | null, treatmentSummary?: string) => {
    if (!onQuickStatusChange) return;

    setIsQuickUpdating(true);
    try {
      await onQuickStatusChange("COMPLETED", undefined, actualPrice, treatmentSummary);
      setShowCompleteDialog(false);
    } finally {
      setIsQuickUpdating(false);
    }
  };

  // Show quick actions for appointments that haven't been finalized
  const showQuickActions = onQuickStatusChange && !isEditing;

  return (
    <DetailSheet
      trigger={<></>}
      title="Appointment Details"
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setIsEditing(false);
      }}
    >
      <div className="space-y-4">
        {!isEditing ? (
          <>
            {/* Medical alerts strip — active medical_alert rows for this
                patient. Surfaces pregnancy / anticoagulant / allergies up
                front so reception doesn't have to click through to the
                patient page before the appointment starts. */}
            {alerts.length > 0 && (
              <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                  <UserX className="h-3.5 w-3.5" />
                  Medical alerts ({alerts.length})
                </div>
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className={
                      a.severity === "CRITICAL"
                        ? "text-sm text-red-800 dark:text-red-200"
                        : a.severity === "HIGH"
                          ? "text-sm text-amber-900 dark:text-amber-100"
                          : "text-sm text-amber-800 dark:text-amber-200"
                    }
                  >
                    <span className="font-medium">{a.title}</span>
                    {a.detail && <span className="ml-1 text-muted-foreground">— {a.detail}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-1">
                <span className="font-medium">Patient:</span>
                <Link to={`/patients/${appointment.patient.id}`} className="hover:underline flex items-center gap-1 text-primary">
                  {appointment.patient.full_name}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div>
                <span className="font-medium">Phone:</span> {appointment.patient.phone ?? "—"}
              </div>
              <div className="flex items-start gap-2 flex-wrap">
                <span className="font-medium">Service{allServices.length > 1 ? "s" : ""}:</span>
                <div className="flex flex-col gap-0.5">
                  {allServices.length === 0 ? (
                    <span className="text-muted-foreground italic">(no service)</span>
                  ) : (
                    allServices.map((s) => (
                      <span key={s.id} className="flex items-center gap-1.5">
                        {s.service.name} ({s.duration_minutes_snapshot} min · {formatPrice(s.price_pence_snapshot)})
                        {s.service.is_nhs && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium">NHS</span>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <span className="font-medium">Total duration:</span> {totalDurationMin} min
              </div>
              <div>
                <span className="font-medium">Staff:</span> {appointment.staff.full_name ?? "Unassigned"}
              </div>
              {/* Reserved block + patient arrival. The reserved block is
                  what the calendar shows visually (includes buffer time);
                  patient arrival is what we told the patient. We only show
                  arrival separately when there are buffers to distinguish. */}
              {(() => {
                const bufferBefore = primaryService?.buffer_before_minutes ?? 0;
                const bufferAfter = primaryService?.buffer_after_minutes ?? 0;
                const hasBuffers = bufferBefore > 0 || bufferAfter > 0;
                const blockStart = toZonedTime(new Date(appointment.starts_at), UK_TIMEZONE);
                const blockEnd = toZonedTime(new Date(appointment.ends_at), UK_TIMEZONE);
                const arrival = new Date(blockStart.getTime() + bufferBefore * 60_000);
                const leaves = new Date(blockEnd.getTime() - bufferAfter * 60_000);
                return (
                  <>
                    <div>
                      <span className="font-medium">Reserved block:</span>{" "}
                      {format(blockStart, "PPp")} – {format(blockEnd, "p")}
                    </div>
                    {hasBuffers && (
                      <div className="text-muted-foreground">
                        <span className="font-medium">Patient arrival:</span>{" "}
                        {format(arrival, "p")} – {format(leaves, "p")}
                        <span className="text-xs ml-1">
                          ({bufferBefore} min setup, {bufferAfter} min after)
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
              <div>
                <span className="font-medium">Status:</span> {appointment.status}
              </div>
              {appointment.treatment_summary && (
                <div>
                  <span className="font-medium">Treatment summary:</span>
                  <p className="mt-1 text-muted-foreground">{appointment.treatment_summary}</p>
                </div>
              )}
              {appointment.cancellation_notes && (
                <div>
                  <span className="font-medium">Cancellation note:</span>
                  <p className="mt-1 text-muted-foreground">{appointment.cancellation_notes}</p>
                </div>
              )}
            </div>

            {/* NHS exemption — only renders when at least one service is_nhs.
                Captured per-visit; flows into the FP17 claim at submission. */}
            <NHSExemptionPanel
              appointmentId={appointment.id}
              hasNhsService={allServices.some((s) => s.service?.is_nhs)}
              initialCategory={
                (appointment.nhs_exemption_category as NHSExemptionCategory) ?? "NONE"
              }
              initialEvidenceSeen={appointment.nhs_exemption_evidence_seen ?? false}
              patientNhsNumber={appointment.patient.nhs_number}
            />

            {/* Billing (shown for completed appointments). The first service
                is used for the headline; full multi-service billing is a
                follow-up. */}
            {currentStatus === "COMPLETED" && primaryService && (
              <BillingSection
                appointmentId={appointment.id}
                serviceName={primaryService.name}
                serviceId={primaryService.id}
                servicePrice={primaryService.price_pence / 100}
                isNhs={primaryService.is_nhs}
                nhsBand={primaryService.nhs_band}
              />
            )}

            {/* FP17 claim trigger. Surfaces only on completed appointments
                with at least one NHS service — kept off the chip otherwise
                so private-only days aren't cluttered. */}
            {currentStatus === "COMPLETED" &&
              allServices.some((s) => s.service?.is_nhs) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowNhsClaim(true)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {existingClaim ? "View FP17 claim" : "Create FP17 claim"}
                  {existingClaim && (
                    <span className="ml-auto text-[10px] font-medium uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">
                      {existingClaim.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  )}
                </Button>
              )}

            {/* Check-in button — for SCHEDULED appointments that haven't arrived */}
            {currentStatus === "SCHEDULED" && !appointment.arrived_at && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                  onClick={async () => {
                    // Write BOTH columns: arrived_at gives us the precise
                    // timestamp the calendar reads for "Checked in at
                    // HH:mm", and status='ARRIVED' is what the dashboard's
                    // waiting-room bucket filters on. Previously only
                    // arrived_at was written, so the dashboard stayed
                    // out of sync with the calendar.
                    const { error } = await supabase
                      .from("appointment")
                      .update({
                        status: "ARRIVED",
                        arrived_at: new Date().toISOString(),
                      })
                      .eq("id", appointment.id);
                    if (error) {
                      toast.error("Failed to check in");
                      return;
                    }
                    toast.success(`${appointment.patient.full_name} checked in`);
                    onOpenChange(false);
                  }}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Check In Patient
                </Button>
              </div>
            )}

            {/* Arrived indicator — show whenever the patient has been
                checked in but isn't yet in treatment or completed. The
                previous condition only matched status === "SCHEDULED",
                which broke after we started flipping status to ARRIVED
                on check-in. Now it covers SCHEDULED (legacy rows where
                status didn't transition) and ARRIVED (new behaviour). */}
            {appointment.arrived_at &&
              (currentStatus === "SCHEDULED" || currentStatus === "ARRIVED") && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-md px-3 py-2">
                  <Check className="h-3.5 w-3.5" />
                  Checked in at {format(new Date(appointment.arrived_at), "HH:mm")}
                </div>
              )}

            {/* Quick Action Buttons */}
            {showQuickActions && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs text-muted-foreground font-medium">Quick Actions</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {currentStatus !== "COMPLETED" && (
                    <Button
                      onClick={() => handleQuickStatusChange("COMPLETED")}
                      disabled={isQuickUpdating}
                      variant="default"
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Completed
                    </Button>
                  )}
                  {currentStatus !== "CANCELLED" && (
                    <Button
                      onClick={() => handleQuickStatusChange("CANCELLED")}
                      disabled={isQuickUpdating}
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                  {isPastAppointment && currentStatus !== "NO_SHOW" && (
                    <Button
                      onClick={() => handleQuickStatusChange("NO_SHOW")}
                      disabled={isQuickUpdating}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-amber-600 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20"
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      No-Show
                    </Button>
                  )}
                </div>
                <Button onClick={() => setIsEditing(true)} variant="outline" className="w-full" size="sm">
                  More Options
                </Button>
              </div>
            )}

            {!showQuickActions && (
              <Button onClick={() => setIsEditing(true)} className="w-full">
                {appointment.status === "CANCELLED" && new Date(appointment.starts_at) > new Date()
                  ? "Reschedule Appointment"
                  : "Edit Appointment"}
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <span className="text-sm font-medium">Patient:</span>
                <p className="text-sm mt-1">{appointment.patient.full_name}</p>
              </div>

              <div className="space-y-2">
                <Label>Service *</Label>
                <Select value={editServiceId} onValueChange={setEditServiceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name} ({service.duration_minutes} mins)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {allServices.length > 1 && (
                  <p className="text-[11px] text-amber-600">
                    Note: this appointment has {allServices.length} services. Editing replaces them with the chosen one. Multi-service editing is coming soon.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editDate ? format(editDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={editDate}
                      onSelect={setEditDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Patient arrival time</Label>
                <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                {/* Live preview of the resulting reserved block. The block
                    extends back by buffer_before and forward by duration +
                    buffer_after — so the operator sees what the calendar
                    chip will actually look like. */}
                {(() => {
                  const editedService = services.find((s) => s.id === editServiceId);
                  if (!editedService || !editTime) return null;
                  const [h, m] = editTime.split(":").map(Number);
                  if (Number.isNaN(h) || Number.isNaN(m)) return null;
                  const arrival = new Date();
                  arrival.setHours(h, m, 0, 0);
                  const blockStart = new Date(arrival.getTime() - (editedService.buffer_before_minutes ?? 0) * 60_000);
                  const blockEnd = new Date(
                    arrival.getTime() +
                      (editedService.duration_minutes + (editedService.buffer_after_minutes ?? 0)) * 60_000,
                  );
                  const bb = editedService.buffer_before_minutes ?? 0;
                  const ba = editedService.buffer_after_minutes ?? 0;
                  if (bb === 0 && ba === 0) return null;
                  return (
                    <p className="text-xs text-muted-foreground">
                      Reserved block: {format(blockStart, "HH:mm")}–{format(blockEnd, "HH:mm")}
                      <span className="ml-1">({bb} min before, {ba} min after)</span>
                    </p>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <Label>Staff Member</Label>
                <Select value={editStaffId} onValueChange={setEditStaffId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(value) => setEditStatus(value as AppointmentStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{editStatus === "CANCELLED" ? "Cancellation Reason" : "Treatment summary / notes"}</Label>
                <Textarea
                  placeholder={editStatus === "CANCELLED" ? "Reason for cancellation..." : "Add notes..."}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={onSave} disabled={isSaving} className="flex-1">
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason-code" className="text-sm">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Select value={cancelReasonCode} onValueChange={setCancelReasonCode}>
                <SelectTrigger id="cancel-reason-code">
                  <SelectValue placeholder="Pick a reason" />
                </SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-notes" className="text-sm">
                Notes <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="cancel-notes"
                placeholder="Any extra detail — patient said, who took the call, etc."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isQuickUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelWithReason}
              disabled={isQuickUpdating || !cancelReasonCode}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isQuickUpdating ? "Cancelling..." : "Confirm Cancellation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Dialog */}
      <CompleteAppointmentDialog
        open={showCompleteDialog}
        onOpenChange={setShowCompleteDialog}
        serviceName={primaryService?.name ?? "(no service)"}
        baselinePrice={primaryService ? primaryService.price_pence / 100 : 0}
        patientName={appointment.patient?.full_name}
        onConfirm={handleCompleteWithPrice}
        isUpdating={isQuickUpdating}
      />

      {/* FP17 claim sheet — separate from the main sheet so the user can
          take this slow without losing their place. Re-loads existing
          claim status when it closes. */}
      <NHSClaimSheet
        open={showNhsClaim}
        onOpenChange={setShowNhsClaim}
        appointment={appointment}
      />
    </DetailSheet>
  );
}

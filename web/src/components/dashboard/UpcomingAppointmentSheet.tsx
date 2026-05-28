import { useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  User,
  Stethoscope,
  FileText,
  Phone,
  ExternalLink,
  CheckCircle2,
  PlayCircle,
  XCircle,
  UserX,
  AlertTriangle,
  Receipt,
  RotateCcw,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge, getAppointmentBadgeVariant } from "@/components/Badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

// Dashboard appointment sheet. Started life as a read-only "what's this?"
// view; now also drives check-in: Arrived / Start treatment / Complete /
// No-show / Cancel, with the available actions chosen by the current
// status. Keeps the operator on the Dashboard for the whole flow rather
// than punting them to /calendar for every status change.

export interface UpcomingAppointmentSummary {
  id: string;
  starts_at: string;
  ends_at: string;
  // Wall-clock moment treatment actually started. Drives the
  // "X min remaining" countdown — if treatment was started early or
  // late, the expected end is started_at + booked duration, NOT the
  // original scheduled ends_at. Null on legacy rows where status went
  // straight to IN_PROGRESS before we tracked this.
  started_at: string | null;
  status: string;
  notes: string | null;
  patient_id: string;
  practice_id: string;
  patient: { full_name: string; phone: string | null } | null;
  staff: { full_name: string | null } | null;
  services: Array<{
    service: { id: string; name: string; price_pence: number | null; is_nhs: boolean } | null;
  }>;
}

const PAYMENT_METHODS = ["Cash", "Card", "Bank transfer", "Pay later"];

interface UpcomingAppointmentSheetProps {
  appointment: UpcomingAppointmentSummary | null;
  onOpenChange: (open: boolean) => void;
  // Fired after any status mutation so the parent can refetch its lists.
  // Optional — older callers without action support still work.
  onStatusChanged?: () => void;
}

export function UpcomingAppointmentSheet({
  appointment,
  onOpenChange,
  onStatusChanged,
}: UpcomingAppointmentSheetProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Toggles the sheet into "post-complete bill it now" mode. Set when
  // the operator clicks Complete treatment; cleared on bill/skip/close.
  const [billingPromptOpen, setBillingPromptOpen] = useState(false);
  // Pre-filled from the sum of service prices on the appointment.
  // String-typed because <Input type="number"> works with text and we
  // want to allow the operator to override (e.g. discount).
  const [billAmount, setBillAmount] = useState<string>("");
  const [billMethod, setBillMethod] = useState<string>("Card");
  const [billNote, setBillNote] = useState<string>("");

  const handleViewInCalendar = () => {
    if (!appointment) return;
    navigate("/calendar", {
      state: {
        appointmentDate: appointment.starts_at,
        appointmentId: appointment.id,
      },
    });
  };

  async function updateStatus(newStatus: string, successMessage: string) {
    if (!appointment) return;
    setBusy(true);
    try {
      // Each status transition has a paired timestamp column on the
      // appointment table — arrived_at, completed_at, cancelled_at.
      // Both must be written together so the calendar (which reads the
      // timestamp for "Checked in at HH:mm" etc.) and the dashboard
      // (which reads status for bucketing) stay consistent. Earlier
      // versions wrote only the status here and skipped the stamp,
      // which made the two surfaces disagree about who'd arrived.
      const patch: {
        status: string;
        arrived_at?: string;
        started_at?: string;
        completed_at?: string;
        cancelled_at?: string;
      } = { status: newStatus };
      const nowIso = new Date().toISOString();
      if (newStatus === "ARRIVED") patch.arrived_at = nowIso;
      if (newStatus === "IN_PROGRESS") patch.started_at = nowIso;
      if (newStatus === "COMPLETED") patch.completed_at = nowIso;
      if (newStatus === "CANCELLED") patch.cancelled_at = nowIso;
      const { error } = await supabase
        .from("appointment")
        .update(patch)
        .eq("id", appointment.id);
      if (error) throw error;
      toast.success(successMessage);
      onStatusChanged?.();

      // After Complete, don't close the sheet — flip it into "take
      // payment" mode so the operator can record billing in one flow
      // instead of having to dig back in later. Pre-fill the amount
      // from the sum of service prices on the appointment. Seed the
      // notes field with any existing treatment_summary so the operator
      // sees what's already there (avoids accidental overwrite).
      if (newStatus === "COMPLETED") {
        const totalPence = (appointment.services ?? []).reduce(
          (sum, s) => sum + (s.service?.price_pence ?? 0),
          0,
        );
        setBillAmount(totalPence > 0 ? (totalPence / 100).toFixed(2) : "");
        setBillMethod("Card");
        setBillNote(appointment.notes ?? "");
        setBillingPromptOpen(true);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update appointment");
    } finally {
      setBusy(false);
    }
  }

  async function submitBilling() {
    if (!appointment) return;
    const amountPounds = parseFloat(billAmount);
    if (Number.isNaN(amountPounds) || amountPounds < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const totalPence = Math.round(amountPounds * 100);
    // "Pay later" → unpaid, anything else → paid in full (default behaviour
    // for the till — partial payments still possible via the calendar's
    // billing section if needed).
    const paid = billMethod !== "Pay later";

    // Service hint — keep the description tied to what was done so the
    // billing report reads sensibly.
    const firstService = appointment.services?.[0]?.service ?? null;
    const description = firstService
      ? firstService.name
      : "Treatment";

    setBusy(true);
    try {
      // Save notes first if the operator typed any — even if billing
      // fails for some reason, the clinical record shouldn't be lost.
      await saveTreatmentNotesIfChanged();

      // NHS billing items require a band — the DB has CHECK (NOT (is_nhs AND
       // nhs_band IS NULL)). If the service is flagged NHS but doesn't have a
       // band set yet, fall back to recording as private so the till entry
       // doesn't fail; the operator can fix the service later and the FP17
       // claim flow is the proper home for NHS-band capture anyway.
      const recordAsNhs = !!firstService?.is_nhs && !!firstService?.nhs_band;
      const { error } = await supabase.from("billing_item").insert({
        practice_id: appointment.practice_id,
        patient_id: appointment.patient_id,
        appointment_id: appointment.id,
        service_id: firstService?.id ?? null,
        description,
        unit_price_pence: totalPence,
        total_pence: totalPence,
        amount_paid_pence: paid ? totalPence : 0,
        payment_status: paid ? "PAID" : "UNPAID",
        payment_method: billMethod,
        is_nhs: recordAsNhs,
        nhs_band: recordAsNhs ? firstService!.nhs_band : null,
      });
      if (error) throw error;
      toast.success(paid ? `Charged £${amountPounds.toFixed(2)}` : "Recorded — payment pending");
      onStatusChanged?.();
      setBillingPromptOpen(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record billing");
    } finally {
      setBusy(false);
    }
  }

  // Persist treatment notes in two places:
  //   1. appointment.treatment_summary — the "what was done" field on
  //      the appointment record. Always updated so the appointment's
  //      detail view in the calendar / patient history shows it.
  //   2. note table with parent_type='PATIENT' — so the same text also
  //      lands on the patient profile's Notes section. Without this
  //      insert, treatment notes are only visible from the appointment
  //      row, not on the patient's main page.
  //
  // Called by both the bill and skip paths — typing notes shouldn't be
  // wasted just because the operator chose to skip billing.
  async function saveTreatmentNotesIfChanged() {
    if (!appointment) return;
    const trimmed = billNote.trim();
    const existing = (appointment.notes ?? "").trim();
    if (trimmed === existing) return;

    // (1) Treatment summary on the appointment.
    const { error: apptError } = await supabase
      .from("appointment")
      .update({ treatment_summary: trimmed || null })
      .eq("id", appointment.id);
    if (apptError) {
      toast.error("Notes weren't saved — try again from the calendar");
      return;
    }

    // (2) Patient-level note. Only insert when there's actually content
    // (we don't want a blank "Treatment notes" entry on the profile if
    // the operator just cleared the field). Includes the service name +
    // date so the profile reader sees the context.
    if (trimmed) {
      const serviceName = appointment.services?.[0]?.service?.name ?? "Treatment";
      const dateLabel = format(new Date(appointment.starts_at), "d MMM yyyy");
      const noteBody = `[${serviceName} — ${dateLabel}]\n${trimmed}`;
      const { error: noteError } = await supabase.from("note").insert({
        practice_id: appointment.practice_id,
        parent_type: "PATIENT",
        parent_id: appointment.patient_id,
        patient_id: appointment.patient_id,
        note_type: "CLINICAL",
        body: noteBody,
        is_confidential: false,
      });
      if (noteError) {
        // Non-fatal — the treatment summary is saved. Surface so the
        // operator knows the profile note didn't land.
        toast.error("Note saved on the appointment but not on the patient profile");
      }
    }
  }

  async function skipBilling() {
    setBusy(true);
    try {
      await saveTreatmentNotesIfChanged();
    } finally {
      setBusy(false);
      setBillingPromptOpen(false);
      onOpenChange(false);
    }
  }

  const startDate = appointment ? new Date(appointment.starts_at) : null;
  const endDate = appointment ? new Date(appointment.ends_at) : null;
  const services =
    appointment?.services
      ?.map((s) => s.service?.name)
      .filter((n): n is string => !!n)
      .join(", ") || "—";

  // Derive late-ness from time + status (LATE isn't a real enum value).
  const now = new Date();
  const isLate =
    !!appointment &&
    !!startDate &&
    (appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED") &&
    startDate.getTime() < now.getTime();
  const minutesLate = isLate && startDate ? differenceInMinutes(now, startDate) : 0;

  // For in-progress: how long ago was the scheduled start, how long until
  // the planned end. Expected end = actual treatment start + booked
  // duration. If we don't have started_at (legacy row), fall back to the
  // scheduled ends_at so the indicator still says something useful.
  //
  // Without this, a 30-min treatment started early at 12:28 for a 13:30
  // appointment would show "91 min remaining" — measuring time until the
  // scheduled end, not until the treatment will actually wrap up.
  const inProgress = appointment?.status === "IN_PROGRESS";
  const startedAtDate =
    appointment?.started_at ? new Date(appointment.started_at) : null;
  const apptDurationMs =
    startDate && endDate ? endDate.getTime() - startDate.getTime() : 0;
  const expectedEnd =
    startedAtDate && apptDurationMs > 0
      ? new Date(startedAtDate.getTime() + apptDurationMs)
      : endDate;
  const minsSinceStart =
    inProgress && startedAtDate
      ? differenceInMinutes(now, startedAtDate)
      : inProgress && startDate
        ? differenceInMinutes(now, startDate)
        : 0;
  const minsUntilEnd =
    inProgress && expectedEnd ? differenceInMinutes(expectedEnd, now) : 0;

  return (
    <Sheet
      open={!!appointment}
      onOpenChange={(open) => {
        // Clear billing prompt state when sheet closes so it doesn't
        // re-open with stale form values on the next appointment.
        if (!open) setBillingPromptOpen(false);
        onOpenChange(open);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">
            {billingPromptOpen ? "Take payment" : appointment?.patient?.full_name ?? "Appointment"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {billingPromptOpen
              ? "Record payment for the completed appointment."
              : "Appointment summary and check-in actions."}
          </SheetDescription>
        </SheetHeader>

        {/* Post-complete billing prompt — replaces the summary view so
            the operator can capture the charge in one flow. They can
            "Skip" to record billing later from the calendar. */}
        {appointment && billingPromptOpen ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 px-4 py-3 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-emerald-900 dark:text-emerald-100">
                  Treatment complete
                </p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70">
                  {appointment.patient?.full_name ?? "Patient"} ·{" "}
                  {appointment.services?.[0]?.service?.name ?? "Treatment"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-notes">
                Treatment notes{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="bill-notes"
                value={billNote}
                onChange={(e) => setBillNote(e.target.value)}
                placeholder="What was done? Anything to flag for next visit?"
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">
                Saved to this appointment's record — visible on the patient's history.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-amount">Amount (£)</Label>
              <Input
                id="bill-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Pre-filled from the booked service price — override if discounted.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-method">Payment method</Label>
              <Select value={billMethod} onValueChange={setBillMethod}>
                <SelectTrigger id="bill-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {billMethod === "Pay later" && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Records the charge as unpaid — appears in Outstanding Balance until settled.
                </p>
              )}
            </div>

            <div className="pt-4 border-t space-y-2">
              <Button onClick={submitBilling} disabled={busy} className="w-full">
                {busy
                  ? "Recording…"
                  : billMethod === "Pay later"
                    ? "Record (unpaid)"
                    : `Charge £${parseFloat(billAmount || "0").toFixed(2)}`}
              </Button>
              <Button
                variant="ghost"
                onClick={skipBilling}
                disabled={busy}
                size="sm"
                className="w-full"
              >
                Skip — bill later
              </Button>
            </div>
          </div>
        ) : appointment && startDate && endDate && (
          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={getAppointmentBadgeVariant(appointment.status)}>
                {appointment.status}
              </Badge>
              {isLate && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                  <AlertTriangle className="h-3 w-3" />
                  {minutesLate} min late
                </span>
              )}
              {inProgress && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                  <PlayCircle className="h-3 w-3" />
                  {minsUntilEnd >= 0
                    ? `${minsUntilEnd} min remaining`
                    : `${Math.abs(minsUntilEnd)} min over`}
                </span>
              )}
            </div>

            <SummaryRow icon={Clock} label="Time">
              <div className="font-medium">{format(startDate, "EEEE d MMMM")}</div>
              <div className="text-sm text-muted-foreground">
                {format(startDate, "HH:mm")} – {format(endDate, "HH:mm")}
              </div>
            </SummaryRow>

            <SummaryRow icon={Stethoscope} label="Service">
              <div className="font-medium">{services}</div>
            </SummaryRow>

            <SummaryRow icon={User} label="With">
              <div className="font-medium">
                {appointment.staff?.full_name ?? "Unassigned"}
              </div>
            </SummaryRow>

            {appointment.patient?.phone && (
              <SummaryRow icon={Phone} label="Patient phone">
                <a
                  href={`tel:${appointment.patient.phone}`}
                  className="font-medium text-primary hover:underline"
                >
                  {appointment.patient.phone}
                </a>
              </SummaryRow>
            )}

            {appointment.notes && (
              <SummaryRow icon={FileText} label="Notes">
                <p className="text-sm whitespace-pre-line">{appointment.notes}</p>
              </SummaryRow>
            )}

            {/* Status-aware action block — primary action depends on where
                the patient is in the journey. We deliberately keep this
                short: anything more involved (reschedule, edit time,
                multi-service) jumps to the calendar via the link below. */}
            <div className="pt-4 border-t space-y-2">
              <StatusActions
                status={appointment.status}
                isLate={isLate}
                busy={busy}
                onArrived={() =>
                  updateStatus(
                    "ARRIVED",
                    isLate
                      ? "Marked arrived (running late)"
                      : "Marked arrived",
                  )
                }
                onStart={() => updateStatus("IN_PROGRESS", "Treatment started")}
                onComplete={() => updateStatus("COMPLETED", "Treatment completed")}
                onNoShow={() => setConfirmNoShow(true)}
                onCancel={() => setConfirmCancel(true)}
              />

              {/* Post-treatment quick links — once the appointment's
                  completed, the operator usually wants to do one of these
                  next. Each is a deep-link to the right surface; no
                  business logic baked in here. */}
              {appointment.status === "COMPLETED" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/recalls`)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Book recall
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewInCalendar}
                  >
                    <Receipt className="h-4 w-4 mr-1.5" />
                    Add billing
                  </Button>
                </div>
              )}

              <Button
                variant="ghost"
                onClick={handleViewInCalendar}
                className="w-full"
                size="sm"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View in calendar
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={confirmNoShow} onOpenChange={setConfirmNoShow}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as no-show?</AlertDialogTitle>
              <AlertDialogDescription>
                This records that the patient did not attend. You can still
                re-open and reschedule from the calendar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => updateStatus("NO_SHOW", "Marked as no-show")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                No-show
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
              <AlertDialogDescription>
                The slot will free up immediately. You can still see the
                cancelled record in the cancellations log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => updateStatus("CANCELLED", "Appointment cancelled")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancel appointment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

interface StatusActionsProps {
  status: string;
  isLate: boolean;
  busy: boolean;
  onArrived: () => void;
  onStart: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}

function StatusActions({
  status,
  isLate,
  busy,
  onArrived,
  onStart,
  onComplete,
  onNoShow,
  onCancel,
}: StatusActionsProps) {
  // SCHEDULED / CONFIRMED — patient hasn't shown yet
  if (status === "SCHEDULED" || status === "CONFIRMED") {
    return (
      <div className="space-y-2">
        <Button onClick={onArrived} disabled={busy} className="w-full">
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          {isLate ? "Arrived (running late)" : "Mark arrived"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          {isLate && (
            <Button variant="outline" size="sm" onClick={onNoShow} disabled={busy}>
              <UserX className="h-4 w-4 mr-1.5" />
              No-show
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            className={isLate ? "" : "col-span-2"}
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ARRIVED — checked in, waiting to start
  if (status === "ARRIVED") {
    return (
      <div className="space-y-2">
        <Button onClick={onStart} disabled={busy} className="w-full">
          <PlayCircle className="h-4 w-4 mr-1.5" />
          Start treatment
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNoShow}
          disabled={busy}
          className="w-full"
        >
          <UserX className="h-4 w-4 mr-1.5" />
          Mark no-show
        </Button>
      </div>
    );
  }

  // IN_PROGRESS — in the chair
  if (status === "IN_PROGRESS") {
    return (
      <Button onClick={onComplete} disabled={busy} className="w-full">
        <CheckCircle2 className="h-4 w-4 mr-1.5" />
        Complete treatment
      </Button>
    );
  }

  // Terminal statuses — no action buttons (the post-treatment quick
  // links and "View in calendar" still render below).
  return null;
}

function SummaryRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

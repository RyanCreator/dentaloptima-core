import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge, getAppointmentBadgeVariant } from "@/components/Badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useRequireAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { usePractice } from "@/contexts/PracticeContext";
import { format, isPast, differenceInYears, parseISO } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Pencil, AlertTriangle, Phone, Mail, Plus, ListPlus, X as XIcon, Download, Tablet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { buildDsarExport, downloadDsarJson } from "@/lib/dsarExport";
import { useRecentPatients } from "@/hooks/useRecentPatients";
import { toast } from "sonner";
import { formatTime } from "@/lib/timeUtils";
import { MedicalHistorySection } from "@/components/patient/MedicalHistorySection";
import { MedicalAlertsSection } from "@/components/patient/MedicalAlertsSection";
import { ConsentRecordsSection } from "@/components/patient/ConsentRecordsSection";
import { PrescriptionsSection } from "@/components/patient/PrescriptionsSection";
import { TreatmentPlansSection } from "@/components/patient/TreatmentPlansSection";
import { ReferralsSection } from "@/components/patient/ReferralsSection";
import { DocumentsSection } from "@/components/patient/DocumentsSection";
import { NHSClaimsSection } from "@/components/patient/NHSClaimsSection";
import { formatPrice } from "@/types/entities";

// Adapted to dentaloptima-core's `patient`, `medical_alert`, and `note`
// tables. Things that changed from the legacy schema:
//   - patient.date_of_birth → patient.dob
//   - patient.notes → gone. Stored as a `note` row with parent_type='PATIENT'.
//   - patient.is_pregnant / takes_anticoagulant flags → medical_alert rows
//     (alert_type='PREGNANCY' / 'ANTICOAGULANT'). Surface them as a banner.
//   - patient.no_show_count → no longer denormalised; compute from
//     appointments where status='NO_SHOW'.
//   - patient.do_not_contact → modelled via the three marketing_consent_*
//     boolean columns (true = ok to contact via that channel).
//   - appointment.service_id / actual_price → gone. Services come via
//     appointment_service M:N join, with snapshotted price + duration.
//   - appointment.notes → split into cancellation_notes (when cancelled)
//     and treatment_summary (when completed).
//
// What this page intentionally does NOT do yet:
//   - Edit medical_alerts inline (read-only banner). A dedicated alerts
//     manager will land alongside the patient flags refactor.
//   - Multi-service editing (we still allow swapping to one service per
//     appointment from this page; multi-service editing is the calendar's job).

const ROLE_TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Mx"];

// Map the cancellation_reason enum to the same human labels the calendar's
// cancel dialog uses, so the report and the patient history read the same.
function formatCancellationReason(code: string): string {
  switch (code) {
    case "PATIENT_REQUEST": return "Patient request";
    case "PATIENT_NO_RESPONSE": return "No response";
    case "STAFF_UNAVAILABLE": return "Staff unavailable";
    case "PRACTICE_CLOSURE": return "Practice closure";
    case "EQUIPMENT_FAILURE": return "Equipment failure";
    case "EMERGENCY": return "Emergency";
    case "OTHER": return "Other";
    default: return code.replace(/_/g, " ").toLowerCase();
  }
}

function calculateAge(dob: string | null): string | null {
  if (!dob) return null;
  try {
    return `${differenceInYears(new Date(), parseISO(dob))}`;
  } catch {
    return null;
  }
}

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={cn("flex justify-between gap-4 py-1.5", className)}>
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

// Right-aligned key/value row used in the patient header's clinical-facts
// panel. Renders as a table-like row per fact.
function Fact({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", !value && "text-muted-foreground/60")}>
        {value || "—"}
      </span>
    </div>
  );
}

// Two-letter initials from a full name. Falls back to "?" for empty input.
function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

interface AppointmentService {
  id: string;
  service_id: string;
  price_pence_snapshot: number | null;
  service: { id: string; name: string; duration_minutes: number; is_nhs: boolean } | null;
}

interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  treatment_summary: string | null;
  cancellation_reason: string | null;
  cancellation_notes: string | null;
  staff_id: string;
  staff: { id: string; full_name: string } | null;
  services: AppointmentService[];
}

interface MedicalAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  detail: string | null;
  expires_at: string | null;
}

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  author: { full_name: string | null } | null;
}

interface WaitlistEntry {
  id: string;
  priority: "URGENT" | "HIGH" | "NORMAL" | "LOW";
  preferred_time_of_day: "MORNING" | "AFTERNOON" | "EVENING" | "ANY" | null;
  notes: string | null;
  created_at: string;
  is_active: boolean;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  service: { id: string; name: string; duration_minutes: number } | null;
  service_text: string | null;
}

const WAITLIST_PRIORITY_STYLES: Record<WaitlistEntry["priority"], string> = {
  URGENT:
    "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200 border-red-200 dark:border-red-900/50",
  HIGH:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200 border-orange-200 dark:border-orange-900/50",
  NORMAL:
    "bg-muted text-muted-foreground border-transparent",
  LOW: "bg-muted/60 text-muted-foreground border-transparent",
};

const WAITLIST_TIME_LABELS: Record<
  NonNullable<WaitlistEntry["preferred_time_of_day"]>,
  string
> = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
  ANY: "Any time",
};

export default function PatientDetail() {
  const { id } = useParams();
  const { loading } = useRequireAuth();
  const { sendAppointmentCancelledNotification, sendAppointmentRescheduledNotification } =
    useNotifications();
  const navigate = useNavigate();
  const tenant = usePractice();

  const auth = useAuth();
  const isAdmin = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";
  const { track: trackRecentPatient } = useRecentPatients();

  const [patient, setPatient] = useState<any>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [savingPatient, setSavingPatient] = useState(false);
  const [exportingDsar, setExportingDsar] = useState(false);

  const handleDsarExport = async () => {
    if (!auth.member || !id || !patient) return;
    setExportingDsar(true);
    try {
      const payload = await buildDsarExport(id, auth.member.practice_id, {
        id: auth.member.id,
        full_name: auth.member.full_name,
        email: auth.member.email,
      });
      const fileName = `${patient.first_name ?? ""}_${patient.last_name ?? ""}`.trim() || "patient";
      downloadDsarJson(payload, fileName);
      toast.success("DSAR export downloaded");
      toast.message("Audit-logged. Document signed URLs are valid for 24h.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingDsar(false);
    }
  };

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showEditAppt, setShowEditAppt] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [apptForm, setApptForm] = useState<Record<string, any>>({});
  const [updatingAppt, setUpdatingAppt] = useState(false);

  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);

  const [alerts, setAlerts] = useState<MedicalAlert[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [newNote, setNewNote] = useState("");

  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  // Retention status — small badge near the header. `retentionEligible` is
  // the public RPC's answer; it's null while we wait for the round-trip
  // (so we don't render an incorrect "eligible" badge before data lands).
  const [retentionEligible, setRetentionEligible] = useState<boolean | null>(null);
  const [togglingHold, setTogglingHold] = useState(false);

  useEffect(() => {
    if (!loading && id) {
      loadPatient();
      loadAppointments();
      loadWaitlist();
      loadAlerts();
      loadNotes();
      loadServices();
      loadStaff();
      void loadRetentionEligibility();
    }
  }, [loading, id]);

  const loadRetentionEligibility = async () => {
    if (!id) return;
    const { data, error } = await supabase.rpc("is_patient_retention_eligible", { p_patient_id: id });
    if (error) {
      // Don't toast — this is a passive indicator. Just clear the state.
      setRetentionEligible(null);
      return;
    }
    setRetentionEligible(Boolean(data));
  };

  const toggleLegalHold = async () => {
    if (!patient || !id) return;
    setTogglingHold(true);
    const next = !patient.legal_hold;
    const { error } = await supabase
      .from("patient")
      .update({ legal_hold: next, legal_hold_reason: next ? (patient.legal_hold_reason ?? "Set via patient page") : null })
      .eq("id", id);
    setTogglingHold(false);
    if (error) {
      toast.error(error.message || "Couldn't update legal hold");
      return;
    }
    toast.success(next ? "Legal hold applied" : "Legal hold removed");
    await loadPatient();
    await loadRetentionEligibility();
  };

  const loadPatient = async () => {
    const { data, error } = await supabase.from("patient").select("*").eq("id", id).single();
    if (!error && data) {
      setPatient(data);
      // Pop this patient onto the user's recents list so the calendar's
      // "recently viewed" strip can jump back here without a search.
      trackRecentPatient(data);
    }
    setLoadingPatient(false);
  };

  // appointment_service is the new M:N join — fetch services through it.
  // Snapshot fields tell us what was charged at booking time, so we don't
  // need a per-appointment actual_price column anymore.
  const loadAppointments = async () => {
    const { data } = await supabase
      .from("appointment")
      .select(
        `id, starts_at, ends_at, status, treatment_summary, cancellation_reason, cancellation_notes, staff_id,
         staff:staff_id (id, full_name),
         services:appointment_service (
           id, service_id, price_pence_snapshot,
           service:service_id (id, name, duration_minutes, is_nhs)
         )`,
      )
      .eq("patient_id", id)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false });
    if (data) setAppointments(data as unknown as Appointment[]);
  };

  const loadWaitlist = async () => {
    const { data } = await supabase
      .from("waiting_list")
      .select(
        `id, priority, preferred_time_of_day, notes, created_at, is_active, fulfilled_at, cancelled_at, service_text,
         service:service_id (id, name, duration_minutes)`,
      )
      .eq("patient_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setWaitlist(data as unknown as WaitlistEntry[]);
  };

  const removeFromWaitlist = async (entryId: string) => {
    if (!confirm("Remove this patient from the waitlist?")) return;
    const { error } = await supabase
      .from("waiting_list")
      .update({
        is_active: false,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Removed from patient profile",
      })
      .eq("id", entryId);
    if (error) {
      toast.error("Failed to remove from waitlist");
      return;
    }
    toast.success("Removed from waitlist", {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          // Flip everything back. cancelled_at/reason aren't unique
          // identifiers — clearing them returns the row to its pre-remove
          // state (active waitlist entry with no cancellation stamp).
          const { error: undoErr } = await supabase
            .from("waiting_list")
            .update({ is_active: true, cancelled_at: null, cancellation_reason: null })
            .eq("id", entryId);
          if (undoErr) { toast.error("Couldn't undo"); return; }
          toast.success("Restored to waitlist");
          loadWaitlist();
        },
      },
    });
    loadWaitlist();
  };

  const loadAlerts = async () => {
    const { data } = await supabase
      .from("medical_alert")
      .select("id, alert_type, severity, title, detail, expires_at")
      .eq("patient_id", id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("severity", { ascending: false });
    if (data) setAlerts(data as MedicalAlert[]);
  };

  const loadNotes = async () => {
    const { data } = await supabase
      .from("note")
      .select("id, body, created_at, author:author_id (full_name)")
      .eq("parent_type", "PATIENT")
      .eq("parent_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setNotes(data as unknown as NoteRow[]);
  };

  const loadServices = async () => {
    const { data } = await supabase
      .from("service")
      .select("id, name, duration_minutes, price_pence, is_nhs")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name");
    if (data) setServices(data);
  };

  const loadStaff = async () => {
    const { data } = await supabase
      .from("practice_member")
      .select("id, full_name, role, is_active")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name");
    if (data) setStaff(data);
  };

  const bookAppointment = () => {
    navigate("/calendar", {
      state: { openNewAppointment: true, prefilledPatientId: id },
    });
  };

  // Computed once we have appointments. Replaces the old denormalised
  // patient.no_show_count column.
  const noShowCount = useMemo(
    () => appointments.filter((a) => a.status === "NO_SHOW").length,
    [appointments],
  );

  const hasPregnancyAlert = alerts.some((a) => a.alert_type === "PREGNANCY");
  const hasAnticoagulantAlert = alerts.some((a) => a.alert_type === "ANTICOAGULANT");

  // -------------------------------------------------------------------------
  // Patient edit
  // -------------------------------------------------------------------------
  const openEditPatient = () => {
    setEditForm({ ...patient });
    setShowEditPatient(true);
  };

  const updateField = (key: string, value: any) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const savePatient = async () => {
    setSavingPatient(true);
    const { error } = await supabase
      .from("patient")
      .update({
        title: editForm.title || null,
        first_name: (editForm.first_name || "").trim(),
        last_name: (editForm.last_name || "").trim(),
        phone: editForm.phone || null,
        email: editForm.email || null,
        dob: editForm.dob || null,
        nhs_number: editForm.nhs_number || null,
        address_line1: editForm.address_line1 || null,
        address_line2: editForm.address_line2 || null,
        city: editForm.city || null,
        postcode: editForm.postcode || null,
        emergency_contact_name: editForm.emergency_contact_name || null,
        emergency_contact_phone: editForm.emergency_contact_phone || null,
        emergency_contact_relation: editForm.emergency_contact_relation || null,
        marketing_consent_email: editForm.marketing_consent_email ?? false,
        marketing_consent_sms: editForm.marketing_consent_sms ?? false,
        marketing_consent_post: editForm.marketing_consent_post ?? false,
      })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update patient");
    } else {
      toast.success("Patient updated");
      setShowEditPatient(false);
      loadPatient();
    }
    setSavingPatient(false);
  };

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------
  const addNote = async () => {
    if (!newNote.trim() || !id) return;

    // `note.practice_id` is NOT NULL — required for RLS and audit.
    // Without it the insert fails and the user just sees a vague toast.
    const { error } = await supabase.from("note").insert({
      practice_id: tenant.practice.id,
      parent_type: "PATIENT",
      parent_id: id,
      patient_id: id,
      body: newNote.trim(),
      note_type: "CLINICAL",
    });

    if (error) {
      toast.error("Failed to add note");
    } else {
      setNewNote("");
      loadNotes();
    }
  };

  // -------------------------------------------------------------------------
  // Appointment edit — single-service swap. Replaces all appointment_service
  // rows for this appointment with one row matching the chosen service. For
  // multi-service editing, send users to the calendar.
  // -------------------------------------------------------------------------
  const openEditAppt = (appt: Appointment) => {
    const firstService = appt.services?.[0]?.service_id ?? "";
    setSelectedAppt(appt);
    setApptForm({
      service_id: firstService,
      staff_id: appt.staff_id,
      date: new Date(appt.starts_at),
      time: format(new Date(appt.starts_at), "HH:mm"),
      status: appt.status,
      // Reuse the cancellation_notes / treatment_summary for the textarea
      // depending on the new status. Default to cancellation_notes since
      // that's the most common reason to be editing here.
      notes: appt.cancellation_notes || appt.treatment_summary || "",
    });
    setShowEditAppt(true);
  };

  const updateAppointment = async () => {
    if (
      !selectedAppt ||
      !apptForm.service_id ||
      !apptForm.staff_id ||
      !apptForm.date ||
      !apptForm.time
    ) {
      toast.error("Please fill in all fields");
      return;
    }
    setUpdatingAppt(true);

    const service = services.find((s) => s.id === apptForm.service_id);
    if (!service) {
      setUpdatingAppt(false);
      return;
    }

    const [hours, minutes] = apptForm.time.split(":");
    const startsAt = new Date(apptForm.date);
    startsAt.setHours(parseInt(hours), parseInt(minutes), 0);
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + service.duration_minutes);

    const previousStatus = selectedAppt.status;
    const originalTime = new Date(selectedAppt.starts_at);
    const previousServiceId = selectedAppt.services?.[0]?.service_id ?? null;
    const hasDateTimeChanged =
      startsAt.getTime() !== originalTime.getTime() ||
      apptForm.staff_id !== selectedAppt.staff?.id;
    const hasServiceChanged = apptForm.service_id !== previousServiceId;

    const isCancelling = apptForm.status === "CANCELLED";
    const isCompleting = apptForm.status === "COMPLETED";

    const updates: Record<string, any> = {
      staff_id: apptForm.staff_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: apptForm.status,
      cancellation_notes: isCancelling ? apptForm.notes || null : null,
      treatment_summary: isCompleting ? apptForm.notes || null : selectedAppt.treatment_summary,
    };

    const { error } = await supabase.from("appointment").update(updates).eq("id", selectedAppt.id);

    if (error) {
      toast.error("Failed to update appointment");
      setUpdatingAppt(false);
      return;
    }

    // Swap the appointment_service rows if the user changed the service.
    // Order matters: insert the new row FIRST, then delete the old ones
    // by their explicit row IDs. The previous delete-then-insert pattern
    // could leave the appointment with zero services if the insert
    // failed (e.g. missing practice_id, RLS) — and the failure was
    // silent because neither result was checked. Same fix shape as
    // Calendar.tsx's edit-in-place save.
    if (hasServiceChanged) {
      const practiceId = patient?.practice_id;
      if (!practiceId) {
        toast.error("Couldn't update service — practice context missing. Refresh and try again.");
        setUpdatingAppt(false);
        return;
      }
      const previousServiceRowIds =
        selectedAppt.services?.map((s) => s.id).filter(Boolean) ?? [];

      const { error: insertErr } = await supabase
        .from("appointment_service")
        .insert({
          appointment_id: selectedAppt.id,
          service_id: service.id,
          practice_id: practiceId,
          // -1 so the new row becomes primary even before cleanup runs.
          display_order: -1,
          duration_minutes_snapshot: service.duration_minutes,
          price_pence_snapshot: service.price_pence ?? null,
        });
      if (insertErr) {
        logger.error("Failed to attach new service", insertErr);
        toast.error(`Failed to update service: ${insertErr.message}`);
        setUpdatingAppt(false);
        return;
      }

      if (previousServiceRowIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from("appointment_service")
          .delete()
          .in("id", previousServiceRowIds);
        if (deleteErr) {
          // Soft-fail: new row attached, old one orphaned. The
          // appointment is still bookable; just surface for cleanup.
          logger.warn("New service attached but previous link not cleaned up", deleteErr);
        }
      }
    }

    if (apptForm.status === "CANCELLED" && previousStatus !== "CANCELLED") {
      await sendAppointmentCancelledNotification(id!, selectedAppt.id, apptForm.notes);
    } else if (
      apptForm.status === "SCHEDULED" &&
      previousStatus === "SCHEDULED" &&
      hasDateTimeChanged
    ) {
      await sendAppointmentRescheduledNotification(
        id!,
        selectedAppt.id,
        format(originalTime, "EEEE, d MMMM yyyy"),
        format(originalTime, "HH:mm"),
        format(startsAt, "EEEE, d MMMM yyyy"),
        format(startsAt, "HH:mm"),
      );
    }

    toast.success("Appointment updated");
    setShowEditAppt(false);
    loadAppointments();
    loadPatient();
    setUpdatingAppt(false);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loading || loadingPatient) {
    return (
      <Layout title="Patient Details">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!patient) {
    return (
      <Layout title="Patient Details">
        <p className="text-muted-foreground py-12 text-center">Patient not found</p>
      </Layout>
    );
  }

  const age = calculateAge(patient.dob);
  const upcomingAppts = appointments.filter((a) => !isPast(new Date(a.starts_at)));
  const pastAppts = appointments.filter((a) => isPast(new Date(a.starts_at)));

  return (
    <Layout title="Patient Details" onBack={() => navigate(-1)}>
      <div className="space-y-4">
        {/* Permanent header. Identity + alerts + at-a-glance facts stay
            visible regardless of which tab is active so safety-critical
            info (medical alerts, no-show count, NHS number) is never
            buried behind a click. */}
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="grid md:grid-cols-[1fr_auto] gap-6 p-5">
            {/* LEFT: identity + contact. The visual anchor of the page —
                avatar gives a quick recognition cue, name dominates, key
                identity chips form a clear sub-line. */}
            <div className="flex gap-4 min-w-0">
              <div className="shrink-0 h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold">
                {getInitials(patient.full_name)}
              </div>
              <div className="min-w-0 space-y-1.5">
                <div>
                  <h2 className="text-2xl font-semibold leading-tight">
                    {patient.title && (
                      <span className="text-muted-foreground font-normal mr-1.5">
                        {patient.title}
                      </span>
                    )}
                    {patient.full_name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {patient.patient_number != null && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        P{String(patient.patient_number).padStart(5, "0")}
                      </span>
                    )}
                    {patient.registration_status && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {patient.registration_status.toLowerCase()}
                      </span>
                    )}
                    {noShowCount >= 1 && (
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                          noShowCount >= 3
                            ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
                        )}
                      >
                        {noShowCount} no-show{noShowCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>

                {(patient.phone || patient.email) && (
                  <div className="flex flex-col gap-0.5 text-sm">
                    {patient.phone && (
                      <a
                        href={`tel:${patient.phone}`}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 w-fit"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {patient.phone}
                      </a>
                    )}
                    {patient.email && (
                      <a
                        href={`mailto:${patient.email}`}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 w-fit truncate"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{patient.email}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: clinical facts panel + edit button. Right-aligned key/
                value rows so values line up vertically — much easier to
                scan than an inline list. */}
            <div className="flex flex-col items-end gap-3 md:min-w-[260px]">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/kiosk/consents/${id}`)}
                  title="Open kiosk mode — hand the iPad to the patient to sign pending consents"
                >
                  <Tablet className="h-4 w-4 mr-1" /> Kiosk
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDsarExport}
                    disabled={exportingDsar || !patient}
                    title="GDPR data subject access — exports everything we hold for this patient"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {exportingDsar ? "Exporting…" : "DSAR"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={openEditPatient}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              </div>

              {/* Retention status row — quietly informative. Only shows the
                  pill when something interesting is true; an everyday active
                  patient sees nothing extra here. */}
              {(patient.legal_hold || retentionEligible) && (
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {patient.legal_hold && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-100 text-purple-700"
                      title={patient.legal_hold_reason ?? "Legal hold — blocks retention purge"}
                    >
                      Legal hold
                    </span>
                  )}
                  {retentionEligible && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                      title="Past retention window — eligible for GDPR anonymisation"
                    >
                      Retention eligible
                    </span>
                  )}
                </div>
              )}
              {isAdmin && (
                <button
                  onClick={toggleLegalHold}
                  disabled={togglingHold}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  {patient.legal_hold ? "Remove legal hold" : "Apply legal hold"}
                </button>
              )}
              <div className="w-full md:w-[260px] divide-y divide-border/50">
                <div className="pb-1.5">
                  <Fact
                    label="DOB"
                    value={
                      patient.dob
                        ? `${format(parseISO(patient.dob), "d MMM yyyy")}${
                            age ? ` · ${age}y` : ""
                          }`
                        : null
                    }
                  />
                </div>
                <div className="py-1.5">
                  <Fact label="NHS no." value={patient.nhs_number} />
                </div>
                <div className="py-1.5">
                  <Fact
                    label="Last visit"
                    value={
                      patient.last_visited_at
                        ? format(new Date(patient.last_visited_at), "d MMM yyyy")
                        : null
                    }
                  />
                </div>
                <div className="pt-1.5">
                  <Fact
                    label="Next recall"
                    value={
                      patient.next_recall_date
                        ? format(parseISO(patient.next_recall_date), "d MMM yyyy")
                        : null
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Alerts band: visually distinct from the identity panel above.
              Only renders when there are active alerts, so private patients
              with no flags don't get an empty bar. */}
          {alerts.length > 0 && (
            <div className="border-t bg-amber-50/50 dark:bg-amber-950/10 px-5 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                Alerts
              </span>
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium border rounded-md px-2 py-1",
                    a.severity === "CRITICAL"
                      ? "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900"
                      : a.severity === "HIGH"
                      ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900"
                      : "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900",
                  )}
                  title={a.detail ?? undefined}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {a.title}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabbed content. URL state is intentionally NOT synced — most
            tab visits are short-lived and we want the default view ("Overview")
            on every fresh navigation to the patient. */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="clinical">Clinical</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          {/* Overview — daily-use stuff. Reception's primary tab. */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="bg-card rounded-lg border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  Appointments
                  {appointments.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({appointments.length})
                    </span>
                  )}
                </h3>
                <Button variant="ghost" size="sm" onClick={bookAppointment}>
                  <Plus className="h-4 w-4 mr-1" /> Book
                </Button>
              </div>
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {upcomingAppts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                      Upcoming
                    </h4>
                    <div className="space-y-1.5">
                      {upcomingAppts.map((appt) => (
                        <AppointmentRow
                          key={appt.id}
                          appt={appt}
                          onClick={() => openEditAppt(appt)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {pastAppts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Past
                    </h4>
                    <div className="space-y-1.5">
                      {pastAppts.map((appt) => (
                        <AppointmentRow
                          key={appt.id}
                          appt={appt}
                          onClick={() => openEditAppt(appt)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {appointments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No appointments
                  </p>
                )}
              </div>
            </div>

            {/* Waitlist — entries from waiting_list. Active rows show
                priority + preferred time of day; resolved rows render
                muted with a status pill so reception sees the history. */}
            {waitlist.length > 0 && (
              <div className="bg-card rounded-lg border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <ListPlus className="h-4 w-4 text-muted-foreground" />
                    Waitlist
                    <span className="text-muted-foreground font-normal">
                      ({waitlist.filter((w) => w.is_active).length} active)
                    </span>
                  </h3>
                </div>

                <div className="space-y-1.5">
                  {waitlist.map((entry) => {
                    const isActive =
                      entry.is_active &&
                      !entry.fulfilled_at &&
                      !entry.cancelled_at;
                    const status = entry.fulfilled_at
                      ? "Booked"
                      : entry.cancelled_at
                        ? "Removed"
                        : !entry.is_active
                          ? "Inactive"
                          : null;
                    const serviceName =
                      entry.service?.name ?? entry.service_text ?? "—";
                    const timeLabel = entry.preferred_time_of_day
                      ? WAITLIST_TIME_LABELS[entry.preferred_time_of_day]
                      : null;
                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "flex items-start gap-3 rounded-md border p-3",
                          !isActive && "opacity-60",
                        )}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">
                              {serviceName}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border",
                                WAITLIST_PRIORITY_STYLES[entry.priority],
                              )}
                            >
                              {entry.priority}
                            </span>
                            {status && (
                              <span className="text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                {status}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {timeLabel && <span>Prefers {timeLabel}</span>}
                            <span>
                              Added{" "}
                              {format(new Date(entry.created_at), "d MMM yyyy")}
                            </span>
                            {entry.service?.duration_minutes && (
                              <span>{entry.service.duration_minutes} min</span>
                            )}
                          </div>
                          {entry.notes && (
                            <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">
                              {entry.notes}
                            </p>
                          )}
                        </div>

                        {isActive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFromWaitlist(entry.id)}
                            className="h-8 px-2 text-muted-foreground hover:text-red-600"
                            title="Remove from waitlist"
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-card rounded-lg border p-5 space-y-3">
              <h3 className="font-semibold text-sm">Notes</h3>

              {notes.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-muted rounded-md p-3 space-y-1.5">
                      <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{note.author?.full_name ?? "—"}</span>
                        <span>{format(new Date(note.created_at), "d MMM yyyy, HH:mm")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Textarea
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={2}
                />
                <Button onClick={addNote} size="sm" disabled={!newNote.trim()}>
                  Add Note
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Clinical — dentist's primary tab. */}
          <TabsContent value="clinical" className="space-y-4 mt-4">
            <MedicalAlertsSection patientId={id!} onChange={loadAlerts} />
            <MedicalHistorySection patientId={id!} />
            <ConsentRecordsSection patientId={id!} />
            <PrescriptionsSection patientId={id!} />
            <TreatmentPlansSection patientId={id!} />
            <ReferralsSection patientId={id!} />
          </TabsContent>

          <TabsContent value="documents" className="space-y-4 mt-4">
            <DocumentsSection patientId={id!} />
          </TabsContent>

          <TabsContent value="financial" className="space-y-4 mt-4">
            <NHSClaimsSection patientId={id!} hasNhsNumber={!!patient.nhs_number} />
          </TabsContent>

          {/* Profile — the lower-traffic identity stuff. Address,
              emergency contact, marketing consent. */}
          <TabsContent value="profile" className="space-y-4 mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-card rounded-lg border p-5 space-y-2">
                <h3 className="font-semibold text-sm">Address</h3>
                {patient.address_line1 || patient.city || patient.postcode ? (
                  <p className="text-sm">
                    {[
                      patient.address_line1,
                      patient.address_line2,
                      patient.city,
                      patient.postcode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not on record</p>
                )}
              </div>

              <div className="bg-card rounded-lg border p-5 space-y-2">
                <h3 className="font-semibold text-sm">Emergency contact</h3>
                {patient.emergency_contact_name ? (
                  <div className="text-sm">
                    <div className="font-medium">{patient.emergency_contact_name}</div>
                    {patient.emergency_contact_relation && (
                      <div className="text-muted-foreground">
                        {patient.emergency_contact_relation}
                      </div>
                    )}
                    {patient.emergency_contact_phone && (
                      <a
                        href={`tel:${patient.emergency_contact_phone}`}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5"
                      >
                        <Phone className="h-3.5 w-3.5" /> {patient.emergency_contact_phone}
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not on record</p>
                )}
              </div>

              <div className="bg-card rounded-lg border p-5 space-y-2 md:col-span-2">
                <h3 className="font-semibold text-sm">Marketing consent</h3>
                <p className="text-xs text-muted-foreground">
                  GDPR-recorded preferences. Edit via the patient edit panel.
                </p>
                <div className="divide-y divide-border/50">
                  <InfoRow
                    label="Email"
                    value={patient.marketing_consent_email ? "Yes" : "No"}
                  />
                  <InfoRow
                    label="SMS"
                    value={patient.marketing_consent_sms ? "Yes" : "No"}
                  />
                  <InfoRow
                    label="Post"
                    value={patient.marketing_consent_post ? "Yes" : "No"}
                  />
                  <InfoRow
                    label="Recorded"
                    value={
                      patient.marketing_consent_recorded_at
                        ? format(
                            new Date(patient.marketing_consent_recorded_at),
                            "d MMM yyyy",
                          )
                        : null
                    }
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Patient Sheet */}
      <Sheet open={showEditPatient} onOpenChange={setShowEditPatient}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Patient</SheetTitle>
            <SheetDescription className="sr-only">
              Update patient personal and contact details
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Personal Details</h4>
              <div className="grid grid-cols-4 gap-3">
                <Field label="Title" className="col-span-1">
                  <Select
                    value={editForm.title || ""}
                    onValueChange={(v) => updateField("title", v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_TITLES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="First name" className="col-span-3">
                  <Input
                    value={editForm.first_name || ""}
                    onChange={(e) => updateField("first_name", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Last name">
                <Input
                  value={editForm.last_name || ""}
                  onChange={(e) => updateField("last_name", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input
                    value={editForm.phone || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={editForm.email || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of birth">
                  <Input
                    type="date"
                    value={editForm.dob || ""}
                    onChange={(e) => updateField("dob", e.target.value)}
                  />
                </Field>
                <Field label="NHS number">
                  <Input
                    value={editForm.nhs_number || ""}
                    onChange={(e) => updateField("nhs_number", e.target.value)}
                    placeholder="10 digits, e.g. 4857773456"
                  />
                </Field>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Address</h4>
              <Field label="Address line 1">
                <Input
                  value={editForm.address_line1 || ""}
                  onChange={(e) => updateField("address_line1", e.target.value)}
                />
              </Field>
              <Field label="Address line 2">
                <Input
                  value={editForm.address_line2 || ""}
                  onChange={(e) => updateField("address_line2", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <Input
                    value={editForm.city || ""}
                    onChange={(e) => updateField("city", e.target.value)}
                  />
                </Field>
                <Field label="Postcode">
                  <Input
                    value={editForm.postcode || ""}
                    onChange={(e) => updateField("postcode", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Emergency Contact</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input
                    value={editForm.emergency_contact_name || ""}
                    onChange={(e) => updateField("emergency_contact_name", e.target.value)}
                  />
                </Field>
                <Field label="Relationship">
                  <Input
                    value={editForm.emergency_contact_relation || ""}
                    onChange={(e) => updateField("emergency_contact_relation", e.target.value)}
                    placeholder="e.g. Spouse"
                  />
                </Field>
              </div>
              <Field label="Phone">
                <Input
                  value={editForm.emergency_contact_phone || ""}
                  onChange={(e) => updateField("emergency_contact_phone", e.target.value)}
                />
              </Field>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Marketing Consent</h4>
              <p className="text-xs text-muted-foreground">
                GDPR-recorded preferences for marketing channels. The patient must opt in.
              </p>
              <div className="space-y-3">
                <ConsentRow
                  label="Email"
                  value={editForm.marketing_consent_email ?? false}
                  onChange={(v) => updateField("marketing_consent_email", v)}
                />
                <ConsentRow
                  label="SMS"
                  value={editForm.marketing_consent_sms ?? false}
                  onChange={(v) => updateField("marketing_consent_sms", v)}
                />
                <ConsentRow
                  label="Post"
                  value={editForm.marketing_consent_post ?? false}
                  onChange={(v) => updateField("marketing_consent_post", v)}
                />
              </div>
            </div>

            {(hasPregnancyAlert || hasAnticoagulantAlert) && (
              <>
                <Separator />
                <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  Medical flags (pregnancy, anticoagulants, etc) are managed via the
                  Medical History section on the patient page, not here. They live as
                  banner-prominent <code className="px-1 rounded bg-muted">medical_alert</code> rows.
                </div>
              </>
            )}

            <Button onClick={savePatient} disabled={savingPatient} className="w-full">
              {savingPatient ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Appointment Sheet */}
      <Sheet open={showEditAppt} onOpenChange={setShowEditAppt}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Appointment</SheetTitle>
            <SheetDescription className="sr-only">Update appointment details</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <Field label="Service">
              <Select
                value={apptForm.service_id || ""}
                onValueChange={(v) => setApptForm((p) => ({ ...p, service_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Switching service replaces all attached services with this one. Use the
                calendar to assemble multi-service visits.
              </p>
            </Field>

            <Field label="Staff member">
              <Select
                value={apptForm.staff_id || ""}
                onValueChange={(v) => setApptForm((p) => ({ ...p, staff_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !apptForm.date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {apptForm.date ? format(apptForm.date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={apptForm.date}
                    onSelect={(d) => setApptForm((p) => ({ ...p, date: d }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Time">
              <Select
                value={apptForm.time || ""}
                onValueChange={(v) => setApptForm((p) => ({ ...p, time: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 40 }, (_, i) => {
                    const h = Math.floor(i / 4) + 8;
                    const m = (i % 4) * 15;
                    if (h >= 18) return null;
                    const t = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
                    return (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status">
              <Select
                value={apptForm.status || "SCHEDULED"}
                onValueChange={(v) => setApptForm((p) => ({ ...p, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="NO_SHOW">No-Show</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={
                apptForm.status === "CANCELLED"
                  ? "Cancellation notes"
                  : apptForm.status === "COMPLETED"
                  ? "Treatment summary"
                  : "Notes"
              }
            >
              <Textarea
                placeholder={
                  apptForm.status === "CANCELLED"
                    ? "Reason for cancellation..."
                    : apptForm.status === "COMPLETED"
                    ? "Clinical summary of what was done..."
                    : "Add notes..."
                }
                value={apptForm.notes || ""}
                onChange={(e) => setApptForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
              />
            </Field>

            <Button onClick={updateAppointment} disabled={updatingAppt} className="w-full">
              {updatingAppt ? "Updating..." : "Update Appointment"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Layout>
  );
}

function AppointmentRow({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  const services = appt.services?.map((s) => s.service?.name).filter(Boolean) ?? [];
  const isAnyNhs = appt.services?.some((s) => s.service?.is_nhs) ?? false;
  const totalPence = (appt.services ?? []).reduce(
    (sum, s) => sum + (s.price_pence_snapshot ?? 0),
    0,
  );

  return (
    <button
      onClick={onClick}
      className="w-full border rounded-md p-3 text-sm hover:bg-muted/50 transition-colors text-left"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {format(new Date(appt.starts_at), "EEE d MMM")} at{" "}
          {formatTime(format(new Date(appt.starts_at), "HH:mm"))}
        </span>
        <Badge variant={getAppointmentBadgeVariant(appt.status)}>{appt.status}</Badge>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5 flex-wrap">
        <span>
          {appt.staff?.full_name} — {services.length > 0 ? services.join(", ") : "General"}
        </span>
        {isAnyNhs && (
          <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 font-medium">
            NHS
          </span>
        )}
        {totalPence > 0 && <span className="text-xs">· {formatPrice(totalPence)}</span>}
      </div>
      {appt.status === "COMPLETED" && appt.treatment_summary && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{appt.treatment_summary}</p>
      )}
      {appt.status === "CANCELLED" && (appt.cancellation_reason || appt.cancellation_notes) && (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {appt.cancellation_reason && (
            <span className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
              {formatCancellationReason(appt.cancellation_reason)}
            </span>
          )}
          {appt.cancellation_notes && (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {appt.cancellation_notes}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function ConsentRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm">{label}</p>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

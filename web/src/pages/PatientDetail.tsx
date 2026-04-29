import { useEffect, useState } from "react";
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
import { format, isPast, differenceInYears, parseISO } from "date-fns";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  CalendarIcon, Pencil, AlertTriangle, Phone, Mail, Shield, Heart, User, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { formatTime } from "@/lib/timeUtils";
import { MedicalHistorySection } from "@/components/patient/MedicalHistorySection";
import { TreatmentPlansSection } from "@/components/patient/TreatmentPlansSection";
import { ReferralsSection } from "@/components/patient/ReferralsSection";
import { DocumentsSection } from "@/components/patient/DocumentsSection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function calculateAge(dob: string | null): string | null {
  if (!dob) return null;
  try {
    return `${differenceInYears(new Date(), parseISO(dob))}`;
  } catch {
    return null;
  }
}

function InfoRow({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  if (!value) return null;
  return (
    <div className={cn("flex justify-between gap-4 py-1.5", className)}>
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-3 pb-1">
      {children}
    </h4>
  );
}

// ---------------------------------------------------------------------------
// Form field helper
// ---------------------------------------------------------------------------
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PatientDetail() {
  const { id } = useParams();
  const { loading, user } = useRequireAuth();
  const { sendAppointmentCancelledNotification, sendAppointmentRescheduledNotification } = useNotifications();
  const navigate = useNavigate();

  // Patient
  const [patient, setPatient] = useState<any>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [savingPatient, setSavingPatient] = useState(false);

  // Appointments
  const [appointments, setAppointments] = useState<any[]>([]);
  const [showEditAppt, setShowEditAppt] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<any>(null);
  const [apptForm, setApptForm] = useState<Record<string, any>>({});
  const [updatingAppt, setUpdatingAppt] = useState(false);

  // Notes
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");

  // Lookups
  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!loading && id) {
      loadPatient();
      loadAppointments();
      loadNotes();
      loadServices();
      loadStaff();
    }
  }, [loading, id]);

  const loadPatient = async () => {
    const { data, error } = await supabase.from("patient").select("*").eq("id", id).single();
    if (!error && data) setPatient(data);
    setLoadingPatient(false);
  };

  const loadAppointments = async () => {
    const { data } = await supabase
      .from("appointment")
      .select("*, staff:staff_id(id, full_name), service:service_id(id, name, duration_minutes, is_nhs)")
      .eq("patient_id", id)
      .order("starts_at", { ascending: false });
    if (data) setAppointments(data);
  };

  const loadNotes = async () => {
    const { data } = await supabase
      .from("note")
      .select("*, staff:staff_id(full_name)")
      .eq("entity_type", "patient")
      .eq("entity_id", id)
      .order("created_at", { ascending: false });
    if (data) setNotes(data);
  };

  const loadServices = async () => {
    const { data } = await supabase.from("services").select("*").eq("active", true).is("deleted_at", null).order("name");
    if (data) setServices(data);
  };

  const loadStaff = async () => {
    const { data } = await supabase.from("app_staff").select("*").eq("active", true).is("deleted_at", null).order("full_name");
    if (data) setStaff(data);
  };

  const bookAppointment = () => {
    navigate("/calendar", {
      state: { openNewAppointment: true, prefilledPatientId: id },
    });
  };

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
        full_name: editForm.full_name,
        phone: editForm.phone,
        email: editForm.email || null,
        notes: editForm.notes || null,
        date_of_birth: editForm.date_of_birth || null,
        title: editForm.title || null,
        nhs_number: editForm.nhs_number || null,
        address_line1: editForm.address_line1 || null,
        address_line2: editForm.address_line2 || null,
        city: editForm.city || null,
        postcode: editForm.postcode || null,
        emergency_contact_name: editForm.emergency_contact_name || null,
        emergency_contact_phone: editForm.emergency_contact_phone || null,
        emergency_contact_relation: editForm.emergency_contact_relation || null,
        preferred_contact_method: editForm.preferred_contact_method || null,
        is_pregnant: editForm.is_pregnant ?? null,
        takes_anticoagulant: editForm.takes_anticoagulant ?? null,
        do_not_contact: editForm.do_not_contact ?? false,
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
    if (!newNote.trim()) return;
    const { data: staffData } = await supabase.from("app_staff").select("id").eq("user_id", user?.id).single();
    if (!staffData) return;

    const { error } = await supabase.from("note").insert({
      entity_type: "patient",
      entity_id: id!,
      staff_id: staffData.id,
      body: newNote,
    });

    if (error) { toast.error("Failed to add note"); }
    else { setNewNote(""); loadNotes(); }
  };

  // -------------------------------------------------------------------------
  // Appointment edit
  // -------------------------------------------------------------------------
  const openEditAppt = (appt: any) => {
    setSelectedAppt(appt);
    setApptForm({
      service_id: appt.service_id,
      staff_id: appt.staff_id,
      date: new Date(appt.starts_at),
      time: format(new Date(appt.starts_at), "HH:mm"),
      status: appt.status,
      notes: appt.notes || "",
    });
    setShowEditAppt(true);
  };

  const updateAppointment = async () => {
    if (!selectedAppt || !apptForm.service_id || !apptForm.staff_id || !apptForm.date || !apptForm.time) {
      toast.error("Please fill in all fields"); return;
    }
    setUpdatingAppt(true);

    const service = services.find((s) => s.id === apptForm.service_id);
    if (!service) return;

    const [hours, minutes] = apptForm.time.split(":");
    const startsAt = new Date(apptForm.date);
    startsAt.setHours(parseInt(hours), parseInt(minutes), 0);
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + service.duration_minutes);

    const previousStatus = selectedAppt.status;
    const originalTime = new Date(selectedAppt.starts_at);
    const hasDateTimeChanged = startsAt.getTime() !== originalTime.getTime() || apptForm.staff_id !== selectedAppt.staff?.id || apptForm.service_id !== selectedAppt.service?.id;

    const { error } = await supabase
      .from("appointment")
      .update({
        staff_id: apptForm.staff_id,
        service_id: apptForm.service_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: apptForm.status,
        notes: apptForm.notes || null,
      })
      .eq("id", selectedAppt.id);

    if (error) {
      toast.error("Failed to update appointment");
    } else {
      // no_show_count is maintained by trg_sync_patient_no_show_count

      // Notifications
      if (apptForm.status === "CANCELLED" && previousStatus !== "CANCELLED") {
        await sendAppointmentCancelledNotification(id!, selectedAppt.id, apptForm.notes);
      } else if (apptForm.status === "SCHEDULED" && previousStatus === "SCHEDULED" && hasDateTimeChanged) {
        await sendAppointmentRescheduledNotification(id!, selectedAppt.id, format(originalTime, "EEEE, d MMMM yyyy"), format(originalTime, "HH:mm"), format(startsAt, "EEEE, d MMMM yyyy"), format(startsAt, "HH:mm"));
      }

      toast.success("Appointment updated");
      setShowEditAppt(false);
      loadAppointments();
      loadPatient();
    }
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

  const age = calculateAge(patient.date_of_birth);
  const upcomingAppts = appointments.filter((a) => !isPast(new Date(a.starts_at)));
  const pastAppts = appointments.filter((a) => isPast(new Date(a.starts_at)));

  return (
    <Layout title="Patient Details" onBack={() => navigate(-1)}>
      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">

          {/* ---------------------------------------------------------------- */}
          {/* LEFT: Patient profile                                            */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-4">
            <div className="bg-card rounded-lg border p-5">

              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    {patient.title && <span className="text-muted-foreground font-normal">{patient.title}</span>}
                    {patient.full_name}
                  </h2>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    {patient.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {patient.phone}
                      </span>
                    )}
                    {patient.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {patient.email}
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={openEditPatient}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              </div>

              {/* Medical flags — prominent warning if set */}
              {(patient.is_pregnant || patient.takes_anticoagulant) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {patient.is_pregnant && (
                    <div className="flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-2.5 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Pregnant
                    </div>
                  )}
                  {patient.takes_anticoagulant && (
                    <div className="flex items-center gap-1.5 text-xs font-medium bg-red-50 text-red-800 border border-red-200 rounded-md px-2.5 py-1.5">
                      <Heart className="h-3.5 w-3.5" /> Takes anticoagulant
                    </div>
                  )}
                </div>
              )}

              {/* Key details */}
              <div className="divide-y divide-border/50">
                <InfoRow label="Date of birth" value={patient.date_of_birth ? `${format(parseISO(patient.date_of_birth), "d MMM yyyy")}${age ? ` (${age})` : ""}` : null} />
                <InfoRow label="NHS number" value={patient.nhs_number} />
                <InfoRow label="Preferred contact" value={patient.preferred_contact_method} />
                <InfoRow
                  label="No-shows"
                  value={String(patient.no_show_count ?? 0)}
                  className={patient.no_show_count >= 3 ? "text-red-600" : ""}
                />
                {patient.do_not_contact && (
                  <InfoRow label="Contact" value="Do not contact" className="text-red-600" />
                )}
              </div>

              {/* Address */}
              {(patient.address_line1 || patient.city || patient.postcode) && (
                <>
                  <SectionLabel>Address</SectionLabel>
                  <p className="text-sm">
                    {[patient.address_line1, patient.address_line2, patient.city, patient.postcode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </>
              )}

              {/* Emergency contact */}
              {patient.emergency_contact_name && (
                <>
                  <SectionLabel>Emergency Contact</SectionLabel>
                  <div className="text-sm">
                    <span className="font-medium">{patient.emergency_contact_name}</span>
                    {patient.emergency_contact_relation && (
                      <span className="text-muted-foreground"> ({patient.emergency_contact_relation})</span>
                    )}
                    {patient.emergency_contact_phone && (
                      <span className="text-muted-foreground"> — {patient.emergency_contact_phone}</span>
                    )}
                  </div>
                </>
              )}

              {/* Consent */}
              {(patient.gdpr_consent_at || patient.marketing_consent_at) && (
                <>
                  <SectionLabel>Consent</SectionLabel>
                  <div className="divide-y divide-border/50">
                    <InfoRow label="GDPR consent" value={patient.gdpr_consent_at ? format(new Date(patient.gdpr_consent_at), "d MMM yyyy") : null} />
                    <InfoRow label="Marketing consent" value={patient.marketing_consent_at ? format(new Date(patient.marketing_consent_at), "d MMM yyyy") : null} />
                  </div>
                </>
              )}

              {/* Recall info */}
              {(patient.next_recall_date || patient.last_visited_at) && (
                <>
                  <SectionLabel>Recall</SectionLabel>
                  <div className="divide-y divide-border/50">
                    <InfoRow label="Next recall" value={patient.next_recall_date ? format(parseISO(patient.next_recall_date), "d MMM yyyy") : null} />
                    <InfoRow label="Last visited" value={patient.last_visited_at ? format(new Date(patient.last_visited_at), "d MMM yyyy") : null} />
                  </div>
                </>
              )}

              {/* Patient notes (from the record, not the notes entity) */}
              {patient.notes && (
                <>
                  <SectionLabel>General Notes</SectionLabel>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{patient.notes}</p>
                </>
              )}
            </div>

            {/* Medical History */}
            <MedicalHistorySection patientId={id!} />

            {/* Documents */}
            <DocumentsSection patientId={id!} />

            {/* Notes card */}
            <div className="bg-card rounded-lg border p-5 space-y-3">
              <h3 className="font-semibold text-sm">Notes</h3>

              {notes.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-muted rounded-md p-3 space-y-1.5">
                      <p className="text-sm">{note.body}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{note.staff?.full_name}</span>
                        <span>{format(new Date(note.created_at), "d MMM yyyy, HH:mm")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Textarea placeholder="Add a note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} />
                <Button onClick={addNote} size="sm" disabled={!newNote.trim()}>Add Note</Button>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* RIGHT: Appointments + Treatment Plans                             */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-4">

          <div className="bg-card rounded-lg border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                Appointments
                {appointments.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">({appointments.length})</span>
                )}
              </h3>
              <Button variant="ghost" size="sm" onClick={bookAppointment}>
                <Plus className="h-4 w-4 mr-1" /> Book
              </Button>
            </div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {upcomingAppts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Upcoming</h4>
                  <div className="space-y-1.5">
                    {upcomingAppts.map((appt) => (
                      <button key={appt.id} onClick={() => openEditAppt(appt)} className="w-full border rounded-md p-3 text-sm hover:bg-muted/50 transition-colors text-left">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{format(new Date(appt.starts_at), "EEE d MMM")} at {formatTime(format(new Date(appt.starts_at), "HH:mm"))}</span>
                          <Badge variant={getAppointmentBadgeVariant(appt.status)}>{appt.status}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
                          <span>{appt.staff?.full_name} — {appt.service?.name || "General"}</span>
                          {appt.service?.is_nhs && (
                            <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 font-medium">NHS</span>
                          )}
                          {appt.actual_price != null && (
                            <span className="text-xs">· £{Number(appt.actual_price).toFixed(2)}</span>
                          )}
                        </div>
                        {appt.status === "COMPLETED" && appt.treatment_summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{appt.treatment_summary}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pastAppts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Past</h4>
                  <div className="space-y-1.5">
                    {pastAppts.map((appt) => (
                      <button key={appt.id} onClick={() => openEditAppt(appt)} className="w-full border rounded-md p-3 text-sm hover:bg-muted/50 transition-colors text-left">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{format(new Date(appt.starts_at), "EEE d MMM")} at {formatTime(format(new Date(appt.starts_at), "HH:mm"))}</span>
                          <Badge variant={getAppointmentBadgeVariant(appt.status)}>{appt.status}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
                          <span>{appt.staff?.full_name} — {appt.service?.name || "General"}</span>
                          {appt.service?.is_nhs && (
                            <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 font-medium">NHS</span>
                          )}
                          {appt.actual_price != null && (
                            <span className="text-xs">· £{Number(appt.actual_price).toFixed(2)}</span>
                          )}
                        </div>
                        {appt.status === "COMPLETED" && appt.treatment_summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{appt.treatment_summary}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {appointments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No appointments</p>
              )}
            </div>
          </div>

          {/* Treatment Plans */}
          <TreatmentPlansSection patientId={id!} />

          {/* Referrals */}
          <ReferralsSection patientId={id!} />

          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* Edit Patient Sheet                                                   */}
      {/* =================================================================== */}
      <Sheet open={showEditPatient} onOpenChange={setShowEditPatient}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Patient</SheetTitle>
            <SheetDescription className="sr-only">Update patient personal and clinical details</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Personal details */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Personal Details</h4>
              <div className="grid grid-cols-4 gap-3">
                <Field label="Title" className="col-span-1">
                  <Select value={editForm.title || ""} onValueChange={(v) => updateField("title", v || null)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {["Mr", "Mrs", "Ms", "Miss", "Dr", "Mx"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Full name" className="col-span-3">
                  <Input value={editForm.full_name || ""} onChange={(e) => updateField("full_name", e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input value={editForm.phone || ""} onChange={(e) => updateField("phone", e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={editForm.email || ""} onChange={(e) => updateField("email", e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of birth">
                  <Input type="date" value={editForm.date_of_birth || ""} onChange={(e) => updateField("date_of_birth", e.target.value)} />
                </Field>
                <Field label="NHS number">
                  <Input value={editForm.nhs_number || ""} onChange={(e) => updateField("nhs_number", e.target.value)} placeholder="e.g. 485 777 3456" />
                </Field>
              </div>
              <Field label="Preferred contact method">
                <Select value={editForm.preferred_contact_method || ""} onValueChange={(v) => updateField("preferred_contact_method", v || null)}>
                  <SelectTrigger><SelectValue placeholder="No preference" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Separator />

            {/* Address */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Address</h4>
              <Field label="Address line 1">
                <Input value={editForm.address_line1 || ""} onChange={(e) => updateField("address_line1", e.target.value)} />
              </Field>
              <Field label="Address line 2">
                <Input value={editForm.address_line2 || ""} onChange={(e) => updateField("address_line2", e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <Input value={editForm.city || ""} onChange={(e) => updateField("city", e.target.value)} />
                </Field>
                <Field label="Postcode">
                  <Input value={editForm.postcode || ""} onChange={(e) => updateField("postcode", e.target.value)} />
                </Field>
              </div>
            </div>

            <Separator />

            {/* Emergency contact */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Emergency Contact</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input value={editForm.emergency_contact_name || ""} onChange={(e) => updateField("emergency_contact_name", e.target.value)} />
                </Field>
                <Field label="Relationship">
                  <Input value={editForm.emergency_contact_relation || ""} onChange={(e) => updateField("emergency_contact_relation", e.target.value)} placeholder="e.g. Spouse" />
                </Field>
              </div>
              <Field label="Phone">
                <Input value={editForm.emergency_contact_phone || ""} onChange={(e) => updateField("emergency_contact_phone", e.target.value)} />
              </Field>
            </div>

            <Separator />

            {/* Medical flags */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Medical Flags</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Pregnant</p>
                    <p className="text-xs text-muted-foreground">Affects treatment planning and medication choices</p>
                  </div>
                  <Switch checked={editForm.is_pregnant ?? false} onCheckedChange={(v) => updateField("is_pregnant", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Takes anticoagulant</p>
                    <p className="text-xs text-muted-foreground">Warfarin, DOACs, etc. Affects surgical procedures</p>
                  </div>
                  <Switch checked={editForm.takes_anticoagulant ?? false} onCheckedChange={(v) => updateField("takes_anticoagulant", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Do not contact</p>
                    <p className="text-xs text-muted-foreground">Patient should not receive reminders or follow-ups</p>
                  </div>
                  <Switch checked={editForm.do_not_contact ?? false} onCheckedChange={(v) => updateField("do_not_contact", v)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* General notes */}
            <Field label="General notes">
              <Textarea value={editForm.notes || ""} onChange={(e) => updateField("notes", e.target.value)} rows={3} />
            </Field>

            <Button onClick={savePatient} disabled={savingPatient} className="w-full">
              {savingPatient ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* =================================================================== */}
      {/* Edit Appointment Sheet                                               */}
      {/* =================================================================== */}
      <Sheet open={showEditAppt} onOpenChange={setShowEditAppt}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Appointment</SheetTitle>
            <SheetDescription className="sr-only">Update appointment details</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <Field label="Service">
              <Select value={apptForm.service_id || ""} onValueChange={(v) => setApptForm((p) => ({ ...p, service_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Staff member">
              <Select value={apptForm.staff_id || ""} onValueChange={(v) => setApptForm((p) => ({ ...p, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !apptForm.date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {apptForm.date ? format(apptForm.date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={apptForm.date} onSelect={(d) => setApptForm((p) => ({ ...p, date: d }))} initialFocus />
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Time">
              <Select value={apptForm.time || ""} onValueChange={(v) => setApptForm((p) => ({ ...p, time: v }))}>
                <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 40 }, (_, i) => {
                    const h = Math.floor(i / 4) + 8;
                    const m = (i % 4) * 15;
                    if (h >= 18) return null;
                    const t = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
                    return <SelectItem key={t} value={t}>{t}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status">
              <Select value={apptForm.status || "SCHEDULED"} onValueChange={(v) => setApptForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="NO_SHOW">No-Show</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={apptForm.status === "CANCELLED" ? "Cancellation reason" : "Notes"}>
              <Textarea
                placeholder={apptForm.status === "CANCELLED" ? "Reason for cancellation..." : "Add notes..."}
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

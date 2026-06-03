import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  CalendarIcon,
  FileText,
  Send,
  Save,
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePractice } from "@/contexts/PracticeContext";
import { supabase } from "@/integrations/supabase/client";
import { PageLoading } from "@/components/PageLoading";
import {
  saveNhsClaim,
  findActivePerformerForStaff,
  findClaimForAppointment,
  type FP17FormType,
  type FP17TreatmentBand,
  type ClaimTreatmentDetails,
  type NHSClaimStatus,
} from "@/lib/createNhsClaim";
import {
  buildClaimActivities,
  activitiesToFriendly,
  genderToFp17Sex,
} from "@/lib/nhs/claimActivities";
import {
  validateFp17Claim,
  isClaimSubmittable,
  type ClaimForValidation,
  type ValidationFinding,
} from "@/lib/nhs/validateClaim";
import { useNhsReferenceData } from "@/hooks/useNhsReferenceData";
import type { Appointment } from "@/hooks/useAppointments";

// FP17 claim creation/edit. Drafts can be created from any completed NHS
// appointment; the same sheet edits an existing claim.
//
// Entry stays friendly (tick what you did); under the hood it compiles to the
// NHSBSA 9000-code activity-line model (nhs_claim_activity) and runs the
// pre-submission validator live, so the practice sees the exact issues Compass
// would otherwise return — before the claim can be marked ready to submit.

const FORM_TYPES: { value: FP17FormType; label: string; hint?: string }[] = [
  { value: "FP17", label: "FP17 (general dental services)" },
  { value: "FP17O", label: "FP17O (orthodontic)", hint: "ortho data set coming soon" },
  { value: "FP17W", label: "FP17W (Wales)", hint: "England rules only for now" },
  { value: "FP17PR", label: "FP17PR (prior approval)" },
];

type CourseType = "1" | "2" | "3" | "URGENT";
const COURSE_TYPES: { value: CourseType; label: string }[] = [
  { value: "1", label: "Band 1 — exam, diagnosis, prevention" },
  { value: "2", label: "Band 2 — fillings, extractions, endo" },
  { value: "3", label: "Band 3 — crowns, bridges, dentures" },
  { value: "URGENT", label: "Urgent treatment" },
];

const SIGNATURE_METHODS = [
  { value: "DIGITAL", label: "Digital" },
  { value: "IPAD", label: "iPad signature pad" },
  { value: "PAPER", label: "Paper" },
];

const EMPTY_TREATMENTS: ClaimTreatmentDetails = {
  examination: false,
  scale_and_polish: false,
  fluoride_varnish: false,
  fissure_sealants: false,
  fillings_count: 0,
  extractions_count: 0,
  endodontic_count: 0,
  crowns_count: 0,
  bridges_count: 0,
  dentures_count: 0,
  x_rays_taken: 0,
  periodontal_treatment: false,
  free_repair_or_replacement: false,
  antibiotic_items: 0,
  treated_tooth_numbers: null,
};

// Maps the stored (deprecated) band enum back to the friendly course type.
function bandToCourseType(band: string | null | undefined): CourseType {
  switch (band) {
    case "BAND_2":
      return "2";
    case "BAND_3":
      return "3";
    case "URGENT":
      return "URGENT";
    default:
      return "1"; // BAND_1, BAND_1_WITH_X_RAY and legacy values
  }
}

function courseToBand(course: CourseType): FP17TreatmentBand {
  return course === "URGENT"
    ? "URGENT"
    : course === "2"
    ? "BAND_2"
    : course === "3"
    ? "BAND_3"
    : "BAND_1";
}

interface PatientDetails {
  dob: string | null;
  gender: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  address_line1: string | null;
  address_line2: string | null;
}

interface NHSClaimSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  onSaved?: () => void;
}

interface ActivePerformer {
  id: string;
  performer_number: string;
  provider_number: string;
}

export function NHSClaimSheet({
  open,
  onOpenChange,
  appointment,
  onSaved,
}: NHSClaimSheetProps) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const navigate = useNavigate();
  const { data: referenceData } = useNhsReferenceData("ENGLAND");

  const [loading, setLoading] = useState(true);
  const [performer, setPerformer] = useState<ActivePerformer | null>(null);
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [existingClaimId, setExistingClaimId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<NHSClaimStatus | null>(null);

  const apptDateStr = format(new Date(appointment.starts_at), "yyyy-MM-dd");
  const completedDateStr =
    appointment.status === "COMPLETED"
      ? format(new Date(appointment.starts_at), "yyyy-MM-dd")
      : null;

  // Form state.
  const [formType, setFormType] = useState<FP17FormType>("FP17");
  const [courseType, setCourseType] = useState<CourseType>("1");
  const [acceptanceDate, setAcceptanceDate] = useState<Date | undefined>(parseISO(apptDateStr));
  const [completionDate, setCompletionDate] = useState<Date | undefined>(
    completedDateStr ? parseISO(completedDateStr) : undefined,
  );
  const [numberOfVisits, setNumberOfVisits] = useState(1);
  const [patientChargePounds, setPatientChargePounds] = useState("0");
  const [signatureReceived, setSignatureReceived] = useState(false);
  const [signatureMethod, setSignatureMethod] = useState<string>("DIGITAL");
  const [recallMonths, setRecallMonths] = useState<string>("");
  const [bpeScore, setBpeScore] = useState<string>("");
  const [untreatedDecayed, setUntreatedDecayed] = useState<string>("");
  const [treatments, setTreatments] = useState<ClaimTreatmentDetails>(EMPTY_TREATMENTS);
  const [saving, setSaving] = useState(false);

  const isExempt = appointment.nhs_exemption_category !== "NONE";

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const [perf, existing, patientRes] = await Promise.all([
      findActivePerformerForStaff(appointment.staff.id),
      findClaimForAppointment(appointment.id),
      supabase
        .from("patient")
        .select(
          "dob, gender, first_name, last_name, title, email, phone, postcode, address_line1, address_line2",
        )
        .eq("id", appointment.patient.id)
        .maybeSingle(),
    ]);
    setPerformer(perf);
    setPatientDetails((patientRes.data as PatientDetails | null) ?? null);

    if (existing) {
      const c = existing.claim;
      // Reconstruct the friendly form from the canonical activity lines.
      const friendly = activitiesToFriendly(existing.activities ?? []);
      setExistingClaimId(c.id);
      setExistingStatus(c.status as NHSClaimStatus);
      setFormType(c.form_type as FP17FormType);
      // Prefer the band encoded in the activity lines; fall back to the column.
      setCourseType(friendly.courseType ?? bandToCourseType(c.treatment_band));
      setAcceptanceDate(c.date_of_acceptance ? parseISO(c.date_of_acceptance) : undefined);
      setCompletionDate(c.date_of_completion ? parseISO(c.date_of_completion) : undefined);
      setNumberOfVisits(c.number_of_visits ?? 1);
      setPatientChargePounds(((c.patient_charge_pence ?? 0) / 100).toFixed(2));
      setSignatureReceived(!!c.patient_signature_received);
      setSignatureMethod(c.patient_signature_method ?? "DIGITAL");
      setRecallMonths(c.recall_interval_months ? String(c.recall_interval_months) : "");
      setBpeScore(friendly.bpeScore != null ? String(friendly.bpeScore) : "");
      setUntreatedDecayed(
        friendly.untreatedDecayedTeeth != null ? String(friendly.untreatedDecayedTeeth) : "",
      );
      setTreatments(friendly.treatments);
    } else {
      setExistingClaimId(null);
      setExistingStatus(null);
      setFormType("FP17");
      setCourseType("1");
      setAcceptanceDate(parseISO(apptDateStr));
      setCompletionDate(completedDateStr ? parseISO(completedDateStr) : undefined);
      setNumberOfVisits(1);
      setPatientChargePounds("0");
      setSignatureReceived(false);
      setSignatureMethod("DIGITAL");
      setRecallMonths("");
      setBpeScore("");
      setUntreatedDecayed("");
      setTreatments(EMPTY_TREATMENTS);
    }
    setLoading(false);
  }, [appointment.id, appointment.staff.id, appointment.patient.id, apptDateStr, completedDateStr]);

  useEffect(() => {
    if (open) void loadInitial();
  }, [open, loadInitial]);

  const updateTreatment = <K extends keyof ClaimTreatmentDetails>(
    key: K,
    value: ClaimTreatmentDetails[K],
  ) => setTreatments((prev) => ({ ...prev, [key]: value }));

  const bandNumber: 1 | 2 | 3 | null = courseType === "URGENT" ? null : (Number(courseType) as 1 | 2 | 3);
  const isUrgent = courseType === "URGENT";

  // Build the activity lines + validator input from current form state.
  const activities = useMemo(
    () =>
      buildClaimActivities({
        bandNumber,
        isUrgent,
        treatments,
        recallMonths: recallMonths ? Number(recallMonths) : null,
        bpeScore: bpeScore ? Number(bpeScore) : null,
        untreatedDecayedTeeth: untreatedDecayed ? Number(untreatedDecayed) : null,
      }),
    [bandNumber, isUrgent, treatments, recallMonths, bpeScore, untreatedDecayed],
  );

  const findings: ValidationFinding[] = useMemo(() => {
    if (!referenceData) return [];
    const input: ClaimForValidation = {
      formType,
      country: "ENGLAND",
      dateOfAcceptance: acceptanceDate ? format(acceptanceDate, "yyyy-MM-dd") : null,
      dateOfCompletion: completionDate ? format(completionDate, "yyyy-MM-dd") : null,
      patientDob: patientDetails?.dob ?? null,
      patientSex: genderToFp17Sex(patientDetails?.gender),
      patientSurname: patientDetails?.last_name ?? null,
      patientForename: patientDetails?.first_name ?? null,
      patientEmail: patientDetails?.email ?? null,
      patientMobile: patientDetails?.phone ?? null,
      exemptionCategory: appointment.nhs_exemption_category,
      patientChargePence: Math.round((parseFloat(patientChargePounds) || 0) * 100),
      recallIntervalMonths: recallMonths ? Number(recallMonths) : null,
      activities,
    };
    return validateFp17Claim(input, referenceData);
  }, [
    referenceData,
    formType,
    acceptanceDate,
    completionDate,
    patientDetails,
    appointment.nhs_exemption_category,
    patientChargePounds,
    recallMonths,
    activities,
  ]);

  const errors = findings.filter((f) => f.severity === "ERROR");
  const warnings = findings.filter((f) => f.severity === "WARNING");
  const submittable = isClaimSubmittable(findings);

  const submit = async (status: NHSClaimStatus) => {
    if (!performer) {
      toast.error("This staff member has no active NHS performer registration");
      return;
    }
    if (!acceptanceDate) {
      toast.error("Date of acceptance is required");
      return;
    }
    const pounds = parseFloat(patientChargePounds);
    if (Number.isNaN(pounds) || pounds < 0) {
      toast.error("Patient charge must be a positive number");
      return;
    }
    if (status === "READY_TO_SUBMIT" && !submittable) {
      toast.error("Resolve the validation errors before marking this claim ready");
      return;
    }

    setSaving(true);
    const result = await saveNhsClaim({
      practiceId,
      patientId: appointment.patient.id,
      appointmentId: appointment.id,
      performerId: performer.id,
      formType,
      treatmentBand: courseToBand(courseType),
      country: "ENGLAND",
      dateOfAcceptance: format(acceptanceDate, "yyyy-MM-dd"),
      dateOfCompletion: completionDate ? format(completionDate, "yyyy-MM-dd") : null,
      isUrgentTreatment: isUrgent,
      numberOfVisits,
      patientChargePence: Math.round(pounds * 100),
      exemptionCategory: appointment.nhs_exemption_category,
      exemptionEvidenceSeen: appointment.nhs_exemption_evidence_seen,
      patientSignatureReceived: signatureReceived,
      patientSignatureMethod: signatureReceived ? signatureMethod : null,
      recallIntervalMonths: recallMonths ? Number(recallMonths) : null,
      activities,
      snapshot: {
        nhsNumber: appointment.patient.nhs_number,
        title: patientDetails?.title ?? null,
        forename: patientDetails?.first_name ?? null,
        surname: patientDetails?.last_name ?? null,
        sex: genderToFp17Sex(patientDetails?.gender),
        dateOfBirth: patientDetails?.dob ?? null,
        addressLine1: patientDetails?.address_line1 ?? null,
        addressLine2: patientDetails?.address_line2 ?? null,
        addressLine3: null,
        postcode: patientDetails?.postcode ?? null,
        email: patientDetails?.email ?? null,
        mobile: patientDetails?.phone ?? null,
      },
      status,
      existingClaimId: existingClaimId ?? undefined,
    });
    setSaving(false);

    if (!result.success) {
      toast.error(result.error || "Failed to save claim");
      return;
    }
    const newClaimId = result.claimId;
    const isFirstSave = !existingClaimId;
    const successMessage =
      status === "READY_TO_SUBMIT"
        ? "Claim marked ready to submit"
        : existingClaimId
        ? "Claim updated"
        : "Draft claim saved";

    if (isFirstSave && newClaimId) {
      toast.success(successMessage, {
        action: {
          label: "View in claims",
          onClick: () => navigate(`/nhs-claims?claim=${newClaimId}`),
        },
      });
    } else {
      toast.success(successMessage);
    }
    onSaved?.();
    onOpenChange(false);
  };

  const isReadOnly = existingStatus
    ? !["DRAFT", "READY_TO_SUBMIT", "REJECTED"].includes(existingStatus)
    : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {existingClaimId ? "FP17 claim" : "New FP17 claim"}
          </SheetTitle>
          <SheetDescription>
            {appointment.patient.full_name}
            {" · "}
            {format(new Date(appointment.starts_at), "PPP")}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-6">
            <PageLoading variant="inline" label="Loading claim..." />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Performer + status badge row */}
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs">
                  <span className="text-muted-foreground">Performer</span>
                  <div className="font-mono text-sm">
                    {performer ? performer.performer_number : "—"}
                    {performer && (
                      <span className="text-muted-foreground ml-2">
                        Provider {performer.provider_number}
                      </span>
                    )}
                  </div>
                </div>
                {existingStatus && (
                  <span className="text-[10px] font-medium uppercase tracking-wide bg-muted px-2 py-1 rounded">
                    {existingStatus.replace(/_/g, " ").toLowerCase()}
                  </span>
                )}
              </div>

              {!performer && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200/60 bg-amber-50 dark:bg-amber-950/20 p-2 text-[11px] text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    {appointment.staff.full_name ?? "This clinician"} has no active
                    NHS performer registration. Add one on their staff detail page
                    before this claim can be saved.
                  </span>
                </div>
              )}
            </div>

            {/* Course of treatment */}
            <FormSection title="Course of treatment">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Form type">
                  <Select
                    value={formType}
                    onValueChange={(v) => setFormType(v as FP17FormType)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formType !== "FP17" && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                      Only FP17 (England) is fully validated today — other forms save
                      in DRAFT.
                    </p>
                  )}
                </Field>
                <Field label="Course / band">
                  <Select
                    value={courseType}
                    onValueChange={(v) => setCourseType(v as CourseType)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_TYPES.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of acceptance">
                  <DatePickerButton
                    value={acceptanceDate}
                    onChange={setAcceptanceDate}
                    disabled={isReadOnly}
                  />
                </Field>
                <Field label="Date of completion">
                  <DatePickerButton
                    value={completionDate}
                    onChange={setCompletionDate}
                    placeholder="Open"
                    disabledBefore={acceptanceDate}
                    disabled={isReadOnly}
                  />
                </Field>
              </div>

              <Field label="Number of visits">
                <Input
                  type="number"
                  min={1}
                  value={numberOfVisits}
                  onChange={(e) => setNumberOfVisits(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isReadOnly}
                />
              </Field>
            </FormSection>

            {/* Charges + signature */}
            <FormSection title="Patient charge">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Charge to patient (£)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={patientChargePounds}
                    onChange={(e) => setPatientChargePounds(e.target.value)}
                    disabled={isReadOnly}
                    placeholder={isExempt ? "0.00 (exempt)" : "e.g. 27.90"}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {isExempt
                      ? "Patient is recorded as exempt — typically £0.00."
                      : "The validator checks this against the current band charge."}
                  </p>
                </Field>
                <Field label="NICE recall (months)">
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={recallMonths}
                    onChange={(e) => setRecallMonths(e.target.value.replace(/[^0-9]/g, ""))}
                    disabled={isReadOnly}
                    placeholder="e.g. 6"
                  />
                </Field>
              </div>

              <label className="flex items-start gap-2 mt-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40 transition-colors">
                <Checkbox
                  checked={signatureReceived}
                  onCheckedChange={(v) => setSignatureReceived(!!v)}
                  disabled={isReadOnly}
                  className="mt-0.5"
                />
                <span className="text-xs flex-1">
                  <span className="font-medium block">Patient signature received</span>
                  <span className="text-muted-foreground">
                    Required before submitting to NHSBSA.
                  </span>
                </span>
              </label>

              {signatureReceived && (
                <Field label="Signature method">
                  <Select
                    value={signatureMethod}
                    onValueChange={setSignatureMethod}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIGNATURE_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </FormSection>

            {/* Treatment counts + flags */}
            <FormSection title="Treatments performed" icon={<Stethoscope className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <BoolField label="Examination" value={treatments.examination} onChange={(v) => updateTreatment("examination", v)} disabled={isReadOnly} />
                <BoolField label="Scale & polish" value={treatments.scale_and_polish} onChange={(v) => updateTreatment("scale_and_polish", v)} disabled={isReadOnly} />
                <BoolField label="Fluoride varnish" value={treatments.fluoride_varnish} onChange={(v) => updateTreatment("fluoride_varnish", v)} disabled={isReadOnly} />
                <BoolField label="Fissure sealants" value={treatments.fissure_sealants} onChange={(v) => updateTreatment("fissure_sealants", v)} disabled={isReadOnly} />
                <BoolField label="Periodontal" value={treatments.periodontal_treatment} onChange={(v) => updateTreatment("periodontal_treatment", v)} disabled={isReadOnly} />
                <BoolField label="Free repair" value={treatments.free_repair_or_replacement} onChange={(v) => updateTreatment("free_repair_or_replacement", v)} disabled={isReadOnly} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                <CountField label="Fillings" value={treatments.fillings_count} onChange={(v) => updateTreatment("fillings_count", v)} disabled={isReadOnly} />
                <CountField label="Extractions" value={treatments.extractions_count} onChange={(v) => updateTreatment("extractions_count", v)} disabled={isReadOnly} />
                <CountField label="Endodontic" value={treatments.endodontic_count} onChange={(v) => updateTreatment("endodontic_count", v)} disabled={isReadOnly} />
                <CountField label="Crowns" value={treatments.crowns_count} onChange={(v) => updateTreatment("crowns_count", v)} disabled={isReadOnly} />
                <CountField label="Bridges" value={treatments.bridges_count} onChange={(v) => updateTreatment("bridges_count", v)} disabled={isReadOnly} />
                <CountField label="Dentures" value={treatments.dentures_count} onChange={(v) => updateTreatment("dentures_count", v)} disabled={isReadOnly} />
                <CountField label="X-rays" value={treatments.x_rays_taken} onChange={(v) => updateTreatment("x_rays_taken", v)} disabled={isReadOnly} />
                <CountField label="Antibiotics" value={treatments.antibiotic_items} onChange={(v) => updateTreatment("antibiotic_items", v)} disabled={isReadOnly} />
              </div>
            </FormSection>

            {/* England NHS data set — mandatory items for adult banded claims */}
            <FormSection title="NHS data set (England)">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Highest BPE sextant score">
                  <Input
                    type="number"
                    min={0}
                    max={4}
                    value={bpeScore}
                    onChange={(e) => setBpeScore(e.target.value.replace(/[^0-9]/g, ""))}
                    disabled={isReadOnly}
                    placeholder="0–4"
                  />
                </Field>
                <Field label="Untreated decayed teeth">
                  <Input
                    type="number"
                    min={0}
                    value={untreatedDecayed}
                    onChange={(e) => setUntreatedDecayed(e.target.value.replace(/[^0-9]/g, ""))}
                    disabled={isReadOnly}
                    placeholder="e.g. 0"
                  />
                </Field>
              </div>
              <p className="text-[10px] text-muted-foreground">
                BPE (9378) and untreated decayed teeth (9379) are mandatory on adult
                Band 1/2/3 claims in England.
              </p>
            </FormSection>

            {/* Live validation panel */}
            <ValidationPanel errors={errors} warnings={warnings} loaded={!!referenceData} />

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-2 border-t">
              {isReadOnly && (
                <p className="text-xs text-muted-foreground">
                  This claim has been submitted — read-only. Use the claims
                  dashboard to track status.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => submit("DRAFT")}
                  disabled={saving || isReadOnly || !performer}
                  className="flex-1"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  Save draft
                </Button>
                <Button
                  onClick={() => submit("READY_TO_SUBMIT")}
                  disabled={
                    saving ||
                    isReadOnly ||
                    !performer ||
                    !signatureReceived ||
                    !submittable
                  }
                  className="flex-1"
                  title={
                    !submittable
                      ? "Resolve the validation errors first"
                      : !signatureReceived
                      ? "Patient signature required before marking ready"
                      : ""
                  }
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Mark ready to submit
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
function ValidationPanel({
  errors,
  warnings,
  loaded,
}: {
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
  loaded: boolean;
}) {
  if (!loaded) return null;

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200/70 bg-green-50 dark:bg-green-950/20 p-2.5 text-xs text-green-800 dark:text-green-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>No issues found — this claim passes the FP17 checks.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200/70 bg-red-50 dark:bg-red-950/20 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-200 mb-1.5">
            <XCircle className="h-4 w-4" />
            {errors.length} {errors.length === 1 ? "error" : "errors"} — must fix before submitting
          </div>
          <ul className="space-y-1">
            {errors.map((f, i) => (
              <li key={i} className="text-[11px] text-red-700 dark:text-red-300 flex gap-1.5">
                <span className="font-mono shrink-0 opacity-70">{f.code}</span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200/70 bg-amber-50 dark:bg-amber-950/20 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1.5">
            <Info className="h-4 w-4" />
            {warnings.length} {warnings.length === 1 ? "warning" : "warnings"} — review
          </div>
          <ul className="space-y-1">
            {warnings.map((f, i) => (
              <li key={i} className="text-[11px] text-amber-700 dark:text-amber-300 flex gap-1.5">
                <span className="font-mono shrink-0 opacity-70">{f.code}</span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
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
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function BoolField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40 transition-colors">
      <Checkbox
        checked={value}
        onCheckedChange={(v) => onChange(!!v)}
        disabled={disabled}
      />
      <span className="text-xs">{label}</span>
    </label>
  );
}

function CountField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        disabled={disabled}
        className="h-8"
      />
    </div>
  );
}

function DatePickerButton({
  value,
  onChange,
  placeholder,
  disabledBefore,
  disabled,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder?: string;
  disabledBefore?: Date;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : placeholder ?? "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          disabled={disabledBefore ? (d) => d < disabledBefore : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

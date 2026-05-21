import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { CalendarIcon, FileText, Send, Save, Stethoscope, AlertTriangle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
import { logger } from "@/lib/logger";
import { usePractice } from "@/contexts/PracticeContext";
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
import type { Appointment } from "@/hooks/useAppointments";

// FP17 claim creation/edit. Drafts can be created from any completed
// NHS appointment; the same sheet edits an existing claim. FP17O and
// FP17W extensions aren't wired up yet — picking them keeps you in DRAFT
// status and we surface a "coming soon" hint, so the dentist isn't
// blocked from logging the basics.

const FORM_TYPES: { value: FP17FormType; label: string; hint?: string }[] = [
  { value: "FP17", label: "FP17 (general dental services)" },
  { value: "FP17O", label: "FP17O (orthodontic)", hint: "IOTN fields coming soon" },
  { value: "FP17W", label: "FP17W (domiciliary)" },
  { value: "FP17PR", label: "FP17PR (prior approval)" },
];

const BANDS: { value: FP17TreatmentBand; label: string; hint?: string }[] = [
  { value: "BAND_1", label: "Band 1 — examination, diagnosis, x-rays" },
  { value: "BAND_1_WITH_X_RAY", label: "Band 1 with x-ray" },
  { value: "BAND_2", label: "Band 2 — fillings, extractions, root canals" },
  { value: "BAND_3", label: "Band 3 — crowns, bridges, dentures" },
  { value: "URGENT", label: "Urgent treatment" },
  { value: "PRESCRIPTION_ONLY", label: "Prescription only" },
  { value: "REPAIR_FREE", label: "Repair (free)" },
  { value: "DENTURE_REPAIR", label: "Denture repair" },
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

  const [loading, setLoading] = useState(true);
  const [performer, setPerformer] = useState<ActivePerformer | null>(null);
  const [existingClaimId, setExistingClaimId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<NHSClaimStatus | null>(null);

  const apptDateStr = format(new Date(appointment.starts_at), "yyyy-MM-dd");
  const completedDateStr = appointment.status === "COMPLETED"
    ? format(new Date(appointment.starts_at), "yyyy-MM-dd")
    : null;

  // Form state. Pre-fills from existing claim on edit; from defaults otherwise.
  const [formType, setFormType] = useState<FP17FormType>("FP17");
  const [band, setBand] = useState<FP17TreatmentBand>("BAND_1");
  const [acceptanceDate, setAcceptanceDate] = useState<Date | undefined>(
    parseISO(apptDateStr),
  );
  const [completionDate, setCompletionDate] = useState<Date | undefined>(
    completedDateStr ? parseISO(completedDateStr) : undefined,
  );
  const [isUrgent, setIsUrgent] = useState(false);
  const [numberOfVisits, setNumberOfVisits] = useState(1);
  const [patientChargePounds, setPatientChargePounds] = useState("0");
  const [signatureReceived, setSignatureReceived] = useState(false);
  const [signatureMethod, setSignatureMethod] = useState<string>("DIGITAL");
  const [recallMonths, setRecallMonths] = useState<string>("");
  const [treatments, setTreatments] = useState<ClaimTreatmentDetails>(EMPTY_TREATMENTS);
  const [teethInput, setTeethInput] = useState("");
  const [saving, setSaving] = useState(false);

  const isExempt = appointment.nhs_exemption_category !== "NONE";

  // Reset form to defaults / existing claim whenever the sheet opens.
  const loadInitial = useCallback(async () => {
    setLoading(true);
    const [perf, existing] = await Promise.all([
      findActivePerformerForStaff(appointment.staff.id),
      findClaimForAppointment(appointment.id),
    ]);
    setPerformer(perf);

    if (existing) {
      const c = existing.claim;
      const t = existing.treatment;
      setExistingClaimId(c.id);
      setExistingStatus(c.status as NHSClaimStatus);
      setFormType(c.form_type as FP17FormType);
      setBand((c.treatment_band as FP17TreatmentBand) ?? "BAND_1");
      setAcceptanceDate(c.date_of_acceptance ? parseISO(c.date_of_acceptance) : undefined);
      setCompletionDate(c.date_of_completion ? parseISO(c.date_of_completion) : undefined);
      setIsUrgent(!!c.is_urgent_treatment);
      setNumberOfVisits(c.number_of_visits ?? 1);
      setPatientChargePounds(((c.patient_charge_pence ?? 0) / 100).toFixed(2));
      setSignatureReceived(!!c.patient_signature_received);
      setSignatureMethod(c.patient_signature_method ?? "DIGITAL");
      setRecallMonths(c.recall_interval_months ? String(c.recall_interval_months) : "");
      if (t) {
        setTreatments({
          examination: !!t.examination,
          scale_and_polish: !!t.scale_and_polish,
          fluoride_varnish: !!t.fluoride_varnish,
          fissure_sealants: !!t.fissure_sealants,
          fillings_count: t.fillings_count ?? 0,
          extractions_count: t.extractions_count ?? 0,
          endodontic_count: t.endodontic_count ?? 0,
          crowns_count: t.crowns_count ?? 0,
          bridges_count: t.bridges_count ?? 0,
          dentures_count: t.dentures_count ?? 0,
          x_rays_taken: t.x_rays_taken ?? 0,
          periodontal_treatment: !!t.periodontal_treatment,
          free_repair_or_replacement: !!t.free_repair_or_replacement,
          antibiotic_items: t.antibiotic_items ?? 0,
          treated_tooth_numbers: t.treated_tooth_numbers ?? null,
        });
        setTeethInput((t.treated_tooth_numbers ?? []).join(", "));
      }
    } else {
      setExistingClaimId(null);
      setExistingStatus(null);
      setFormType("FP17");
      setBand("BAND_1");
      setAcceptanceDate(parseISO(apptDateStr));
      setCompletionDate(completedDateStr ? parseISO(completedDateStr) : undefined);
      setIsUrgent(false);
      setNumberOfVisits(1);
      setPatientChargePounds("0");
      setSignatureReceived(false);
      setSignatureMethod("DIGITAL");
      setRecallMonths("");
      setTreatments(EMPTY_TREATMENTS);
      setTeethInput("");
    }
    setLoading(false);
  }, [appointment.id, appointment.staff.id, apptDateStr, completedDateStr]);

  useEffect(() => {
    if (open) void loadInitial();
  }, [open, loadInitial]);

  const updateTreatment = <K extends keyof ClaimTreatmentDetails>(
    key: K,
    value: ClaimTreatmentDetails[K],
  ) => setTreatments((prev) => ({ ...prev, [key]: value }));

  const parsedTeeth = useMemo(() => {
    const trimmed = teethInput.trim();
    if (!trimmed) return [];
    const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
    const out: number[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isInteger(n) || n <= 0) return null;
      out.push(n);
    }
    return out;
  }, [teethInput]);

  const submit = async (status: NHSClaimStatus) => {
    if (!performer) {
      toast.error("This staff member has no active NHS performer registration");
      return;
    }
    if (!appointment.patient.nhs_number) {
      toast.error("Patient has no NHS number on record — add it before saving the claim");
      return;
    }
    if (!acceptanceDate) {
      toast.error("Date of acceptance is required");
      return;
    }
    if (parsedTeeth === null) {
      toast.error("Tooth numbers must be comma-separated whole numbers");
      return;
    }
    const pounds = parseFloat(patientChargePounds);
    if (Number.isNaN(pounds) || pounds < 0) {
      toast.error("Patient charge must be a positive number");
      return;
    }

    setSaving(true);
    const result = await saveNhsClaim({
      practiceId,
      patientId: appointment.patient.id,
      appointmentId: appointment.id,
      performerId: performer.id,
      formType,
      treatmentBand: band,
      dateOfAcceptance: format(acceptanceDate, "yyyy-MM-dd"),
      dateOfCompletion: completionDate ? format(completionDate, "yyyy-MM-dd") : null,
      isUrgentTreatment: isUrgent || band === "URGENT",
      numberOfVisits,
      patientChargePence: Math.round(pounds * 100),
      exemptionCategory: appointment.nhs_exemption_category,
      exemptionEvidenceSeen: appointment.nhs_exemption_evidence_seen,
      patientSignatureReceived: signatureReceived,
      patientSignatureMethod: signatureReceived ? signatureMethod : null,
      recallIntervalMonths: recallMonths ? Number(recallMonths) : null,
      treatments: { ...treatments, treated_tooth_numbers: parsedTeeth.length ? parsedTeeth : null },
      status,
      existingClaimId: existingClaimId ?? undefined,
    });
    setSaving(false);

    if (!result.success) {
      toast.error(result.error || "Failed to save claim");
      return;
    }
    // On first save we offer a quick path to /nhs-claims so the user can
    // confirm the claim landed and progress its status. On edits we skip
    // the action — they were already looking at the claim. The detail
    // sheet auto-opens on the claims dashboard via the ?claim= param.
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

              {!appointment.patient.nhs_number && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200/60 bg-amber-50 dark:bg-amber-950/20 p-2 text-[11px] text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Patient has no NHS number on file. Add it on the patient
                    record before submitting this claim to NHSBSA.
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
                  {formType === "FP17O" && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                      IOTN fields aren't wired up yet — orthodontic claims save in
                      DRAFT but can't be submitted until that lands.
                    </p>
                  )}
                </Field>
                <Field label="Treatment band">
                  <Select
                    value={band}
                    onValueChange={(v) => setBand(v as FP17TreatmentBand)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BANDS.map((b) => (
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

              <div className="grid grid-cols-2 gap-3">
                <Field label="Number of visits">
                  <Input
                    type="number"
                    min={1}
                    value={numberOfVisits}
                    onChange={(e) => setNumberOfVisits(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={isReadOnly}
                  />
                </Field>
                <label className="flex items-end gap-2 cursor-pointer">
                  <Checkbox
                    checked={isUrgent}
                    onCheckedChange={(v) => setIsUrgent(!!v)}
                    disabled={isReadOnly}
                  />
                  <span className="text-sm pb-1">Urgent treatment</span>
                </label>
              </div>
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
                    placeholder={isExempt ? "0.00 (exempt)" : "e.g. 25.80"}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {isExempt
                      ? "Patient is recorded as exempt — typically £0.00."
                      : "Use the current NHSBSA band charge for the patient's region."}
                  </p>
                </Field>
                <Field label="Recall interval (months)">
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

              <Field label="Treated tooth numbers (FDI)" className="mt-2">
                <Input
                  value={teethInput}
                  onChange={(e) => setTeethInput(e.target.value)}
                  placeholder="e.g. 11, 12, 21"
                  disabled={isReadOnly}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Adult: 11–48. Deciduous: 51–85. Comma-separated.
                </p>
              </Field>
            </FormSection>

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
                    !appointment.patient.nhs_number ||
                    !signatureReceived
                  }
                  className="flex-1"
                  title={
                    !signatureReceived
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

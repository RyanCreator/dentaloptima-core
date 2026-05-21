import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { X, Search, Shield } from "lucide-react";

// Words/phrases that imply the incident is also (or instead) a safeguarding
// matter. Used to surface a one-tap "also raise safeguarding" suggestion
// after the incident is created — staff often file the safety report first
// and forget that safeguarding is a separate workflow.
const SAFEGUARDING_HINT_PATTERNS = [
  /\bsafeguard/i,
  /\babuse/i,
  /\bneglect/i,
  /\bdomestic\s+abuse/i,
  /\bchild\s+(at\s+risk|protection)/i,
  /\bcoerc/i,
  /\bgrooming/i,
  /\bvulnerable\s+adult/i,
];

function looksLikeSafeguarding(text: string): boolean {
  return SAFEGUARDING_HINT_PATTERNS.some((re) => re.test(text));
}

interface NewIncidentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface StaffOption { id: string; full_name: string | null; role: string }
interface PatientHit  { id: string; full_name: string }

const TYPE_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  { value: "CLINICAL",          label: "Clinical",          hint: "Affected a patient's clinical care" },
  { value: "NEAR_MISS",         label: "Near miss",         hint: "Could have caused harm but didn't" },
  { value: "EQUIPMENT_FAILURE", label: "Equipment failure" },
  { value: "NEEDLESTICK",       label: "Needlestick / sharps injury" },
  { value: "INFECTION_CONTROL", label: "Infection control breach" },
  { value: "MEDICATION_ERROR",  label: "Medication error" },
  { value: "PATIENT_FALL",      label: "Patient fall" },
  { value: "DATA_BREACH",       label: "Data breach",       hint: "Reportable to ICO within 72h if a personal data breach" },
  { value: "STAFF_INJURY",      label: "Staff injury",      hint: "Reportable under RIDDOR depending on severity" },
  { value: "OTHER",             label: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "NO_HARM",  label: "No harm",   hint: "Event reached the patient but caused no harm" },
  { value: "LOW",      label: "Low",       hint: "Minor harm — first aid level" },
  { value: "MODERATE", label: "Moderate",  hint: "Required treatment / extended visit" },
  { value: "SEVERE",   label: "Severe",    hint: "Significant harm or permanent injury" },
  { value: "DEATH",    label: "Death" },
];

function nowLocalDatetimeInput(): string {
  // The <input type="datetime-local"> field doesn't accept a Z-suffixed
  // ISO string — it wants "YYYY-MM-DDTHH:mm" in local time. Build that
  // off Date.now() so the default value reflects "now".
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewIncidentSheet({ open, onOpenChange, onCreated }: NewIncidentSheetProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const [incidentType, setIncidentType] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>(nowLocalDatetimeInput());
  const [location, setLocation] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");

  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const [searchingPatient, setSearchingPatient] = useState(false);

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffInvolved, setStaffInvolved] = useState<string[]>([]);
  const [witnesses, setWitnesses] = useState("");
  const [immediateAction, setImmediateAction] = useState("");

  // Reset on close.
  useEffect(() => {
    if (!open) return;
    setIncidentType("");
    setSeverity("");
    setOccurredAt(nowLocalDatetimeInput());
    setLocation("");
    setSummary("");
    setDescription("");
    setPatient(null);
    setPatientQuery("");
    setPatientHits([]);
    setStaffInvolved([]);
    setWitnesses("");
    setImmediateAction("");
  }, [open]);

  // Load staff list once when first opened.
  useEffect(() => {
    if (!open || staffOptions.length > 0) return;
    void (async () => {
      const { data, error } = await supabase
        .from("practice_member")
        .select("id, full_name, role")
        .eq("is_active", true)
        .order("full_name");
      if (error) logger.error("staff load failed", error);
      else setStaffOptions((data as StaffOption[]) || []);
    })();
  }, [open, staffOptions.length]);

  // Debounced patient search. Only fires after 2 characters and once the
  // user pauses typing — otherwise we'd hammer the API on every keystroke.
  useEffect(() => {
    const q = patientQuery.trim();
    if (q.length < 2) { setPatientHits([]); return; }
    const t = setTimeout(async () => {
      setSearchingPatient(true);
      const { data, error } = await supabase
        .from("patient")
        .select("id, full_name")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .is("deleted_at", null)
        .limit(8);
      if (error) logger.error("patient search failed", error);
      else setPatientHits((data as PatientHit[]) || []);
      setSearchingPatient(false);
    }, 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const toggleStaff = (id: string) => {
    setStaffInvolved((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!auth.member) { toast.error("Not signed in"); return; }
    if (!incidentType) { toast.error("Pick an incident type"); return; }
    if (!severity)     { toast.error("Pick a severity");      return; }
    if (!summary.trim())     { toast.error("Add a one-line summary"); return; }
    if (!description.trim()) { toast.error("Describe what happened"); return; }

    setSubmitting(true);
    try {
      const occurredIso = new Date(occurredAt).toISOString();
      const { data, error } = await supabase
        .from("incident_report")
        .insert({
          practice_id:  auth.member.practice_id,
          reported_by:  auth.member.id,
          incident_type: incidentType,
          severity,
          occurred_at:  occurredIso,
          location:     location.trim() || null,
          summary:      summary.trim(),
          description:  description.trim(),
          patient_id:   patient?.id ?? null,
          staff_involved: staffInvolved.length > 0 ? staffInvolved : null,
          witnesses:    witnesses.trim() || null,
          immediate_action_taken: immediateAction.trim() || null,
          status:       "REPORTED",
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Incident logged");
      onOpenChange(false);
      onCreated?.();
      // If serious, surface RIDDOR / ICO reminder. The DB doesn't enforce
      // this — it's a nudge so reception doesn't accidentally skip it.
      if (severity === "SEVERE" || severity === "DEATH") {
        toast.message("Serious incident — review RIDDOR / NRLS reporting obligations.");
      }
      if (incidentType === "DATA_BREACH") {
        toast.message("Personal data breach? ICO must be notified within 72 hours.");
      }
      // Safeguarding bridge — if the wording suggests abuse/neglect, prompt
      // the reporter to also raise a safeguarding concern (separate workflow,
      // separate record, different RLS scope).
      if (looksLikeSafeguarding(`${summary} ${description}`)) {
        toast("This sounds like it may also need a safeguarding concern.", {
          action: {
            label: "Raise safeguarding",
            onClick: () => navigate("/governance?tab=safeguarding"),
          },
        });
      }
      if (data) {
        // Caller can decide to navigate; we just create + close.
      }
    } catch (err) {
      logger.error("incident create failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to log incident");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log an incident</SheetTitle>
          <SheetDescription>
            CQC-required incident report. Be factual — investigation notes can be added later.
          </SheetDescription>
        </SheetHeader>

        {/* Wrong-form bail-out. Safeguarding is a distinct CQC workflow
            with tighter confidentiality + a different status flow — direct
            staff there before they sink time into the incident form. */}
        <div className="mt-4 rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
          <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs flex-1">
            <p className="font-medium">Is this about a patient's wellbeing?</p>
            <p className="text-muted-foreground mt-0.5">
              Suspected abuse, neglect, or domestic abuse goes in the safeguarding workflow instead.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate("/governance?tab=safeguarding");
            }}
            className="text-xs text-primary hover:underline shrink-0 self-start"
          >
            Open safeguarding
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* What happened */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              What happened
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type *</Label>
                <Select value={incidentType} onValueChange={setIncidentType}>
                  <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {incidentType && (
                  <p className="text-xs text-muted-foreground">
                    {TYPE_OPTIONS.find((o) => o.value === incidentType)?.hint}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Severity *</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {severity && (
                  <p className="text-xs text-muted-foreground">
                    {SEVERITY_OPTIONS.find((o) => o.value === severity)?.hint}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>When *</Label>
                <Input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Surgery 1, reception, decon..."
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Summary *</Label>
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line description — appears in lists and reports"
                maxLength={200}
              />
            </div>

            <div className="space-y-1">
              <Label>Full description *</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened, in factual terms. Who was present, what was being done, what went wrong."
                rows={5}
              />
            </div>
          </section>

          {/* People + response */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              People &amp; initial response
            </h3>

            {/* Patient (optional) */}
            <div className="space-y-1">
              <Label>Patient (if involved)</Label>
              {patient ? (
                <div className="flex items-center gap-2 bg-muted/40 rounded px-3 py-2 text-sm">
                  <span className="flex-1">{patient.full_name}</span>
                  <button
                    type="button"
                    onClick={() => { setPatient(null); setPatientQuery(""); }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear patient"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                      placeholder="Search by name or email..."
                      className="pl-9"
                    />
                  </div>
                  {patientQuery.trim().length >= 2 && (
                    <div className="rounded border bg-card max-h-48 overflow-y-auto">
                      {searchingPatient ? (
                        <p className="text-xs text-muted-foreground p-2">Searching...</p>
                      ) : patientHits.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2">No matches</p>
                      ) : (
                        patientHits.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setPatient(p); setPatientQuery(""); setPatientHits([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          >
                            {p.full_name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Staff involved */}
            <div className="space-y-1">
              <Label>Staff involved</Label>
              <div className="rounded border bg-card divide-y max-h-44 overflow-y-auto">
                {staffOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">Loading staff…</p>
                ) : (
                  staffOptions.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={staffInvolved.includes(s.id)}
                        onChange={() => toggleStaff(s.id)}
                        className="rounded"
                      />
                      <span className="flex-1">{s.full_name ?? "Unnamed"}</span>
                      <span className="text-xs text-muted-foreground">{s.role}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Witnesses</Label>
              <Input
                value={witnesses}
                onChange={(e) => setWitnesses(e.target.value)}
                placeholder="Names or descriptions (free text)"
              />
            </div>

            <div className="space-y-1">
              <Label>Immediate action taken</Label>
              <Textarea
                value={immediateAction}
                onChange={(e) => setImmediateAction(e.target.value)}
                placeholder="What was done in response (first aid, isolation of equipment, patient reassurance, etc.)"
                rows={3}
              />
            </div>
          </section>

          <SheetFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Logging…" : "Log incident"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

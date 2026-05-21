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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { X, Search, AlertTriangle, Lock } from "lucide-react";

interface NewSafeguardingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface PatientHit { id: string; full_name: string }

const TYPE_OPTIONS = [
  { value: "CHILD",          label: "Child",                hint: "Anyone under 18" },
  { value: "ADULT_AT_RISK",  label: "Adult at risk",        hint: "Adult with care + support needs at risk of abuse or neglect" },
  { value: "DOMESTIC_ABUSE", label: "Domestic abuse",       hint: "Includes coercive control, financial abuse, etc." },
  { value: "MENTAL_CAPACITY",label: "Mental capacity concern" },
  { value: "NEGLECT",        label: "Neglect" },
  { value: "PHYSICAL_ABUSE", label: "Physical abuse" },
  { value: "OTHER",          label: "Other" },
];

export function NewSafeguardingSheet({ open, onOpenChange, onCreated }: NewSafeguardingSheetProps) {
  const auth = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [concernType, setConcernType] = useState("");
  const [description, setDescription] = useState("");
  const [riskAssessment, setRiskAssessment] = useState("");
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [acknowledgedConfidentiality, setAcknowledgedConfidentiality] = useState(false);

  // Reset on open. Confidentiality checkbox is always reset to false so
  // every submission is an active opt-in.
  useEffect(() => {
    if (!open) return;
    setConcernType("");
    setDescription("");
    setRiskAssessment("");
    setPatient(null);
    setPatientQuery("");
    setPatientHits([]);
    setAcknowledgedConfidentiality(false);
  }, [open]);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!auth.member) { toast.error("Not signed in"); return; }
    if (!concernType)              { toast.error("Pick the type of concern"); return; }
    if (!description.trim())       { toast.error("Describe the concern");      return; }
    if (!acknowledgedConfidentiality) {
      toast.error("Tick the confidentiality acknowledgement to continue");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("safeguarding_concern")
        .insert({
          practice_id: auth.member.practice_id,
          raised_by:   auth.member.id,
          concern_type: concernType,
          description: description.trim(),
          immediate_risk_assessment: riskAssessment.trim() || null,
          patient_id:  patient?.id ?? null,
          status:      "IDENTIFIED",
        });
      if (error) throw error;
      toast.success("Concern raised");
      toast.message(
        concernType === "CHILD"
          ? "Children at immediate risk: call 999 or Children's Social Care now."
          : "Adults at immediate risk: call 999 or Adult Social Care now.",
      );
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      logger.error("safeguarding create failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to raise concern");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Raise a safeguarding concern</SheetTitle>
          <SheetDescription>
            Captures what you observed. The practice safeguarding lead will
            review and decide on a referral to the relevant authority.
          </SheetDescription>
        </SheetHeader>

        {/* Immediate-danger reminder. Sits above the form so it's seen
            before someone starts typing — most safeguarding concerns are
            non-emergency, but the few that aren't matter most. */}
        <div className="mt-4 rounded-lg border bg-red-50 border-red-200 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-700 mt-0.5 shrink-0" />
          <div className="text-xs text-red-900">
            <p className="font-semibold">If there's immediate risk to life or safety</p>
            <p className="mt-0.5">
              Call <strong>999</strong> now. This form is for non-emergency safeguarding records.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label>Type of concern *</Label>
            <Select value={concernType} onValueChange={setConcernType}>
              <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {concernType && (
              <p className="text-xs text-muted-foreground">
                {TYPE_OPTIONS.find((o) => o.value === concernType)?.hint}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Description *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What you observed, in factual terms. What was said, what was seen. Avoid interpretation — that's for the review."
              rows={6}
            />
          </div>

          <div className="space-y-1">
            <Label>Immediate risk assessment</Label>
            <Textarea
              value={riskAssessment}
              onChange={(e) => setRiskAssessment(e.target.value)}
              placeholder="Is the person at risk right now? Are they alone with the alleged perpetrator? Any visible injuries or distress?"
              rows={3}
            />
          </div>

          {/* Patient (optional — may be about someone seen but never registered) */}
          <div className="space-y-1">
            <Label>Person of concern (if a registered patient)</Label>
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
                <p className="text-xs text-muted-foreground">
                  Leave blank if the person isn't a registered patient — describe them in the notes instead.
                </p>
              </div>
            )}
          </div>

          {/* Confidentiality opt-in. Required so we don't surface in
              accidental form-resubmission scenarios. */}
          <label className="flex items-start gap-2 rounded border bg-muted/30 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledgedConfidentiality}
              onChange={(e) => setAcknowledgedConfidentiality(e.target.checked)}
              className="mt-1 shrink-0"
            />
            <div className="text-xs">
              <p className="font-semibold flex items-center gap-1">
                <Lock className="h-3 w-3" /> I will keep this confidential
              </p>
              <p className="text-muted-foreground mt-0.5">
                I'll discuss this only with the practice safeguarding lead /
                admin and on a strict need-to-know basis. I won't tip off the
                alleged perpetrator.
              </p>
            </div>
          </label>

          <SheetFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Raising…" : "Raise concern"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

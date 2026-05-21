import { useState } from "react";
import { Badge as BadgeIcon, ShieldCheck, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

// Inline panel that captures the patient's NHS charge exemption + whether
// reception has seen the supporting evidence. Lives on the appointment
// detail because the assertion + verification happens at the visit (not
// per-patient): a patient who's pregnant in March may not be in November.
//
// At FP17 claim creation the values are copied into nhs_claim, then the
// claim becomes the source of truth for NHSBSA. Until then, this panel is
// the place reception updates exemption + verifies evidence.
//
// Renders nothing when the appointment doesn't have at least one NHS
// service — surfaces it only where it's relevant.

export type NHSExemptionCategory =
  | "NONE"
  | "UNDER_18"
  | "UNDER_19_FULL_TIME_EDUCATION"
  | "PREGNANT"
  | "NURSING_MOTHER_12M"
  | "INCOME_SUPPORT"
  | "JOBSEEKERS_ALLOWANCE"
  | "ESA_INCOME_RELATED"
  | "PENSION_CREDIT_GUARANTEE"
  | "UNIVERSAL_CREDIT_QUALIFYING"
  | "NHS_TAX_CREDIT_EXEMPTION"
  | "HC2_FULL_HELP"
  | "HC3_PARTIAL_HELP"
  | "OTHER";

const CATEGORY_OPTIONS: {
  value: NHSExemptionCategory;
  label: string;
  evidenceHint?: string;
}[] = [
  { value: "NONE", label: "No exemption (patient pays standard charge)" },
  { value: "UNDER_18", label: "Under 18", evidenceHint: "Date of birth on record" },
  {
    value: "UNDER_19_FULL_TIME_EDUCATION",
    label: "Under 19, in full-time education",
    evidenceHint: "Letter from college / sixth form",
  },
  {
    value: "PREGNANT",
    label: "Pregnant",
    evidenceHint: "MAT B1 form (or equivalent maternity certificate)",
  },
  {
    value: "NURSING_MOTHER_12M",
    label: "Nursing mother (baby under 12 months)",
    evidenceHint: "Baby's birth certificate / Red Book",
  },
  {
    value: "INCOME_SUPPORT",
    label: "Income Support",
    evidenceHint: "Award letter dated within 12 months",
  },
  {
    value: "JOBSEEKERS_ALLOWANCE",
    label: "Income-based Jobseeker's Allowance",
    evidenceHint: "Award letter dated within 12 months",
  },
  {
    value: "ESA_INCOME_RELATED",
    label: "Income-related ESA",
    evidenceHint: "Award letter dated within 12 months",
  },
  {
    value: "PENSION_CREDIT_GUARANTEE",
    label: "Pension Credit (Guarantee Credit)",
    evidenceHint: "Award letter — Guarantee Credit only",
  },
  {
    value: "UNIVERSAL_CREDIT_QUALIFYING",
    label: "Universal Credit (qualifying)",
    evidenceHint: "Most recent UC statement showing earnings under threshold",
  },
  {
    value: "NHS_TAX_CREDIT_EXEMPTION",
    label: "NHS Tax Credit Exemption Certificate",
    evidenceHint: "Valid NHS Tax Credit Exemption Certificate",
  },
  {
    value: "HC2_FULL_HELP",
    label: "HC2 certificate (full help)",
    evidenceHint: "Valid HC2 certificate",
  },
  {
    value: "HC3_PARTIAL_HELP",
    label: "HC3 certificate (partial help)",
    evidenceHint: "Valid HC3 certificate",
  },
  { value: "OTHER", label: "Other (notes required)" },
];

interface NHSExemptionPanelProps {
  appointmentId: string;
  hasNhsService: boolean;
  initialCategory: NHSExemptionCategory;
  initialEvidenceSeen: boolean;
  patientNhsNumber: string | null | undefined;
  onSaved?: () => void;
}

export function NHSExemptionPanel({
  appointmentId,
  hasNhsService,
  initialCategory,
  initialEvidenceSeen,
  patientNhsNumber,
  onSaved,
}: NHSExemptionPanelProps) {
  const [category, setCategory] = useState<NHSExemptionCategory>(initialCategory);
  const [evidenceSeen, setEvidenceSeen] = useState<boolean>(initialEvidenceSeen);
  const [saving, setSaving] = useState(false);

  if (!hasNhsService) return null;

  const currentOption = CATEGORY_OPTIONS.find((o) => o.value === category);

  const updateRow = async (next: {
    category?: NHSExemptionCategory;
    evidenceSeen?: boolean;
  }) => {
    setSaving(true);
    const payload: Record<string, unknown> = {};
    if (next.category !== undefined) payload.nhs_exemption_category = next.category;
    if (next.evidenceSeen !== undefined)
      payload.nhs_exemption_evidence_seen = next.evidenceSeen;

    const { error } = await supabase
      .from("appointment")
      .update(payload)
      .eq("id", appointmentId);
    setSaving(false);

    if (error) {
      logger.error("Failed to update NHS exemption", error);
      toast.error("Failed to update exemption");
      return false;
    }
    onSaved?.();
    return true;
  };

  const handleCategoryChange = async (value: string) => {
    const next = value as NHSExemptionCategory;
    const prev = category;
    setCategory(next);
    // If the user moves back to NONE, evidence-seen is meaningless — clear it
    // so the index stays accurate.
    const evidence = next === "NONE" ? false : evidenceSeen;
    if (next === "NONE" && evidenceSeen) setEvidenceSeen(false);

    const ok = await updateRow({ category: next, evidenceSeen: evidence });
    if (!ok) {
      setCategory(prev);
      if (next === "NONE") setEvidenceSeen(initialEvidenceSeen);
    } else {
      toast.success("Exemption updated");
    }
  };

  const handleEvidenceChange = async (checked: boolean) => {
    const prev = evidenceSeen;
    setEvidenceSeen(checked);
    const ok = await updateRow({ evidenceSeen: checked });
    if (!ok) {
      setEvidenceSeen(prev);
    } else {
      toast.success(checked ? "Evidence verified" : "Evidence flag cleared");
    }
  };

  // Status chip colour: green if exempt + evidence seen; amber if exempt but
  // unverified; muted if no exemption claimed.
  const isExempt = category !== "NONE";
  const chipClass = isExempt
    ? evidenceSeen
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
    : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BadgeIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            NHS exemption
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recorded at the visit; flows into the FP17 claim at submission.
          </p>
        </div>
        <span className={cn("text-[10px] font-medium px-2 py-1 rounded shrink-0", chipClass)}>
          {isExempt ? (evidenceSeen ? "Verified" : "Unverified") : "Not exempt"}
        </span>
      </div>

      {!patientNhsNumber && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200/60 bg-amber-50 dark:bg-amber-950/20 p-2 text-[11px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            This patient has no NHS number on record. Add it to their profile
            before this claim can be submitted.
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Exemption category</Label>
        <Select value={category} onValueChange={handleCategoryChange} disabled={saving}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isExempt && (
        <>
          <label className="flex items-start gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40 transition-colors">
            <Checkbox
              checked={evidenceSeen}
              onCheckedChange={(v) => handleEvidenceChange(!!v)}
              disabled={saving}
              className="mt-0.5"
            />
            <span className="text-xs flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Evidence verified
              </span>
              {currentOption?.evidenceHint && (
                <span className="block text-muted-foreground mt-0.5">
                  {currentOption.evidenceHint}
                </span>
              )}
            </span>
          </label>
        </>
      )}
    </div>
  );
}

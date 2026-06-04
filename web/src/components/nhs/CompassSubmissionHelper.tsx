import { useCallback, useEffect, useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { PageLoading } from "@/components/PageLoading";
import { useNhsReferenceData } from "@/hooks/useNhsReferenceData";
import {
  buildCompassSections,
  type CompassClaimInput,
  type CompassActivity,
} from "@/lib/nhs/compassFields";
import { Copy, Check, Send, ExternalLink, ClipboardList } from "lucide-react";

// Manual Compass submission helper. Until WebEDI is authorised, claims are
// keyed into the Compass online FP17 form by hand. This lays every field out in
// Compass order with one-click copy, then records the submission once the user
// confirms they finalised + authorised it in Compass. The Compass claim
// reference is optional (Compass doesn't reliably hand one back) but encouraged
// for later payment reconciliation.

interface Props {
  claimId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

type ClaimRow = CompassClaimInput & { id: string; status: string };

export function CompassSubmissionHelper({ claimId, open, onOpenChange, onSubmitted }: Props) {
  const { data: referenceData } = useNhsReferenceData("ENGLAND");
  const [loading, setLoading] = useState(false);
  const [claim, setClaim] = useState<ClaimRow | null>(null);
  const [activities, setActivities] = useState<CompassActivity[]>([]);
  const [attested, setAttested] = useState(false);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!claimId) return;
    setLoading(true);
    setAttested(false);
    setReference("");
    const [claimRes, actRes] = await Promise.all([
      supabase
        .from("nhs_claim")
        .select(
          `id, status, form_type, treatment_band, date_of_acceptance, date_of_completion,
           number_of_visits, patient_charge_pence, exemption_category, patient_signature_received,
           recall_interval_months, snapshot_title, snapshot_forename, snapshot_surname, snapshot_sex,
           snapshot_date_of_birth, snapshot_nhs_number, snapshot_address_line1, snapshot_address_line2,
           snapshot_address_line3, snapshot_postcode,
           performer:performer_id (performer_number, provider_number)`,
        )
        .eq("id", claimId)
        .maybeSingle(),
      supabase.from("nhs_claim_activity").select("code, value").eq("nhs_claim_id", claimId),
    ]);
    if (claimRes.error || !claimRes.data) {
      logger.error("Failed to load claim for Compass helper", claimRes.error);
      toast.error("Failed to load claim");
      setClaim(null);
    } else {
      setClaim(claimRes.data as unknown as ClaimRow);
      setActivities((actRes.data as CompassActivity[] | null) ?? []);
    }
    setLoading(false);
  }, [claimId]);

  useEffect(() => {
    if (open && claimId) void load();
  }, [open, claimId, load]);

  const codeLabel = useCallback(
    (code: string, value: number | null) => {
      const row = referenceData?.codes.find(
        (c) => c.code === code && (c.value === value || c.value === null),
      );
      return row?.label ?? code;
    },
    [referenceData],
  );

  const sections = useMemo(
    () => (claim ? buildCompassSections(claim, activities, codeLabel) : []),
    [claim, activities, codeLabel],
  );

  const copyAll = async () => {
    const text = sections
      .flatMap((s) => [`# ${s.title}`, ...s.fields.map((f) => `${f.label}: ${f.value}`), ""])
      .join("\n")
      .trim();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("All fields copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const markSubmitted = async () => {
    if (!claim || !attested) return;
    setSaving(true);
    const { error } = await supabase
      .from("nhs_claim")
      .update({
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
        submission_reference: reference.trim() || null,
      })
      .eq("id", claim.id);
    setSaving(false);
    if (error) {
      toast.error(`Failed to record submission: ${error.message}`);
      return;
    }
    toast.success("Claim recorded as submitted");
    onSubmitted?.();
    onOpenChange(false);
  };

  // Soft hint only — never blocks. Compass references vary; we just nudge.
  const refLooksThin = reference.trim().length > 0 && reference.trim().length < 4;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Submit to Compass
          </SheetTitle>
          <SheetDescription>
            Copy each field into the Compass online FP17 form, then confirm below.
          </SheetDescription>
        </SheetHeader>

        {loading || !claim ? (
          <div className="mt-6">
            <PageLoading variant="inline" label="Loading claim..." />
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="flex gap-2">
              <a
                href="https://www.nhsbsa.nhs.uk/compass"
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 text-xs rounded-md border bg-card p-2 hover:bg-muted/40 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Compass
              </a>
              <Button variant="outline" size="sm" onClick={copyAll} className="text-xs">
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy all fields
              </Button>
            </div>

            {sections.map((section) => (
              <div key={section.title} className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </h4>
                <div className="rounded-lg border divide-y">
                  {section.fields.map((f, i) => (
                    <CopyRow key={i} label={f.label} value={f.value} mono={f.mono} />
                  ))}
                </div>
              </div>
            ))}

            {/* Confirm + record */}
            <div className="rounded-lg border bg-card p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={attested}
                  onCheckedChange={(v) => setAttested(!!v)}
                  className="mt-0.5"
                />
                <span className="text-xs">
                  <span className="font-medium block">
                    I have finalised &amp; authorised this claim in Compass
                  </span>
                  <span className="text-muted-foreground">
                    Required — this is what records the claim as submitted.
                  </span>
                </span>
              </label>

              <div className="space-y-1">
                <Label className="text-xs">Compass claim reference (optional)</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="If Compass shows one — helps match the payment later"
                  className="h-8 font-mono"
                />
                {refLooksThin && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">
                    That looks short — double-check, or leave blank.
                  </p>
                )}
              </div>

              <Button
                onClick={markSubmitted}
                disabled={!attested || saving}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-1.5" />
                Mark as submitted
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };
  return (
    <div className="flex items-center gap-2 p-2">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-sm truncate ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={copy}
        className="h-7 px-2 shrink-0"
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

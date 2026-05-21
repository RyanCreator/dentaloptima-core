import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { PageLoading } from "@/components/PageLoading";
import { formatPrice } from "@/types/entities";
import { FileText, Send, Check, X, RotateCcw } from "lucide-react";

// Read-mostly viewer for an NHS claim, opened from the claims dashboard.
// Surfaces enough context for the user to understand a claim's state and
// transition it forward (READY → SUBMITTED → ACCEPTED/REJECTED → PAID).
// Edits to the claim's contents (band, treatments, signatures) still go
// through the calendar's NHSClaimSheet so the workflow stays anchored to
// the source appointment.

interface ClaimDetail {
  id: string;
  practice_id: string;
  status: string;
  form_type: string;
  treatment_band: string | null;
  date_of_acceptance: string;
  date_of_completion: string | null;
  number_of_visits: number;
  is_urgent_treatment: boolean;
  patient_charge_pence: number;
  exemption_category: string;
  exemption_evidence_seen: boolean;
  patient_signature_received: boolean;
  patient_signature_method: string | null;
  recall_interval_months: number | null;
  ready_to_submit_at: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_code: string | null;
  rejection_reason: string | null;
  scheduled_for_payment_at: string | null;
  paid_at: string | null;
  payment_amount_pence: number | null;
  source_appointment_id: string | null;
  patient: { id: string; full_name: string; nhs_number: string | null } | null;
  performer: {
    performer_number: string;
    provider_number: string;
    staff: { full_name: string | null } | null;
  } | null;
  treatments: TreatmentDetail | null;
}

interface TreatmentDetail {
  examination: boolean;
  scale_and_polish: boolean;
  fluoride_varnish: boolean;
  fissure_sealants: boolean;
  fillings_count: number;
  extractions_count: number;
  endodontic_count: number;
  crowns_count: number;
  bridges_count: number;
  dentures_count: number;
  x_rays_taken: number;
  periodontal_treatment: boolean;
  free_repair_or_replacement: boolean;
  antibiotic_items: number;
  treated_tooth_numbers: number[] | null;
}

interface NHSClaimDetailSheetProps {
  claimId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function NHSClaimDetailSheet({
  claimId,
  onOpenChange,
  onChanged,
}: NHSClaimDetailSheetProps) {
  const [loading, setLoading] = useState(false);
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionCode, setRejectionCode] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showPaidForm, setShowPaidForm] = useState(false);
  const [paymentAmountPounds, setPaymentAmountPounds] = useState("");

  const load = useCallback(async () => {
    if (!claimId) return;
    setLoading(true);
    const [claimRes, treatRes] = await Promise.all([
      supabase
        .from("nhs_claim")
        .select(
          `id, practice_id, status, form_type, treatment_band, date_of_acceptance,
           date_of_completion, number_of_visits, is_urgent_treatment,
           patient_charge_pence, exemption_category, exemption_evidence_seen,
           patient_signature_received, patient_signature_method, recall_interval_months,
           ready_to_submit_at, submitted_at, acknowledged_at, accepted_at,
           rejected_at, rejection_code, rejection_reason,
           scheduled_for_payment_at, paid_at, payment_amount_pence,
           source_appointment_id,
           patient:patient_id (id, full_name, nhs_number),
           performer:performer_id (performer_number, provider_number, staff:staff_id (full_name))`,
        )
        .eq("id", claimId)
        .maybeSingle(),
      supabase
        .from("nhs_claim_treatment")
        .select("*")
        .eq("nhs_claim_id", claimId)
        .maybeSingle(),
    ]);

    if (claimRes.error || !claimRes.data) {
      logger.error("Failed to load claim", claimRes.error);
      toast.error("Failed to load claim");
      setClaim(null);
    } else {
      setClaim({
        ...(claimRes.data as unknown as Omit<ClaimDetail, "treatments">),
        treatments: (treatRes.data as TreatmentDetail | null) ?? null,
      });
    }
    setLoading(false);
  }, [claimId]);

  useEffect(() => {
    if (claimId) {
      void load();
    } else {
      setClaim(null);
      setShowRejectForm(false);
      setShowPaidForm(false);
    }
  }, [claimId, load]);

  const transitionStatus = async (
    nextStatus: string,
    extras: Record<string, unknown> = {},
  ) => {
    if (!claim) return;
    setBusy(true);
    const { error } = await supabase
      .from("nhs_claim")
      .update({ status: nextStatus, ...extras })
      .eq("id", claim.id);
    setBusy(false);

    if (error) {
      toast.error(`Failed to update: ${error.message}`);
      return;
    }
    toast.success(`Marked ${nextStatus.replace(/_/g, " ").toLowerCase()}`);
    await load();
    onChanged?.();
  };

  const markSubmitted = () =>
    transitionStatus("SUBMITTED", { submitted_at: new Date().toISOString() });
  const markAccepted = () =>
    transitionStatus("ACCEPTED", { accepted_at: new Date().toISOString() });
  const markRejected = () => {
    if (!rejectionReason.trim()) {
      toast.error("Reason is required to reject");
      return;
    }
    void transitionStatus("REJECTED", {
      rejected_at: new Date().toISOString(),
      rejection_code: rejectionCode.trim() || null,
      rejection_reason: rejectionReason.trim(),
    });
    setShowRejectForm(false);
    setRejectionCode("");
    setRejectionReason("");
  };
  const markPaid = () => {
    const pounds = parseFloat(paymentAmountPounds);
    if (Number.isNaN(pounds) || pounds < 0) {
      toast.error("Enter the payment amount in pounds");
      return;
    }
    void transitionStatus("PAID", {
      paid_at: new Date().toISOString(),
      payment_amount_pence: Math.round(pounds * 100),
    });
    setShowPaidForm(false);
    setPaymentAmountPounds("");
  };
  const cancelClaim = () => {
    if (!confirm("Cancel this claim? Use only when withdrawing — keeps the row for audit.")) return;
    void transitionStatus("CANCELLED");
  };
  const reopenForResubmit = () =>
    transitionStatus("DRAFT", {
      ready_to_submit_at: null,
      submitted_at: null,
      rejected_at: null,
    });

  return (
    <Sheet open={!!claimId} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            FP17 claim
          </SheetTitle>
          <SheetDescription>
            {claim?.patient?.full_name ?? "Loading..."}
            {claim && (
              <>
                {" · "}
                {format(parseISO(claim.date_of_acceptance), "PPP")}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading || !claim ? (
          <div className="mt-6">
            <PageLoading variant="inline" label="Loading claim..." />
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {/* Header summary */}
            <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
              <KV
                label="Status"
                value={claim.status.replace(/_/g, " ").toLowerCase()}
              />
              <KV label="Form" value={claim.form_type} />
              <KV
                label="Band"
                value={claim.treatment_band?.replace(/_/g, " ").toLowerCase() ?? "—"}
              />
              <KV
                label="Performer"
                value={
                  claim.performer
                    ? `${claim.performer.performer_number}${
                        claim.performer.staff?.full_name
                          ? ` · ${claim.performer.staff.full_name}`
                          : ""
                      }`
                    : "—"
                }
              />
              <KV
                label="NHS no."
                value={claim.patient?.nhs_number ?? "Not on record"}
              />
              <KV
                label="Acceptance"
                value={format(parseISO(claim.date_of_acceptance), "d MMM yyyy")}
              />
              {claim.date_of_completion && (
                <KV
                  label="Completion"
                  value={format(parseISO(claim.date_of_completion), "d MMM yyyy")}
                />
              )}
              <KV label="Visits" value={String(claim.number_of_visits)} />
              <KV
                label="Patient charge"
                value={formatPrice(claim.patient_charge_pence)}
              />
              <KV
                label="Exemption"
                value={
                  claim.exemption_category === "NONE"
                    ? "Not exempt"
                    : `${claim.exemption_category.replace(/_/g, " ").toLowerCase()} · ${
                        claim.exemption_evidence_seen ? "Verified" : "Unverified"
                      }`
                }
              />
              <KV
                label="Signature"
                value={
                  claim.patient_signature_received
                    ? `Received${
                        claim.patient_signature_method
                          ? ` (${claim.patient_signature_method.toLowerCase()})`
                          : ""
                      }`
                    : "Missing"
                }
              />
            </div>

            {/* Treatments summary */}
            {claim.treatments && (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Treatments
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {treatmentSummaryEntries(claim.treatments).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
                {claim.treatments.treated_tooth_numbers &&
                  claim.treatments.treated_tooth_numbers.length > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Teeth:</span>{" "}
                      <span className="font-mono">
                        {claim.treatments.treated_tooth_numbers.join(", ")}
                      </span>
                    </div>
                  )}
              </div>
            )}

            {/* Lifecycle timestamps */}
            <div className="rounded-lg border bg-card p-3 space-y-1 text-xs text-muted-foreground">
              <Timestamp label="Ready to submit" iso={claim.ready_to_submit_at} />
              <Timestamp label="Submitted" iso={claim.submitted_at} />
              <Timestamp label="Acknowledged" iso={claim.acknowledged_at} />
              <Timestamp label="Accepted" iso={claim.accepted_at} />
              <Timestamp label="Rejected" iso={claim.rejected_at} />
              <Timestamp
                label="Scheduled for payment"
                iso={claim.scheduled_for_payment_at}
              />
              <Timestamp
                label={`Paid${
                  claim.payment_amount_pence != null
                    ? ` · ${formatPrice(claim.payment_amount_pence)}`
                    : ""
                }`}
                iso={claim.paid_at}
              />
            </div>

            {/* Status transition actions */}
            <div className="space-y-2">
              {claim.status === "READY_TO_SUBMIT" && (
                <Button onClick={markSubmitted} disabled={busy} className="w-full">
                  <Send className="h-4 w-4 mr-2" />
                  Mark submitted to NHSBSA
                </Button>
              )}

              {(claim.status === "SUBMITTED" || claim.status === "ACKNOWLEDGED") && (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={markAccepted} disabled={busy} variant="outline">
                    <Check className="h-4 w-4 mr-1.5" /> Accepted
                  </Button>
                  <Button
                    onClick={() => setShowRejectForm((s) => !s)}
                    disabled={busy}
                    variant="outline"
                    className="text-red-700 border-red-200 hover:bg-red-50"
                  >
                    <X className="h-4 w-4 mr-1.5" /> Rejected
                  </Button>
                </div>
              )}

              {showRejectForm && (
                <div className="space-y-2 rounded-lg border bg-red-50/40 dark:bg-red-950/15 p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Rejection code (optional)</Label>
                    <Input
                      value={rejectionCode}
                      onChange={(e) => setRejectionCode(e.target.value)}
                      placeholder="e.g. NHSBSA-029"
                      className="h-8 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reason *</Label>
                    <Textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={2}
                      placeholder="Reason returned by NHSBSA"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={markRejected} disabled={busy} size="sm" className="flex-1">
                      Save rejection
                    </Button>
                    <Button
                      onClick={() => setShowRejectForm(false)}
                      variant="ghost"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {claim.status === "ACCEPTED" && (
                <Button
                  onClick={() => setShowPaidForm((s) => !s)}
                  disabled={busy}
                  className="w-full"
                >
                  Mark paid
                </Button>
              )}

              {showPaidForm && (
                <div className="space-y-2 rounded-lg border bg-green-50/40 dark:bg-green-950/15 p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Payment amount (£)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmountPounds}
                      onChange={(e) => setPaymentAmountPounds(e.target.value)}
                      placeholder="e.g. 25.80"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={markPaid} disabled={busy} size="sm" className="flex-1">
                      Confirm payment
                    </Button>
                    <Button
                      onClick={() => setShowPaidForm(false)}
                      variant="ghost"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {claim.status === "REJECTED" && (
                <Button
                  onClick={reopenForResubmit}
                  disabled={busy}
                  variant="outline"
                  className="w-full"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reopen as draft for correction
                </Button>
              )}

              {!["PAID", "CANCELLED"].includes(claim.status) && (
                <Button
                  onClick={cancelClaim}
                  disabled={busy}
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive"
                >
                  Cancel claim
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium capitalize text-right truncate">{value}</span>
    </div>
  );
}

function Timestamp({ label, iso }: { label: string; iso: string | null }) {
  if (!iso) return null;
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="font-mono">{format(parseISO(iso), "d MMM yyyy, HH:mm")}</span>
    </div>
  );
}

function treatmentSummaryEntries(t: TreatmentDetail): [string, string][] {
  const entries: [string, string][] = [];
  if (t.examination) entries.push(["Examination", "Yes"]);
  if (t.scale_and_polish) entries.push(["Scale & polish", "Yes"]);
  if (t.fluoride_varnish) entries.push(["Fluoride varnish", "Yes"]);
  if (t.fissure_sealants) entries.push(["Fissure sealants", "Yes"]);
  if (t.periodontal_treatment) entries.push(["Periodontal", "Yes"]);
  if (t.free_repair_or_replacement) entries.push(["Free repair", "Yes"]);
  if (t.fillings_count) entries.push(["Fillings", String(t.fillings_count)]);
  if (t.extractions_count) entries.push(["Extractions", String(t.extractions_count)]);
  if (t.endodontic_count) entries.push(["Endodontic", String(t.endodontic_count)]);
  if (t.crowns_count) entries.push(["Crowns", String(t.crowns_count)]);
  if (t.bridges_count) entries.push(["Bridges", String(t.bridges_count)]);
  if (t.dentures_count) entries.push(["Dentures", String(t.dentures_count)]);
  if (t.x_rays_taken) entries.push(["X-rays", String(t.x_rays_taken)]);
  if (t.antibiotic_items) entries.push(["Antibiotics", String(t.antibiotic_items)]);
  return entries.length > 0 ? entries : [["No treatments recorded", "—"]];
}

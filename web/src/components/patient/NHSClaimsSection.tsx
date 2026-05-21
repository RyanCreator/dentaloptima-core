import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Receipt, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { formatPrice } from "@/types/entities";
import { NHSClaimDetailSheet } from "@/components/nhs/NHSClaimDetailSheet";

// Patient-scoped FP17 claims list. Claims are created from the appointment
// detail (calendar) — this section is read-mostly, with click-through to
// NHSClaimDetailSheet for status transitions. Hidden entirely for private-
// only patients (no claims and no NHS number) to keep the profile clean.

interface ClaimRow {
  id: string;
  status: string;
  form_type: string;
  treatment_band: string | null;
  date_of_acceptance: string;
  patient_charge_pence: number;
  exemption_category: string;
  exemption_evidence_seen: boolean;
  rejection_reason: string | null;
  performer: { performer_number: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  READY_TO_SUBMIT: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  SUBMITTED: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  ACKNOWLEDGED: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  DUPLICATE: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  SCHEDULED_FOR_PAYMENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  PAID: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

interface NHSClaimsSectionProps {
  patientId: string;
  hasNhsNumber: boolean;
}

export function NHSClaimsSection({ patientId, hasNhsNumber }: NHSClaimsSectionProps) {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nhs_claim")
      .select(
        `id, status, form_type, treatment_band, date_of_acceptance,
         patient_charge_pence, exemption_category, exemption_evidence_seen,
         rejection_reason,
         performer:performer_id (performer_number)`,
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("date_of_acceptance", { ascending: false });

    if (error) {
      logger.error("Failed to load patient NHS claims", error);
    } else {
      setClaims((data ?? []) as unknown as ClaimRow[]);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Hide for private-only patients with no claims to keep the profile lean.
  if (!hasNhsNumber && claims.length === 0 && !loading) {
    return null;
  }

  const totalPaid = claims
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + c.patient_charge_pence, 0);
  const readyCount = claims.filter((c) => c.status === "READY_TO_SUBMIT").length;
  const draftCount = claims.filter((c) => c.status === "DRAFT").length;

  return (
    <>
      <div className="bg-card rounded-lg border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            NHS Claims
            {claims.length > 0 && (
              <span className="text-muted-foreground font-normal text-sm">
                ({claims.length})
              </span>
            )}
          </h3>
          {(draftCount > 0 || readyCount > 0) && (
            <div className="flex gap-1.5 text-xs">
              {draftCount > 0 && (
                <span className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 px-1.5 py-0.5 rounded">
                  {draftCount} draft
                </span>
              )}
              {readyCount > 0 && (
                <span className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-1.5 py-0.5 rounded">
                  {readyCount} ready
                </span>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-2">Loading claims...</p>
        ) : claims.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No NHS claims yet. Create one from a completed NHS appointment.
          </p>
        ) : (
          <>
            <div className="divide-y border rounded-md">
              {claims.map((claim) => (
                <ClaimRowItem
                  key={claim.id}
                  claim={claim}
                  onClick={() => setSelectedClaimId(claim.id)}
                />
              ))}
            </div>

            {totalPaid > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Total paid</span>
                <span className="font-medium text-foreground">{formatPrice(totalPaid)}</span>
              </div>
            )}
          </>
        )}
      </div>

      <NHSClaimDetailSheet
        claimId={selectedClaimId}
        onOpenChange={(o) => {
          if (!o) setSelectedClaimId(null);
        }}
        onChanged={load}
      />
    </>
  );
}

function ClaimRowItem({ claim, onClick }: { claim: ClaimRow; onClick: () => void }) {
  const statusClass = STATUS_BADGE[claim.status] ?? "bg-muted text-muted-foreground";
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-2 hover:bg-muted/50 transition-colors text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium">
              {format(parseISO(claim.date_of_acceptance), "d MMM yyyy")}
            </span>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${statusClass}`}
            >
              {claim.status.replace(/_/g, " ").toLowerCase()}
            </span>
            {claim.treatment_band && (
              <span className="text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-1.5 py-0.5 rounded">
                {claim.treatment_band.replace(/_/g, " ").toLowerCase()}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {claim.form_type}
            {claim.performer && ` · Performer ${claim.performer.performer_number}`}
            {claim.exemption_category !== "NONE" && (
              <span
                className={`ml-1 ${
                  claim.exemption_evidence_seen
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                · {claim.exemption_category.replace(/_/g, " ").toLowerCase()}
              </span>
            )}
          </div>
          {claim.status === "REJECTED" && claim.rejection_reason && (
            <div className="text-xs text-red-700 dark:text-red-300 mt-0.5 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{claim.rejection_reason}</span>
            </div>
          )}
        </div>
        <div className="text-sm font-medium shrink-0">
          {formatPrice(claim.patient_charge_pence)}
        </div>
      </div>
    </button>
  );
}

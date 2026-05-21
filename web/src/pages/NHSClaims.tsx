import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO, subDays, startOfMonth } from "date-fns";
import { FileText, Search, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useSelection } from "@/hooks/useSelection";
import { BulkActionBar } from "@/components/BulkActionBar";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoading } from "@/components/PageLoading";
import { formatPrice } from "@/types/entities";
import { NHSClaimDetailSheet } from "@/components/nhs/NHSClaimDetailSheet";

// FP17 claims dashboard. Keeps the surface lean: a status-filter tab row,
// search + date range, a flat list, and a "submit all ready" action. Each
// row opens NHSClaimDetailSheet which handles status transitions; deep
// edits still happen through the calendar's NHSClaimSheet so the workflow
// has one source of truth (the linked appointment).
//
// NHSBSA integration isn't here yet — "submit" simply transitions status
// from READY_TO_SUBMIT to SUBMITTED with a timestamp. The real submit
// pipeline is downstream of getting NHSBSA test credentials.

interface ClaimRow {
  id: string;
  status: string;
  form_type: string;
  treatment_band: string | null;
  date_of_acceptance: string;
  date_of_completion: string | null;
  patient_charge_pence: number;
  exemption_category: string;
  exemption_evidence_seen: boolean;
  patient_signature_received: boolean;
  submitted_at: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  patient: { id: string; full_name: string; nhs_number: string | null } | null;
  performer: {
    performer_number: string;
    staff: { full_name: string | null } | null;
  } | null;
}

type StatusFilter =
  | "all"
  | "DRAFT"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "PAID";

type DateRange = "30days" | "90days" | "this_month" | "all";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "READY_TO_SUBMIT", label: "Ready" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PAID", label: "Paid" },
];

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

export default function NHSClaims() {
  const { loading: authLoading } = useRequireAuth();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("30days");
  const [search, setSearch] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selection = useSelection();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: ?claim=<id> opens the detail sheet straight away. Used by
  // the "View in claims" toast action after creating a claim from the
  // calendar, so the user lands here with the new claim already focused.
  // We strip the param after consumption so a refresh doesn't re-open the
  // sheet unexpectedly.
  useEffect(() => {
    const claimParam = searchParams.get("claim");
    if (claimParam) {
      setSelectedClaimId(claimParam);
      searchParams.delete("claim");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const dateFilter = useMemo(() => {
    const now = new Date();
    if (dateRange === "all") return null;
    if (dateRange === "this_month") return format(startOfMonth(now), "yyyy-MM-dd");
    const days = dateRange === "30days" ? 30 : 90;
    return format(subDays(now, days), "yyyy-MM-dd");
  }, [dateRange]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("nhs_claim")
      .select(
        `id, status, form_type, treatment_band, date_of_acceptance, date_of_completion,
         patient_charge_pence, exemption_category, exemption_evidence_seen,
         patient_signature_received, submitted_at, paid_at, rejection_reason,
         patient:patient_id (id, full_name, nhs_number),
         performer:performer_id (performer_number, staff:staff_id (full_name))`,
      )
      .is("deleted_at", null)
      .order("date_of_acceptance", { ascending: false })
      .order("created_at", { ascending: false });

    // Filter by when the claim was *entered* (created_at), not the
    // clinical acceptance date. Otherwise a claim raised today for an
    // appointment from 6 weeks ago vanishes under the default 30-day
    // view and looks like the save failed.
    if (dateFilter) {
      query = query.gte("created_at", dateFilter);
    }

    const { data, error } = await query;
    if (error) {
      logger.error("Failed to load NHS claims", error);
      toast.error("Failed to load claims");
    } else {
      setClaims((data ?? []) as unknown as ClaimRow[]);
    }
    setLoading(false);
  }, [dateFilter]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  // Status counts for the tab badges. Computed against the date-filtered set
  // so the numbers match what the user will see on each tab.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: claims.length };
    for (const claim of claims) {
      c[claim.status] = (c[claim.status] ?? 0) + 1;
    }
    return c;
  }, [claims]);

  const filtered = useMemo(() => {
    let rows = claims;
    if (statusFilter !== "all") {
      rows = rows.filter((c) => c.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.patient?.full_name?.toLowerCase().includes(q) ||
          c.patient?.nhs_number?.includes(q) ||
          c.performer?.performer_number?.includes(q) ||
          c.performer?.staff?.full_name?.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [claims, statusFilter, search]);

  const readyCount = counts["READY_TO_SUBMIT"] ?? 0;

  // Bulk handlers operating on the user's selection (subset of `filtered`).
  // We pre-filter by source status before issuing the update so a
  // mixed-status selection can be safely transitioned — claims that
  // aren't eligible just get skipped instead of failing the whole batch.
  const selectedClaims = useMemo(
    () => filtered.filter((c) => selection.isSelected(c.id)),
    [filtered, selection],
  );
  const submittableSelected = selectedClaims.filter((c) => c.status === "READY_TO_SUBMIT");
  const payableSelected = selectedClaims.filter((c) =>
    ["SUBMITTED", "ACKNOWLEDGED", "ACCEPTED", "SCHEDULED_FOR_PAYMENT"].includes(c.status),
  );

  const bulkSubmitSelected = async () => {
    if (submittableSelected.length === 0) return;
    setBulkBusy(true);
    const ids = submittableSelected.map((c) => c.id);
    const { error } = await supabase
      .from("nhs_claim")
      .update({ status: "SUBMITTED", submitted_at: new Date().toISOString() })
      .in("id", ids);
    setBulkBusy(false);
    if (error) { toast.error(`Bulk submit failed: ${error.message}`); return; }
    toast.success(`Marked ${ids.length} claim${ids.length === 1 ? "" : "s"} as submitted`);
    selection.clear();
    await load();
  };

  const bulkMarkPaid = async () => {
    if (payableSelected.length === 0) return;
    setBulkBusy(true);
    const ids = payableSelected.map((c) => c.id);
    const { error } = await supabase
      .from("nhs_claim")
      .update({ status: "PAID", paid_at: new Date().toISOString() })
      .in("id", ids);
    setBulkBusy(false);
    if (error) { toast.error(`Bulk mark paid failed: ${error.message}`); return; }
    toast.success(`Marked ${ids.length} claim${ids.length === 1 ? "" : "s"} as paid`);
    selection.clear();
    await load();
  };

  const submitReady = async () => {
    if (readyCount === 0) return;
    if (
      !confirm(
        `Submit ${readyCount} claim${readyCount === 1 ? "" : "s"} marked as Ready? This stamps them as Submitted in our system. NHSBSA delivery is set up separately.`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("nhs_claim")
      .update({ status: "SUBMITTED", submitted_at: now })
      .eq("status", "READY_TO_SUBMIT")
      .is("deleted_at", null);
    setSubmitting(false);
    if (error) {
      toast.error(`Failed to submit: ${error.message}`);
    } else {
      toast.success(
        `Marked ${readyCount} claim${readyCount === 1 ? "" : "s"} as submitted`,
      );
      await load();
    }
  };

  if (authLoading) {
    return (
      <Layout title="NHS Claims">
        <PageLoading />
      </Layout>
    );
  }

  return (
    <Layout
      title="NHS Claims"
      description={
        <>
          <GlossaryTerm term="FP17" /> claim status, ready-to-submit queue, payment tracking
        </>
      }
    >
      <div className="space-y-4">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-2 border-b">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                statusFilter === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {counts[tab.value === "all" ? "all" : tab.value] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Filters + bulk submit */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search patient, NHS no., performer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30days">Entered last 30 days</SelectItem>
              <SelectItem value="90days">Entered last 90 days</SelectItem>
              <SelectItem value="this_month">Entered this month</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={submitReady}
            disabled={submitting || readyCount === 0}
            className="w-full sm:w-auto"
          >
            <Send className="h-4 w-4 mr-2" />
            {submitting
              ? "Submitting..."
              : readyCount > 0
              ? `Submit ${readyCount} ready`
              : "No ready claims"}
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <PageLoading variant="page" label="Loading claims..." />
        ) : filtered.length === 0 ? (
          claims.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No NHS claims yet"
              body="Claims appear here once you create one from a completed NHS appointment. Open the appointment, then use 'Create NHS claim'."
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No claims match these filters"
              body="Try a different status tab or date range."
            />
          )
        ) : (
          <div className="bg-card rounded-lg border divide-y">
            {/* Select-all-visible. Counts as "all" only when every visible
                row is selected — partial selections show unchecked here so
                clicking toggles to "all selected" deterministically. */}
            <div className="flex items-center gap-3 p-2 px-4 bg-muted/20 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                aria-label="Select all visible claims"
                checked={filtered.length > 0 && filtered.every((c) => selection.isSelected(c.id))}
                onChange={(e) => {
                  selection.setAll(e.target.checked ? filtered.map((c) => c.id) : []);
                }}
              />
              <span>Select all visible</span>
            </div>
            {filtered.map((claim) => (
              <div key={claim.id} className="flex items-center gap-3 px-4 hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded shrink-0"
                  aria-label={`Select claim for ${claim.patient?.full_name ?? "patient"}`}
                  checked={selection.isSelected(claim.id)}
                  onChange={() => selection.toggle(claim.id)}
                />
                <div className="flex-1 min-w-0">
                  <ClaimRow
                    claim={claim}
                    onClick={() => setSelectedClaimId(claim.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NHSClaimDetailSheet
        claimId={selectedClaimId}
        onOpenChange={(o) => {
          if (!o) setSelectedClaimId(null);
        }}
        onChanged={load}
      />

      <BulkActionBar
        count={selection.count}
        noun={selection.count === 1 ? "claim" : "claims"}
        busy={bulkBusy}
        onClear={selection.clear}
        actions={[
          ...(submittableSelected.length > 0
            ? [{
                key: "submit",
                label: `Submit ${submittableSelected.length}`,
                icon: Send,
                variant: "default" as const,
                onClick: bulkSubmitSelected,
              }]
            : []),
          ...(payableSelected.length > 0
            ? [{
                key: "paid",
                label: `Mark ${payableSelected.length} paid`,
                icon: CheckCircle2,
                variant: "outline" as const,
                onClick: bulkMarkPaid,
              }]
            : []),
        ]}
      />
    </Layout>
  );
}

function ClaimRow({
  claim,
  onClick,
}: {
  claim: ClaimRow;
  onClick: () => void;
}) {
  const statusClass = STATUS_BADGE[claim.status] ?? "bg-muted text-muted-foreground";
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {claim.patient?.full_name ?? "—"}
          </span>
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${statusClass}`}
          >
            {claim.status.replace(/_/g, " ").toLowerCase()}
          </span>
          {claim.form_type !== "FP17" && (
            <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {claim.form_type}
            </span>
          )}
          {claim.treatment_band && (
            <span className="text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-1.5 py-0.5 rounded">
              {claim.treatment_band.replace(/_/g, " ").toLowerCase()}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>NHS {claim.patient?.nhs_number ?? "—"}</span>
          {claim.performer && (
            <>
              <span>·</span>
              <span>
                Performer {claim.performer.performer_number}
                {claim.performer.staff?.full_name && (
                  <span className="ml-1 text-muted-foreground/70">
                    ({claim.performer.staff.full_name})
                  </span>
                )}
              </span>
            </>
          )}
          <span>·</span>
          <span>
            Accepted {format(parseISO(claim.date_of_acceptance), "d MMM yyyy")}
          </span>
        </div>
        {claim.status === "REJECTED" && claim.rejection_reason && (
          <div className="text-xs text-red-700 dark:text-red-300 mt-1 flex items-start gap-1">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>{claim.rejection_reason}</span>
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium">
          {formatPrice(claim.patient_charge_pence)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {claim.exemption_category !== "NONE" && (
            <span
              className={
                claim.exemption_evidence_seen
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-700 dark:text-amber-300"
              }
            >
              {claim.exemption_evidence_seen ? "Evidence verified" : "Evidence pending"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

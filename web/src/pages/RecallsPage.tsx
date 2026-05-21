import { useEffect, useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/Badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useSelection } from "@/hooks/useSelection";
import { BulkActionBar } from "@/components/BulkActionBar";
import { EmptyState } from "@/components/EmptyState";

interface RecallRow {
  id: string;
  patient_id: string;
  service_id: string | null;
  due_date: string;
  reminder_sent_at: string | null;
  reminder_count: number;
  status: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  patient?: { full_name: string } | null;
  service?: { name: string } | null;
}

export default function RecallsPage() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();
  const [recalls, setRecalls] = useState<RecallRow[]>([]);
  const [loadingRecalls, setLoadingRecalls] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const selection = useSelection();
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (!loading) loadRecalls();
  }, [loading]);

  const loadRecalls = async () => {
    setLoadingRecalls(true);
    const { data, error } = await supabase
      .from("recall")
      .select("*, patient:patient_id(full_name), service:service_id(name)")
      .order("due_date", { ascending: true });

    if (error) {
      logger.error("Error loading recalls", error);
    } else {
      setRecalls(data || []);
    }
    setLoadingRecalls(false);
  };

  const markComplete = async (recallId: string) => {
    const { error } = await supabase
      .from("recall")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", recallId);

    if (error) {
      toast.error("Failed to complete recall");
    } else {
      toast.success("Recall marked as completed");
      loadRecalls();
    }
  };

  const cancelRecall = async (recallId: string) => {
    const { error } = await supabase
      .from("recall")
      .update({ status: "CANCELLED" })
      .eq("id", recallId);

    if (error) {
      toast.error("Failed to cancel recall");
    } else {
      toast.success("Recall cancelled");
      loadRecalls();
    }
  };

  // Bulk handlers — apply the same transition to every selected row in one
  // round-trip. RLS scopes the .in() to the caller's practice; the UI
  // restricts selection to ACTIVE rows, so the undo can safely flip every
  // affected row back to ACTIVE.
  const undoBulkToActive = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("recall")
      .update({ status: "ACTIVE", completed_at: null })
      .in("id", ids);
    if (error) { toast.error("Couldn't undo"); return; }
    toast.success(`Restored ${ids.length} ${label}`);
    loadRecalls();
  };

  const bulkMarkComplete = async () => {
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("recall")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .in("id", ids);
    setBulkBusy(false);
    if (error) { toast.error("Bulk action failed"); return; }
    toast.success(`Marked ${ids.length} recall${ids.length === 1 ? "" : "s"} as complete`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => undoBulkToActive(ids, ids.length === 1 ? "recall" : "recalls"),
      },
    });
    selection.clear();
    loadRecalls();
  };

  const bulkCancel = async () => {
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("recall")
      .update({ status: "CANCELLED" })
      .in("id", ids);
    setBulkBusy(false);
    if (error) { toast.error("Bulk action failed"); return; }
    toast.success(`Cancelled ${ids.length} recall${ids.length === 1 ? "" : "s"}`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => undoBulkToActive(ids, ids.length === 1 ? "recall" : "recalls"),
      },
    });
    selection.clear();
    loadRecalls();
  };

  const today = startOfDay(new Date());

  const filtered = useMemo(() => {
    let result = recalls;

    // Status filter
    if (statusFilter === "OVERDUE") {
      result = result.filter((r) => r.status === "ACTIVE" && isBefore(parseISO(r.due_date), today));
    } else if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Search
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      result = result.filter((r) =>
        r.patient?.full_name?.toLowerCase().includes(s) ||
        r.service?.name?.toLowerCase().includes(s)
      );
    }

    return result;
  }, [recalls, statusFilter, searchTerm, today]);

  const overdueCount = recalls.filter((r) => r.status === "ACTIVE" && isBefore(parseISO(r.due_date), today)).length;
  const activeCount = recalls.filter((r) => r.status === "ACTIVE").length;

  if (loading) {
    return <Layout title="Recalls"><div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div></Layout>;
  }

  return (
    <Layout title="Recalls">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search patient or service..."
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active ({activeCount})</SelectItem>
              <SelectItem value="OVERDUE">Overdue ({overdueCount})</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="ALL">All</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={loadRecalls}>
            <RotateCcw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* List */}
        {loadingRecalls ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="No recalls found"
            body={
              statusFilter === "OVERDUE"
                ? "No overdue recalls — great!"
                : "Recalls are auto-created when appointments with recall-enabled services are completed."
            }
          />
        ) : (
          <div className="bg-card rounded-lg border divide-y">
            {/* Select-all-active row — checkboxes only appear when there's
                at least one active recall in the current filter. Inactive
                rows aren't bulk-actionable so they're not selectable. */}
            {filtered.some((r) => r.status === "ACTIVE") && (
              <div className="flex items-center gap-3 p-2 px-4 bg-muted/20 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  aria-label="Select all active recalls"
                  checked={
                    filtered
                      .filter((r) => r.status === "ACTIVE")
                      .every((r) => selection.isSelected(r.id)) &&
                    filtered.some((r) => r.status === "ACTIVE")
                  }
                  onChange={(e) => {
                    const activeIds = filtered
                      .filter((r) => r.status === "ACTIVE")
                      .map((r) => r.id);
                    selection.setAll(e.target.checked ? activeIds : []);
                  }}
                />
                <span>Select all active</span>
              </div>
            )}
            {filtered.map((recall) => {
              const isOverdue = recall.status === "ACTIVE" && isBefore(parseISO(recall.due_date), today);
              const dueDate = parseISO(recall.due_date);
              const canSelect = recall.status === "ACTIVE";

              return (
                <div key={recall.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                  {canSelect ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded shrink-0"
                      aria-label={`Select recall for ${recall.patient?.full_name ?? "patient"}`}
                      checked={selection.isSelected(recall.id)}
                      onChange={() => selection.toggle(recall.id)}
                    />
                  ) : (
                    // Reserve the column width so non-active rows align
                    // with the active ones above/below.
                    <span className="h-4 w-4 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/patients/${recall.patient_id}`)}
                        className="font-medium text-sm hover:underline truncate"
                      >
                        {recall.patient?.full_name || "Unknown"}
                      </button>
                      {isOverdue && (
                        <span className="text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium shrink-0">
                          Overdue
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{recall.service?.name || "General"}</span>
                      <span>&middot;</span>
                      <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                        Due {format(dueDate, "d MMM yyyy")}
                      </span>
                      {recall.reminder_count > 0 && (
                        <>
                          <span>&middot;</span>
                          <span>{recall.reminder_count} reminder{recall.reminder_count !== 1 ? "s" : ""} sent</span>
                        </>
                      )}
                    </div>
                  </div>

                  {recall.status === "ACTIVE" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => markComplete(recall.id)} className="h-7 text-xs text-green-700 hover:text-green-800 hover:bg-green-50" title="Mark as completed">
                        <Check className="h-3.5 w-3.5 mr-1" /> Done
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancelRecall(recall.id)} className="h-7 text-xs text-muted-foreground" title="Cancel recall">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {recall.status === "COMPLETED" && (
                    <span className="text-xs text-green-600 font-medium shrink-0">Completed</span>
                  )}
                  {recall.status === "CANCELLED" && (
                    <span className="text-xs text-muted-foreground shrink-0">Cancelled</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BulkActionBar
        count={selection.count}
        noun={selection.count === 1 ? "recall" : "recalls"}
        busy={bulkBusy}
        onClear={selection.clear}
        actions={[
          { key: "complete", label: "Mark complete", icon: Check, variant: "default", onClick: bulkMarkComplete },
          { key: "cancel",   label: "Cancel",                                          onClick: bulkCancel },
        ]}
      />
    </Layout>
  );
}

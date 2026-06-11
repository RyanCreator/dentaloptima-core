import { useEffect, useState, useMemo, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/Badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Search, Check, X, UserX, Phone, Mail, BellRing, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useSelection } from "@/hooks/useSelection";
import { BulkActionBar } from "@/components/BulkActionBar";
import { EmptyState } from "@/components/EmptyState";
import { PatientStatusDialog } from "@/components/patient/PatientStatusDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// `recall_status` enum from the DB: PENDING, REMINDED, BOOKED, COMPLETED,
// MISSED, CANCELLED. The page treats PENDING and REMINDED together as
// "active" (i.e. still outstanding); see ACTIVE_STATUSES below.
const ACTIVE_STATUSES = ["PENDING", "REMINDED"] as const;

interface RecallRow {
  id: string;
  patient_id: string;
  service_id: string | null;
  due_date: string;
  reminded_at: string | null;
  reminder_count: number;
  status: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  patient?: {
    full_name: string;
    email: string | null;
    phone: string | null;
    phone_alt: string | null;
  } | null;
  service?: { name: string } | null;
}

interface PracticeInfo {
  name: string;
  phone: string | null;
  email: string | null;
}

export default function RecallsPage() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();
  const [recalls, setRecalls] = useState<RecallRow[]>([]);
  const [loadingRecalls, setLoadingRecalls] = useState(true);
  // First-load gate so refetches (e.g. after bulk actions) don't flash
  // the list empty before the new data lands.
  const hasLoadedOnce = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const selection = useSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [inactiveTarget, setInactiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [practice, setPractice] = useState<PracticeInfo | null>(null);

  useEffect(() => {
    if (!loading) {
      loadRecalls();
      loadPractice();
    }
  }, [loading]);

  // Practice name + phone power the recall email template (so patients know
  // who's contacting them and how to book). RLS scopes this to the caller's
  // own practice, so a single row comes back.
  const loadPractice = async () => {
    const { data } = await supabase
      .from("practice")
      .select("name, primary_phone, primary_email")
      .limit(1)
      .maybeSingle();
    if (data) {
      setPractice({ name: data.name, phone: data.primary_phone, email: data.primary_email });
    }
  };

  const loadRecalls = async () => {
    if (!hasLoadedOnce.current) setLoadingRecalls(true);
    const { data, error } = await supabase
      .from("recall")
      .select("*, patient:patient_id(full_name, email, phone, phone_alt), service:service_id(name)")
      .order("due_date", { ascending: true });

    if (error) {
      logger.error("Error loading recalls", error);
    } else {
      setRecalls((data as RecallRow[]) || []);
    }
    hasLoadedOnce.current = true;
    setLoadingRecalls(false);
  };

  // --- Contacting patients -------------------------------------------------
  // The app has no patient-email backend, so "email" opens the operator's own
  // mail client via a mailto: with a pre-filled recall template. Predictable
  // by design: launching a call/email NEVER changes recall status — the
  // operator explicitly marks "reminded" once they've actually made contact.

  const buildRecallEmail = (patientName?: string): { subject: string; body: string } => {
    const pname = practice?.name ?? "our practice";
    const greeting = patientName ? `Dear ${patientName},` : "Hello,";
    const bookLine = practice?.phone
      ? `To book an appointment, please call us on ${practice.phone} or simply reply to this email.`
      : "To book an appointment, please reply to this email and we'll find you a slot.";
    const body = [
      greeting,
      "",
      `Our records show you're due for your routine dental check-up at ${pname}.`,
      bookLine,
      "",
      "We look forward to seeing you.",
      "",
      "Kind regards,",
      pname,
    ].join("\n");
    return { subject: `Time for your dental check-up — ${pname}`, body };
  };

  const mailtoHref = (opts: { to?: string; bcc?: string[]; patientName?: string }): string => {
    const { subject, body } = buildRecallEmail(opts.patientName);
    const parts: string[] = [];
    if (opts.bcc?.length) parts.push(`bcc=${encodeURIComponent(opts.bcc.join(","))}`);
    parts.push(`subject=${encodeURIComponent(subject)}`);
    parts.push(`body=${encodeURIComponent(body)}`);
    return `mailto:${opts.to ?? ""}?${parts.join("&")}`;
  };

  const markReminded = async (recall: RecallRow) => {
    const { error } = await supabase
      .from("recall")
      .update({
        status: "REMINDED",
        reminded_at: new Date().toISOString(),
        reminder_count: recall.reminder_count + 1,
      })
      .eq("id", recall.id);
    if (error) {
      toast.error("Couldn't mark as reminded");
    } else {
      toast.success(`Marked ${recall.patient?.full_name ?? "patient"} as reminded`);
      loadRecalls();
    }
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
  // restricts selection to active (PENDING/REMINDED) rows.
  //
  // Undo restores each row's exact prior state. We snapshot status,
  // completed_at, reminded_at and reminder_count and replay them per-row
  // (reminder_count differs per row, so this can't be a single bulk update).
  type RecallSnapshot = {
    id: string;
    status: string;
    completed_at: string | null;
    reminded_at: string | null;
    reminder_count: number;
  };
  const snapshot = (r: RecallRow): RecallSnapshot => ({
    id: r.id,
    status: r.status,
    completed_at: r.completed_at,
    reminded_at: r.reminded_at,
    reminder_count: r.reminder_count,
  });

  const undoBulk = async (snapshots: RecallSnapshot[], label: string) => {
    if (snapshots.length === 0) return;
    const results = await Promise.all(
      snapshots.map((s) =>
        supabase
          .from("recall")
          .update({
            status: s.status as Enums<"recall_status">,
            completed_at: s.completed_at,
            reminded_at: s.reminded_at,
            reminder_count: s.reminder_count,
          })
          .eq("id", s.id),
      ),
    );
    if (results.some((r) => r.error)) {
      toast.error("Couldn't undo");
    } else {
      toast.success(`Restored ${snapshots.length} ${label}`);
    }
    loadRecalls();
  };

  const bulkMarkComplete = async () => {
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    // Snapshot the pre-update state so undo can restore per-row.
    const snapshots = recalls.filter((r) => ids.includes(r.id)).map(snapshot);
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
        onClick: () => undoBulk(snapshots, ids.length === 1 ? "recall" : "recalls"),
      },
    });
    selection.clear();
    loadRecalls();
  };

  const bulkCancel = async () => {
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    const snapshots = recalls.filter((r) => ids.includes(r.id)).map(snapshot);
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
        onClick: () => undoBulk(snapshots, ids.length === 1 ? "recall" : "recalls"),
      },
    });
    selection.clear();
    loadRecalls();
  };

  // Mark every selected row as reminded (contacted). reminder_count differs
  // per row, so we fan out one update each rather than a single bulk update.
  const bulkMarkReminded = async () => {
    const ids = Array.from(selection.selected);
    const rows = recalls.filter((r) => ids.includes(r.id));
    if (rows.length === 0) return;
    const snapshots = rows.map(snapshot);
    const now = new Date().toISOString();
    setBulkBusy(true);
    const results = await Promise.all(
      rows.map((r) =>
        supabase
          .from("recall")
          .update({ status: "REMINDED", reminded_at: now, reminder_count: r.reminder_count + 1 })
          .eq("id", r.id),
      ),
    );
    setBulkBusy(false);
    if (results.some((r) => r.error)) { toast.error("Some updates failed"); loadRecalls(); return; }
    toast.success(`Marked ${rows.length} as reminded`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => undoBulk(snapshots, rows.length === 1 ? "recall" : "recalls"),
      },
    });
    selection.clear();
    loadRecalls();
  };

  // Open one email to all selected patients who have an address on file, with
  // them in BCC (each recipient only sees their own copy). No status change —
  // the operator marks "reminded" after the email actually goes out. For very
  // large batches a mailto: URL gets unwieldy, so we copy the addresses to the
  // clipboard instead and let the operator paste them into their mail client.
  const bulkEmailSelected = () => {
    const rows = recalls.filter((r) => selection.selected.has(r.id));
    const emails = [
      ...new Set(
        rows
          .map((r) => r.patient?.email?.trim())
          .filter((e): e is string => !!e),
      ),
    ];
    if (emails.length === 0) {
      toast.error("None of the selected patients have an email on file — call them instead");
      return;
    }
    const without = rows.length - emails.length;
    if (emails.length > 40) {
      void navigator.clipboard?.writeText(emails.join(", "));
      toast.success(`${emails.length} email addresses copied — paste into the BCC field of a new email`);
      return;
    }
    window.location.href = mailtoHref({ bcc: emails });
    if (without > 0) {
      toast.info(`${without} selected patient${without === 1 ? " has" : "s have"} no email — call them instead`);
    }
  };

  const today = startOfDay(new Date());

  const filtered = useMemo(() => {
    let result = recalls;

    // Status filter. "ACTIVE" is a UI umbrella — the DB has no such enum
    // value; PENDING and REMINDED are both "active" for the operator's
    // purposes. "OVERDUE" is the same set, narrowed to due_date < today.
    if (statusFilter === "ACTIVE") {
      result = result.filter((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status));
    } else if (statusFilter === "OVERDUE") {
      result = result.filter(
        (r) =>
          (ACTIVE_STATUSES as readonly string[]).includes(r.status) &&
          isBefore(parseISO(r.due_date), today),
      );
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

  const overdueCount = recalls.filter(
    (r) =>
      (ACTIVE_STATUSES as readonly string[]).includes(r.status) &&
      isBefore(parseISO(r.due_date), today),
  ).length;
  const activeCount = recalls.filter((r) =>
    (ACTIVE_STATUSES as readonly string[]).includes(r.status),
  ).length;

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
            {filtered.some((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status)) && (
              <div className="flex items-center gap-3 p-2 px-4 bg-muted/20 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  aria-label="Select all active recalls"
                  checked={
                    filtered
                      .filter((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status))
                      .every((r) => selection.isSelected(r.id)) &&
                    filtered.some((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status))
                  }
                  onChange={(e) => {
                    const activeIds = filtered
                      .filter((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status))
                      .map((r) => r.id);
                    selection.setAll(e.target.checked ? activeIds : []);
                  }}
                />
                <span>Select all active</span>
              </div>
            )}
            {filtered.map((recall) => {
              const isOverdue = (ACTIVE_STATUSES as readonly string[]).includes(recall.status) && isBefore(parseISO(recall.due_date), today);
              const dueDate = parseISO(recall.due_date);
              const canSelect = (ACTIVE_STATUSES as readonly string[]).includes(recall.status);
              const phone = recall.patient?.phone || recall.patient?.phone_alt || null;
              const email = recall.patient?.email || null;

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
                    {/* Contact line — phone + email shown so the operator can
                        read/copy them, and tap to call or open a recall email.
                        Only on active rows (closed recalls don't get chased). */}
                    {canSelect && (
                      <div className="text-xs mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {phone ? (
                          <a
                            href={`tel:${phone.replace(/\s+/g, "")}`}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline"
                            title="Call patient"
                          >
                            <Phone className="h-3 w-3 shrink-0" /> {phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground/60 italic">No phone</span>
                        )}
                        {email ? (
                          <a
                            href={mailtoHref({ to: email, patientName: recall.patient?.full_name })}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline truncate max-w-[220px]"
                            title="Open a recall email to this patient"
                          >
                            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{email}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground/60 italic">No email</span>
                        )}
                      </div>
                    )}
                  </div>

                  {(ACTIVE_STATUSES as readonly string[]).includes(recall.status) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {phone && (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-primary" title="Call patient">
                          <a href={`tel:${phone.replace(/\s+/g, "")}`}>
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {email && (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-primary" title="Email a recall reminder">
                          <a href={mailtoHref({ to: email, patientName: recall.patient?.full_name })}>
                            <Mail className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => markReminded(recall)} className="h-7 px-2 text-xs text-muted-foreground hover:text-blue-700" title="Mark as reminded (contacted)">
                        <BellRing className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => markComplete(recall.id)} className="h-7 text-xs text-green-700 hover:text-green-800 hover:bg-green-50" title="Patient booked / done">
                        <Check className="h-3.5 w-3.5 mr-1" /> Done
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" title="More actions">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              setInactiveTarget({
                                id: recall.patient_id,
                                name: recall.patient?.full_name ?? "this patient",
                              })
                            }
                          >
                            <UserX className="h-4 w-4 mr-2" /> Not returning
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => cancelRecall(recall.id)}>
                            <X className="h-4 w-4 mr-2" /> Cancel recall
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
          { key: "email",    label: "Email selected", icon: Mail,     onClick: bulkEmailSelected },
          { key: "reminded", label: "Mark reminded",  icon: BellRing, onClick: bulkMarkReminded },
          { key: "complete", label: "Mark complete",  icon: Check, variant: "default", onClick: bulkMarkComplete },
          { key: "cancel",   label: "Cancel",                          onClick: bulkCancel },
        ]}
      />
      {inactiveTarget && (
        <PatientStatusDialog
          patientId={inactiveTarget.id}
          patientName={inactiveTarget.name}
          mode="inactive"
          open={!!inactiveTarget}
          onOpenChange={(o) => !o && setInactiveTarget(null)}
          onDone={loadRecalls}
        />
      )}
    </Layout>
  );
}

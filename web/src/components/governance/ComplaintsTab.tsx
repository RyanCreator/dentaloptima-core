import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, MessageSquareWarning, Clock } from "lucide-react";
import { GovernanceStatusPill } from "@/components/governance/GovernanceStatusPill";
import { NewComplaintSheet } from "@/components/governance/NewComplaintSheet";
import { addWorkingDays, workingDaysBetween } from "@/lib/workingDays";
import { cn } from "@/lib/utils";

interface ComplaintRow {
  id: string;
  complainant_name: string;
  patient_id: string | null;
  received_at: string;
  received_via: string;
  acknowledged_at: string | null;
  status: string;
  summary: string;
  escalated_to_ombudsman: boolean;
  patient?: { full_name: string | null } | null;
}

const METHOD_LABEL: Record<string, string> = {
  IN_PERSON: "In person",
  PHONE: "Phone",
  EMAIL: "Email",
  LETTER: "Letter",
  WEBSITE: "Website",
  SOCIAL_MEDIA: "Social media",
  OTHER: "Other",
};

interface ComplaintsTabProps {
  onChange?: () => void;
}

export function ComplaintsTab({ onChange }: ComplaintsTabProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("complaint")
      .select(`
        id, complainant_name, patient_id, received_at, received_via,
        acknowledged_at, status, summary, escalated_to_ombudsman,
        patient:patient_id(full_name)
      `)
      .is("deleted_at", null)
      .order("received_at", { ascending: false });

    if (error) logger.error("complaints load failed", error);
    else setItems((data as unknown as ComplaintRow[]) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter === "OPEN") {
      result = result.filter((r) =>
        ["NEW", "ACKNOWLEDGED", "UNDER_INVESTIGATION", "RESPONDED"].includes(r.status),
      );
    } else if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((r) =>
        r.summary.toLowerCase().includes(s) ||
        r.complainant_name.toLowerCase().includes(s) ||
        r.patient?.full_name?.toLowerCase().includes(s),
      );
    }
    return result;
  }, [items, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search summary, complainant, patient..."
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="NEW">New</SelectItem>
            <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
            <SelectItem value="UNDER_INVESTIGATION">Under investigation</SelectItem>
            <SelectItem value="RESPONDED">Responded</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="ESCALATED_TO_OMBUDSMAN">Escalated</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => setShowNew(true)} className="sm:ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Record complaint
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <MessageSquareWarning className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">No complaints</p>
          <p className="text-sm mt-1">
            {items.length === 0
              ? "Use 'Record complaint' to log patient feedback. CQC requires acknowledgement within 3 working days."
              : "No complaints match the current filters."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border divide-y">
          {filtered.map((r) => {
            const ack = ackStatusFor(r);
            return (
              <button
                key={r.id}
                onClick={() => navigate(`/governance/complaints/${r.id}`)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{r.summary}</span>
                    <GovernanceStatusPill kind="complaint" value={r.status} />
                    {ack && (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium uppercase tracking-wide",
                        ack.tone === "overdue" ? "bg-red-100 text-red-700"
                          : ack.tone === "due"  ? "bg-amber-100 text-amber-700"
                                                : "bg-blue-100 text-blue-700",
                      )}>
                        <Clock className="h-3 w-3" /> {ack.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                    <span>From {r.complainant_name}</span>
                    <span>·</span>
                    <span>{METHOD_LABEL[r.received_via] ?? r.received_via}</span>
                    <span>·</span>
                    <span>Received {format(parseISO(r.received_at), "d MMM yyyy")}</span>
                    {r.patient?.full_name && (<><span>·</span><span>Patient: {r.patient.full_name}</span></>)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <NewComplaintSheet
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={() => { void load(); onChange?.(); }}
      />
    </div>
  );
}

// Returns acknowledgement countdown info — or null if not relevant.
// Statuses past NEW have already been acknowledged so there's no clock.
function ackStatusFor(r: ComplaintRow):
  | { tone: "overdue" | "due" | "ahead"; label: string }
  | null {
  if (r.status !== "NEW") return null;

  const deadline = addWorkingDays(parseISO(r.received_at), 3);
  const now = new Date();
  const days = workingDaysBetween(now, deadline);

  if (days < 0) return { tone: "overdue", label: `Overdue by ${Math.abs(days)}d` };
  if (days === 0) return { tone: "due", label: "Due today" };
  if (days <= 1) return { tone: "due", label: `${days}d left` };
  return { tone: "ahead", label: `${days}d left` };
}

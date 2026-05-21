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
import { Search, Plus, AlertTriangle } from "lucide-react";
import { GovernanceStatusPill } from "@/components/governance/GovernanceStatusPill";
import { NewIncidentSheet } from "@/components/governance/NewIncidentSheet";

interface IncidentRow {
  id: string;
  incident_type: string;
  severity: string;
  status: string;
  occurred_at: string;
  reported_at: string;
  location: string | null;
  summary: string;
  reported_by_member?: { full_name: string | null } | null;
  patient?: { full_name: string | null } | null;
}

const TYPE_LABEL: Record<string, string> = {
  CLINICAL: "Clinical",
  NEAR_MISS: "Near miss",
  EQUIPMENT_FAILURE: "Equipment failure",
  NEEDLESTICK: "Needlestick",
  INFECTION_CONTROL: "Infection control",
  MEDICATION_ERROR: "Medication error",
  PATIENT_FALL: "Patient fall",
  DATA_BREACH: "Data breach",
  STAFF_INJURY: "Staff injury",
  OTHER: "Other",
};

interface IncidentsTabProps {
  onChange?: () => void;
}

export function IncidentsTab({ onChange }: IncidentsTabProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("incident_report")
      .select(`
        id, incident_type, severity, status, occurred_at, reported_at, location, summary,
        reported_by_member:reported_by(full_name),
        patient:patient_id(full_name)
      `)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false });

    if (error) logger.error("incidents load failed", error);
    else setItems((data as unknown as IncidentRow[]) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter === "OPEN") {
      result = result.filter((r) =>
        ["REPORTED", "UNDER_INVESTIGATION", "ACTION_REQUIRED"].includes(r.status),
      );
    } else if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (typeFilter !== "ALL") result = result.filter((r) => r.incident_type === typeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((r) =>
        r.summary.toLowerCase().includes(s) ||
        r.location?.toLowerCase().includes(s) ||
        r.patient?.full_name?.toLowerCase().includes(s),
      );
    }
    return result;
  }, [items, statusFilter, typeFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search summary, location, patient..."
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="REPORTED">Reported</SelectItem>
            <SelectItem value="UNDER_INVESTIGATION">Under investigation</SelectItem>
            <SelectItem value="ACTION_REQUIRED">Action required</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setShowNew(true)} className="sm:ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Log incident
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">No incidents</p>
          <p className="text-sm mt-1">
            {items.length === 0
              ? "Use 'Log incident' to record clinical events, near-misses, equipment failures, or data breaches."
              : "No incidents match the current filters."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border divide-y">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/governance/incidents/${r.id}`)}
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{r.summary}</span>
                  <GovernanceStatusPill kind="incident" value={r.status} />
                  <GovernanceStatusPill kind="severity" value={r.severity} />
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span>{TYPE_LABEL[r.incident_type] ?? r.incident_type}</span>
                  <span>·</span>
                  <span>{format(parseISO(r.occurred_at), "d MMM yyyy, HH:mm")}</span>
                  {r.location && (<><span>·</span><span>{r.location}</span></>)}
                  {r.patient?.full_name && (<><span>·</span><span>Patient: {r.patient.full_name}</span></>)}
                  {r.reported_by_member?.full_name && (
                    <><span>·</span><span>Reported by {r.reported_by_member.full_name}</span></>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <NewIncidentSheet
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={() => { void load(); onChange?.(); }}
      />
    </div>
  );
}

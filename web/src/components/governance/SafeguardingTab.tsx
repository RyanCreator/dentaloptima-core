import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Shield, Lock } from "lucide-react";
import { GovernanceStatusPill } from "@/components/governance/GovernanceStatusPill";
import { NewSafeguardingSheet } from "@/components/governance/NewSafeguardingSheet";

interface SafeguardingRow {
  id: string;
  concern_type: string;
  status: string;
  raised_at: string;
  raised_by: string;
  patient_id: string | null;
  description: string;
  patient?: { full_name: string | null } | null;
  raised_by_member?: { full_name: string | null } | null;
}

const TYPE_LABEL: Record<string, string> = {
  CHILD: "Child",
  ADULT_AT_RISK: "Adult at risk",
  DOMESTIC_ABUSE: "Domestic abuse",
  MENTAL_CAPACITY: "Mental capacity",
  NEGLECT: "Neglect",
  PHYSICAL_ABUSE: "Physical abuse",
  OTHER: "Other",
};

interface SafeguardingTabProps {
  onChange?: () => void;
}

export function SafeguardingTab({ onChange }: SafeguardingTabProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";

  const [items, setItems] = useState<SafeguardingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { void load(); }, []);

  // RLS already restricts what we get back (only the raiser or admins see
  // a given row) — so we just fetch and trust the filter.
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("safeguarding_concern")
      .select(`
        id, concern_type, status, raised_at, raised_by, patient_id, description,
        patient:patient_id(full_name),
        raised_by_member:raised_by(full_name)
      `)
      .is("deleted_at", null)
      .order("raised_at", { ascending: false });

    if (error) logger.error("safeguarding load failed", error);
    else setItems((data as unknown as SafeguardingRow[]) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter === "OPEN") {
      result = result.filter((r) =>
        ["IDENTIFIED", "INTERNAL_REVIEW"].includes(r.status),
      );
    } else if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (typeFilter !== "ALL") result = result.filter((r) => r.concern_type === typeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((r) =>
        r.description.toLowerCase().includes(s) ||
        r.patient?.full_name?.toLowerCase().includes(s),
      );
    }
    return result;
  }, [items, statusFilter, typeFilter, search]);

  return (
    <div className="space-y-4">
      {/* Confidentiality note. Even though RLS enforces this, surfacing it
          on the page means staff don't wonder why their colleague's row
          isn't showing up — and admins are reminded what they're seeing. */}
      <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 flex items-start gap-2">
        <Lock className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-900">
          <p className="font-semibold">Confidential</p>
          <p className="mt-0.5">
            {isAdmin
              ? "As a practice admin, you see all safeguarding concerns. Discuss only on a need-to-know basis."
              : "You see only the concerns you raised. Practice admins see all concerns."}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description or patient..."
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IDENTIFIED">Identified</SelectItem>
            <SelectItem value="INTERNAL_REVIEW">Internal review</SelectItem>
            <SelectItem value="REFERRED_LOCAL_AUTHORITY">Referred — Local authority</SelectItem>
            <SelectItem value="REFERRED_POLICE">Referred — Police</SelectItem>
            <SelectItem value="CLOSED_NO_ACTION">Closed — No action</SelectItem>
            <SelectItem value="CLOSED_ACTIONED">Closed — Actioned</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setShowNew(true)} className="sm:ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Raise concern
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">No safeguarding concerns</p>
          <p className="text-sm mt-1">
            {items.length === 0
              ? "Use 'Raise concern' if you have a safeguarding worry about a child, adult at risk, or anyone you've seen at the practice."
              : "No concerns match the current filters."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border divide-y">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/governance/safeguarding/${r.id}`)}
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">
                    {TYPE_LABEL[r.concern_type] ?? r.concern_type}
                    {r.patient?.full_name && ` — ${r.patient.full_name}`}
                  </span>
                  <GovernanceStatusPill kind="safeguarding" value={r.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span>Raised {format(parseISO(r.raised_at), "d MMM yyyy")}</span>
                  {r.raised_by_member?.full_name && (
                    <><span>·</span><span>By {r.raised_by_member.full_name}</span></>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <NewSafeguardingSheet
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={() => { void load(); onChange?.(); }}
      />
    </div>
  );
}

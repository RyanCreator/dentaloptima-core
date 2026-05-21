import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, FileBadge, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { NewPolicySheet } from "@/components/governance/NewPolicySheet";
import { cn } from "@/lib/utils";

interface PolicyRow {
  id: string;
  category: string;
  title: string;
  version: string;
  effective_from: string;
  next_review_date: string | null;
  is_active: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  INFECTION_CONTROL: "Infection control",
  SAFEGUARDING: "Safeguarding",
  COMPLAINTS: "Complaints",
  INFORMATION_GOVERNANCE: "Information governance",
  EQUALITY_DIVERSITY: "Equality & diversity",
  HEALTH_SAFETY: "Health & safety",
  CLINICAL_GOVERNANCE: "Clinical governance",
  WHISTLEBLOWING: "Whistleblowing",
  CONSENT: "Consent",
  BUSINESS_CONTINUITY: "Business continuity",
  OTHER: "Other",
};

interface PoliciesTabProps {
  onChange?: () => void;
}

export function PoliciesTab({ onChange }: PoliciesTabProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";

  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [myAckedIds, setMyAckedIds] = useState<Set<string>>(new Set());
  const [totalStaff, setTotalStaff] = useState(0);
  // For admin: per-policy total acks. Cheap aggregate.
  const [ackCounts, setAckCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!auth.member) return;
    void load(auth.member.id);
  }, [auth.member]);

  const load = async (memberId: string) => {
    setLoading(true);

    const [policiesRes, acksRes, staffRes] = await Promise.all([
      supabase
        .from("policy")
        .select("id, category, title, version, effective_from, next_review_date, is_active")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("category"),
      supabase
        .from("policy_acknowledgement")
        .select("policy_id, staff_id"),
      supabase
        .from("practice_member")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

    if (policiesRes.error) logger.error("policy load failed", policiesRes.error);
    setPolicies((policiesRes.data as PolicyRow[]) ?? []);

    if (acksRes.data) {
      const myIds = new Set<string>();
      const counts: Record<string, number> = {};
      acksRes.data.forEach((a) => {
        if (a.staff_id === memberId) myIds.add(a.policy_id);
        counts[a.policy_id] = (counts[a.policy_id] ?? 0) + 1;
      });
      setMyAckedIds(myIds);
      setAckCounts(counts);
    }

    setTotalStaff(staffRes.count ?? 0);
    setLoading(false);
  };

  const today = startOfDay(new Date());

  const filtered = useMemo(() => {
    let result = policies;
    if (categoryFilter !== "ALL") result = result.filter((p) => p.category === categoryFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(s));
    }
    return result;
  }, [policies, search, categoryFilter]);

  // Group by category to make scanning easier (this is what people open
  // the page to do — find a policy by topic).
  const byCategory = useMemo(() => {
    const map: Record<string, PolicyRow[]> = {};
    filtered.forEach((p) => {
      const k = p.category;
      if (!map[k]) map[k] = [];
      map[k].push(p);
    });
    return map;
  }, [filtered]);

  const unackedCount = filtered.filter((p) => !myAckedIds.has(p.id)).length;

  return (
    <div className="space-y-4">
      {/* Your acknowledgement status (always visible) */}
      {!loading && filtered.length > 0 && (
        <div className={cn(
          "rounded-lg border p-3 flex items-center gap-3",
          unackedCount === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200",
        )}>
          {unackedCount === 0 ? (
            <CheckCircle2 className="h-5 w-5 text-green-700 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-sm font-medium",
              unackedCount === 0 ? "text-green-900" : "text-amber-900",
            )}>
              {unackedCount === 0
                ? "You've acknowledged all active policies"
                : `You have ${unackedCount} polic${unackedCount === 1 ? "y" : "ies"} to acknowledge`}
            </p>
            {unackedCount > 0 && (
              <p className="text-xs text-amber-800 mt-0.5">
                Open each policy to read and sign off.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policy title..."
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isAdmin && (
          <Button onClick={() => setShowNew(true)} className="sm:ml-auto">
            <Plus className="h-4 w-4 mr-1" /> New policy
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <FileBadge className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">No policies</p>
          <p className="text-sm mt-1">
            {policies.length === 0
              ? isAdmin
                ? "Click 'New policy' to publish the practice's first policy. CQC requires at least: infection control, safeguarding, complaints, information governance."
                : "Your practice admin hasn't published any policies yet."
              : "No policies match the current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byCategory).map(([cat, rows]) => (
            <div key={cat} className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                {CATEGORY_LABEL[cat] ?? cat}
              </h3>
              <div className="bg-card rounded-lg border divide-y">
                {rows.map((p) => {
                  const acked = myAckedIds.has(p.id);
                  const ackedCount = ackCounts[p.id] ?? 0;
                  const reviewDue = p.next_review_date
                    ? isBefore(parseISO(p.next_review_date), today)
                    : false;
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/governance/policies/${p.id}`)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{p.title}</span>
                          <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                            v{p.version}
                          </span>
                          {reviewDue && (
                            <span className="text-[11px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">
                              Review due
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>Effective {format(parseISO(p.effective_from), "d MMM yyyy")}</span>
                          {p.next_review_date && (
                            <><span>·</span><span>Review by {format(parseISO(p.next_review_date), "d MMM yyyy")}</span></>
                          )}
                          {isAdmin && totalStaff > 0 && (
                            <>
                              <span>·</span>
                              <span className={cn(
                                ackedCount === totalStaff ? "text-green-700" : "text-amber-700",
                              )}>
                                {ackedCount} / {totalStaff} acknowledged
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {acked ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                            <CheckCircle2 className="h-4 w-4" /> Acknowledged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
                            <Circle className="h-4 w-4" /> Not acknowledged
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <NewPolicySheet
          open={showNew}
          onOpenChange={setShowNew}
          onCreated={() => { if (auth.member) void load(auth.member.id); onChange?.(); }}
        />
      )}
    </div>
  );
}

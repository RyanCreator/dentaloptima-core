import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useAuth } from "@/hooks/useAuth";

// Aggregate counter for "stuff that needs attention" across the governance
// modules. Used on the Dashboard's needs-attention card and the Governance
// Overview tab so we don't load the same data twice.
//
// Each count is intentionally a separate HEAD-count query so RLS prunes
// each independently and the rollup is cheap. Bigger practices may
// eventually want a server-side rollup function — fine for now.

export interface GovernanceAttention {
  incidentsOpen: number;
  complaintsAwaitingAck: number;
  safeguardingOpen: number;
  policiesUnackedByMe: number;
  policiesReviewOverdue: number;
  retentionEligible: number;
  loaded: boolean;
}

const INITIAL: GovernanceAttention = {
  incidentsOpen: 0,
  complaintsAwaitingAck: 0,
  safeguardingOpen: 0,
  policiesUnackedByMe: 0,
  policiesReviewOverdue: 0,
  retentionEligible: 0,
  loaded: false,
};

export interface GovernanceAttentionResult extends GovernanceAttention {
  /** Call after any action that might change the rollup. */
  refresh: () => void;
}

export function useGovernanceAttention(): GovernanceAttentionResult {
  const auth = useAuth();
  const [state, setState] = useState<GovernanceAttention>(INITIAL);

  const refresh = () => {
    if (!auth.member) return;
    void load(auth.member.id, auth.member.role);
  };

  useEffect(() => {
    if (!auth.member) return;
    void load(auth.member.id, auth.member.role);
    // We deliberately depend on the member id alone — re-running on role
    // change is fine because the role change also flips the member.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.member?.id]);

  const load = async (memberId: string, role: string) => {
    const isAdmin = role === "OWNER" || role === "ADMIN";
    const today = new Date().toISOString().slice(0, 10);

    const [
      incidentsRes,
      complaintsRes,
      safeguardingRes,
      reviewOverdueRes,
      unackedPolicies,
      retentionRes,
    ] = await Promise.all([
      supabase
        .from("incident_report")
        .select("id", { count: "exact", head: true })
        .in("status", ["REPORTED", "UNDER_INVESTIGATION", "ACTION_REQUIRED"])
        .is("deleted_at", null),
      supabase
        .from("complaint")
        .select("id", { count: "exact", head: true })
        .eq("status", "NEW")
        .is("deleted_at", null),
      supabase
        .from("safeguarding_concern")
        .select("id", { count: "exact", head: true })
        .in("status", ["IDENTIFIED", "INTERNAL_REVIEW"])
        .is("deleted_at", null),
      // Policies with a review date in the past — surfaces "this should
      // have been reviewed by now". Practice review cycles tend to be
      // 12 months so this catches drift early.
      supabase
        .from("policy")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .lt("next_review_date", today)
        .is("deleted_at", null),
      countUnackedPoliciesFor(memberId),
      // Retention queue — admin-only, since only admins can do anything
      // about it. Non-admin staff don't need this on their dashboard.
      isAdmin
        ? supabase.rpc("list_retention_eligible_patients").then((r) => ({
            count: r.data ? (r.data as unknown[]).length : 0,
            error: r.error,
          }))
        : Promise.resolve({ count: 0, error: null }),
    ]);

    if (incidentsRes.error)    logger.error("incident count", incidentsRes.error);
    if (complaintsRes.error)   logger.error("complaint count", complaintsRes.error);
    if (safeguardingRes.error) logger.error("safeguarding count", safeguardingRes.error);
    if (reviewOverdueRes.error) logger.error("review overdue count", reviewOverdueRes.error);
    if (retentionRes.error)    logger.error("retention count", retentionRes.error);

    setState({
      incidentsOpen:           incidentsRes.count ?? 0,
      complaintsAwaitingAck:   complaintsRes.count ?? 0,
      safeguardingOpen:        safeguardingRes.count ?? 0,
      policiesUnackedByMe:     unackedPolicies,
      policiesReviewOverdue:   reviewOverdueRes.count ?? 0,
      retentionEligible:       retentionRes.count ?? 0,
      loaded: true,
    });
  };

  return { ...state, refresh };
}

async function countUnackedPoliciesFor(memberId: string): Promise<number> {
  const { data: policies } = await supabase
    .from("policy")
    .select("id")
    .eq("is_active", true)
    .is("deleted_at", null);
  if (!policies || policies.length === 0) return 0;

  const { data: acks } = await supabase
    .from("policy_acknowledgement")
    .select("policy_id")
    .eq("staff_id", memberId);
  const ackedIds = new Set((acks ?? []).map((a) => a.policy_id));
  return policies.filter((p) => !ackedIds.has(p.id)).length;
}

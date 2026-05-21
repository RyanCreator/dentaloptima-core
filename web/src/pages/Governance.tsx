import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertTriangle,
  MessageSquareWarning,
  Shield,
  FileBadge,
  ScrollText,
  LayoutDashboard,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IncidentsTab } from "@/components/governance/IncidentsTab";
import { ComplaintsTab } from "@/components/governance/ComplaintsTab";
import { PoliciesTab } from "@/components/governance/PoliciesTab";
import { SafeguardingTab } from "@/components/governance/SafeguardingTab";
import { AuditTab } from "@/components/governance/AuditTab";
import { RetentionTab } from "@/components/governance/RetentionTab";
import { GovernanceOverview } from "@/components/governance/GovernanceOverview";
import { useGovernanceAttention } from "@/hooks/useGovernanceAttention";
import { GlossaryTerm } from "@/components/GlossaryTerm";

type TabKey = "overview" | "incidents" | "complaints" | "safeguarding" | "policies" | "retention" | "audit";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: "overview",     label: "Overview",     icon: LayoutDashboard },
  { key: "incidents",    label: "Incidents",    icon: AlertTriangle },
  { key: "complaints",   label: "Complaints",   icon: MessageSquareWarning },
  { key: "safeguarding", label: "Safeguarding", icon: Shield },
  { key: "policies",     label: "Policies",     icon: FileBadge },
  { key: "retention",    label: "Retention",    icon: Archive,    adminOnly: true },
  { key: "audit",        label: "Audit log",    icon: ScrollText, adminOnly: true },
];

export default function Governance() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.adminOnly || isAdmin),
    [isAdmin],
  );

  const rawTab = (searchParams.get("tab") ?? "overview") as TabKey;
  const activeTab: TabKey = visibleTabs.some((t) => t.key === rawTab) ? rawTab : "overview";

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams);
    if (key === "overview") params.delete("tab");
    else params.set("tab", key);
    setSearchParams(params, { replace: true });
  };

  // Single source of truth for attention rollup — same hook powers the
  // Dashboard's "needs attention" card, so the two surfaces don't drift.
  const attention = useGovernanceAttention();

  const renderTab = () => {
    switch (activeTab) {
      case "overview":     return <GovernanceOverview counts={attention} onJump={setTab} />;
      case "incidents":    return <IncidentsTab onChange={attention.refresh} />;
      case "complaints":   return <ComplaintsTab onChange={attention.refresh} />;
      case "safeguarding": return <SafeguardingTab onChange={attention.refresh} />;
      case "policies":     return <PoliciesTab onChange={attention.refresh} />;
      case "retention":    return <RetentionTab />;
      case "audit":        return <AuditTab />;
    }
  };

  if (auth.loading) {
    return (
      <Layout title="Governance">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="Governance"
      description={
        <>
          <GlossaryTerm term="CQC" /> compliance — incidents, complaints,{" "}
          <GlossaryTerm term="Safeguarding">safeguarding</GlossaryTerm>, policies,
          and the audit trail.
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 border-b">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            const badge = badgeFor(tab.key, attention);
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {badge !== null && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold",
                      badge > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {renderTab()}
      </div>
    </Layout>
  );
}

interface AttentionShape {
  incidentsOpen: number;
  complaintsAwaitingAck: number;
  safeguardingOpen: number;
  policiesUnackedByMe: number;
  policiesReviewOverdue: number;
  retentionEligible: number;
}

function badgeFor(tab: TabKey, counts: AttentionShape): number | null {
  switch (tab) {
    case "incidents":    return counts.incidentsOpen;
    case "complaints":   return counts.complaintsAwaitingAck;
    case "safeguarding": return counts.safeguardingOpen;
    // Policies tab badge surfaces whichever bucket is larger — staff with
    // unread policies see that, admins with overdue reviews see that.
    case "policies":     return Math.max(counts.policiesUnackedByMe, counts.policiesReviewOverdue);
    case "retention":    return counts.retentionEligible;
    default:             return null;
  }
}

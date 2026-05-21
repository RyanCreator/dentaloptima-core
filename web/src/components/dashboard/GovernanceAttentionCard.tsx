import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, MessageSquareWarning, Shield, FileBadge, History, Archive, ArrowRight, ShieldCheck,
} from "lucide-react";
import { useGovernanceAttention } from "@/hooks/useGovernanceAttention";

// "Needs attention" rollup on the Dashboard. Renders nothing when every
// counter is zero — we don't want to take screen space when nothing's
// pending. The card mirrors the structure of GovernanceOverview but
// favours a single compact block instead of a full grid.

interface AttentionItem {
  key: string;
  count: number;
  label: (n: number) => string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

export function GovernanceAttentionCard() {
  const navigate = useNavigate();
  const counts = useGovernanceAttention();

  if (!counts.loaded) return null;

  const items: AttentionItem[] = [
    {
      key: "incidents",
      count: counts.incidentsOpen,
      label: (n) => `${n} incident${n === 1 ? "" : "s"} open or under investigation`,
      icon: AlertTriangle,
      href: "/governance?tab=incidents",
    },
    {
      key: "complaints",
      count: counts.complaintsAwaitingAck,
      label: (n) =>
        `${n} complaint${n === 1 ? "" : "s"} awaiting acknowledgement` +
        (n > 0 ? " · 3-working-day CQC deadline" : ""),
      icon: MessageSquareWarning,
      href: "/governance?tab=complaints",
    },
    {
      key: "safeguarding",
      count: counts.safeguardingOpen,
      label: (n) => `${n} safeguarding concern${n === 1 ? "" : "s"} awaiting review`,
      icon: Shield,
      href: "/governance?tab=safeguarding",
    },
    {
      key: "policies-unacked",
      count: counts.policiesUnackedByMe,
      label: (n) => `${n} polic${n === 1 ? "y you haven't" : "ies you haven't"} acknowledged`,
      icon: FileBadge,
      href: "/governance?tab=policies",
    },
    {
      key: "policies-review",
      count: counts.policiesReviewOverdue,
      label: (n) => `${n} polic${n === 1 ? "y" : "ies"} overdue for review`,
      icon: History,
      href: "/governance?tab=policies",
    },
    {
      key: "retention",
      count: counts.retentionEligible,
      label: (n) => `${n} patient${n === 1 ? "" : "s"} eligible for retention purge`,
      icon: Archive,
      href: "/governance?tab=retention",
    },
  ];

  const live = items.filter((i) => i.count > 0);
  if (live.length === 0) return null;

  return (
    <div className="mt-8 rounded-lg border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Needs attention</h2>
          <span className="text-xs text-muted-foreground">
            {live.length} item{live.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          onClick={() => navigate("/governance")}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Open Governance
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <div className="divide-y">
        {live.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.href)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="h-7 w-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-sm flex-1">{item.label(item.count)}</p>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

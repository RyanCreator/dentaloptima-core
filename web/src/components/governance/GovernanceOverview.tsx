import {
  AlertTriangle,
  MessageSquareWarning,
  Shield,
  FileBadge,
  History,
  Archive,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

interface GovernanceOverviewProps {
  counts: {
    incidentsOpen: number;
    complaintsAwaitingAck: number;
    safeguardingOpen: number;
    policiesUnackedByMe: number;
    policiesReviewOverdue: number;
    retentionEligible: number;
  };
  onJump: (
    tab: "overview" | "incidents" | "complaints" | "safeguarding" | "policies" | "retention" | "audit",
  ) => void;
}

interface AlertRow {
  key: string;
  count: number;
  label: (n: number) => string;
  icon: React.ComponentType<{ className?: string }>;
  jumpTo: "incidents" | "complaints" | "safeguarding" | "policies" | "retention";
}

export function GovernanceOverview({ counts, onJump }: GovernanceOverviewProps) {
  const alerts: AlertRow[] = [
    {
      key: "incidents",
      count: counts.incidentsOpen,
      label: (n) => `${n} incident${n === 1 ? "" : "s"} open or under investigation`,
      icon: AlertTriangle,
      jumpTo: "incidents",
    },
    {
      key: "complaints",
      count: counts.complaintsAwaitingAck,
      label: (n) =>
        `${n} new complaint${n === 1 ? "" : "s"} awaiting acknowledgement` +
        (n > 0 ? " · CQC requires reply within 3 working days" : ""),
      icon: MessageSquareWarning,
      jumpTo: "complaints",
    },
    {
      key: "safeguarding",
      count: counts.safeguardingOpen,
      label: (n) => `${n} safeguarding concern${n === 1 ? "" : "s"} awaiting review`,
      icon: Shield,
      jumpTo: "safeguarding",
    },
    {
      key: "policies-unacked",
      count: counts.policiesUnackedByMe,
      label: (n) => `${n} polic${n === 1 ? "y you haven't" : "ies you haven't"} acknowledged`,
      icon: FileBadge,
      jumpTo: "policies",
    },
    {
      key: "policies-review",
      count: counts.policiesReviewOverdue,
      label: (n) => `${n} polic${n === 1 ? "y" : "ies"} overdue for review`,
      icon: History,
      jumpTo: "policies",
    },
    {
      key: "retention",
      count: counts.retentionEligible,
      label: (n) => `${n} patient${n === 1 ? "" : "s"} eligible for retention purge`,
      icon: Archive,
      jumpTo: "retention",
    },
  ];

  const live = alerts.filter((a) => a.count > 0);

  return (
    <div className="space-y-4">
      {live.length === 0 ? (
        <div className="rounded-lg border bg-green-50 border-green-200 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-green-900">All clear</p>
            <p className="text-sm text-green-800 mt-0.5">
              Nothing waiting in incidents, complaints, safeguarding, policies, or your retention queue.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {live.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                onClick={() => onJump(a.jumpTo)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="h-9 w-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm flex-1">{a.label(a.count)}</p>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickAction
          icon={AlertTriangle}
          label="Log an incident"
          description="Clinical event, near miss, equipment failure, or data breach"
          onClick={() => onJump("incidents")}
        />
        <QuickAction
          icon={MessageSquareWarning}
          label="Record a complaint"
          description="Patient feedback that needs investigation and response"
          onClick={() => onJump("complaints")}
        />
        <QuickAction
          icon={Shield}
          label="Raise a safeguarding concern"
          description="Child, adult at risk, or domestic abuse referral"
          onClick={() => onJump("safeguarding")}
        />
        <QuickAction
          icon={FileBadge}
          label="Review policies"
          description="Read and acknowledge practice policies"
          onClick={() => onJump("policies")}
        />
      </div>
    </div>
  );
}

interface QuickActionProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
}

function QuickAction({ icon: Icon, label, description, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors text-left flex flex-col gap-2"
    >
      <Icon className="h-5 w-5 text-primary" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground leading-snug">{description}</p>
    </button>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Building2,
  Users2,
  Calendar,
  AlertTriangle,
  MessageCircle,
  Inbox,
  Mail,
  Clock,
  Activity,
  ArrowRight,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { supabaseRegistry, supabaseCore } from "@/integrations/supabase/client";
import { useAuditLog, type AuditEntry } from "@/hooks/useAuditLog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardStats {
  // platform
  total_practices: number;
  active_practices: number;
  trial_practices: number;
  total_patients: number;
  appointments_last_30d: number;
  // needs-attention
  support_needs_reply: number;
  new_leads: number;
  expiring_trials_7d: number;
  open_incidents: number;
  email_unread_open: number;
}

interface ExpiringTrial {
  id: string;
  name: string;
  trial_ends_at: string | null;
}

// All counts queried in parallel. Core data via supabaseCore (service-role,
// bypasses RLS); registry data via supabaseRegistry (operator JWT, RLS-gated
// to admin_user).
function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async (): Promise<DashboardStats & { upcoming_trials: ExpiringTrial[] }> => {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();
      const in7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        practiceStatuses,
        patients,
        appts,
        incidents,
        expiringTrials,
        upcomingTrialList,
        supportReplies,
        newLeads,
        emailUnread,
      ] = await Promise.all([
        supabaseCore.from("practice").select("status").is("deleted_at", null),
        supabaseCore.from("patient").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabaseCore.from("appointment").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("starts_at", since30d),
        supabaseCore.from("incident_report").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["REPORTED", "UNDER_INVESTIGATION", "ACTION_REQUIRED"]),
        supabaseCore.from("practice").select("id", { count: "exact", head: true }).eq("status", "TRIAL").is("deleted_at", null).gte("trial_ends_at", nowIso).lte("trial_ends_at", in7d),
        supabaseCore.from("practice").select("id, name, trial_ends_at").eq("status", "TRIAL").is("deleted_at", null).not("trial_ends_at", "is", null).order("trial_ends_at", { ascending: true }).limit(5),
        supabaseRegistry.from("support_thread").select("id", { count: "exact", head: true }).eq("status", "AWAITING_DENTALOPTIMA"),
        supabaseRegistry.from("marketing_lead").select("id", { count: "exact", head: true }).eq("status", "NEW"),
        supabaseRegistry.from("email_thread").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
      ]);

      const practiceRows = (practiceStatuses.data ?? []) as { status: string }[];

      return {
        total_practices: practiceRows.length,
        active_practices: practiceRows.filter((p) => p.status === "ACTIVE").length,
        trial_practices: practiceRows.filter((p) => p.status === "TRIAL").length,
        total_patients: patients.count ?? 0,
        appointments_last_30d: appts.count ?? 0,
        open_incidents: incidents.count ?? 0,
        expiring_trials_7d: expiringTrials.count ?? 0,
        support_needs_reply: supportReplies.count ?? 0,
        new_leads: newLeads.count ?? 0,
        email_unread_open: emailUnread.count ?? 0,
        upcoming_trials: (upcomingTrialList.data ?? []) as ExpiringTrial[],
      };
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export default function Overview() {
  const { data, isLoading } = useDashboardStats();
  const expiring = data?.upcoming_trials;
  const { data: recentAudit } = useAuditLog(10);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What needs your attention right now.
        </p>
      </div>

      {/* Section 1 — actionable cards. Tone goes amber when there's something
          to do. Each card links to the page that lets you do it. */}
      <section className="space-y-2">
        <SectionLabel>Needs attention</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ActionCard
            icon={MessageCircle}
            label="Support replies"
            count={data?.support_needs_reply}
            to="/support"
            loading={isLoading}
          />
          <ActionCard
            icon={Inbox}
            label="New leads"
            count={data?.new_leads}
            to="/leads?status=NEW"
            loading={isLoading}
          />
          <ActionCard
            icon={Clock}
            label="Trials ending ≤7d"
            count={data?.expiring_trials_7d}
            to="/tenants"
            loading={isLoading}
          />
          <ActionCard
            icon={AlertTriangle}
            label="Open incidents"
            count={data?.open_incidents}
            to="/tenants"
            loading={isLoading}
            destructive
          />
        </div>
      </section>

      {/* Section 2 — informational platform stats. Click-through where it
          makes sense, plain otherwise. */}
      <section className="space-y-2">
        <SectionLabel>Platform</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Building2}
            label="Practices"
            value={data?.total_practices}
            sublabel={
              data
                ? `${data.active_practices} active · ${data.trial_practices} trial`
                : undefined
            }
            to="/tenants"
            loading={isLoading}
          />
          <StatCard
            icon={Users2}
            label="Patients"
            value={data?.total_patients}
            loading={isLoading}
          />
          <StatCard
            icon={Calendar}
            label="Appts (30d)"
            value={data?.appointments_last_30d}
            loading={isLoading}
          />
          <StatCard
            icon={Mail}
            label="Email open"
            value={data?.email_unread_open}
            to="/messaging"
            loading={isLoading}
          />
        </div>
      </section>

      {/* Section 3 — drill-down panels. 2/3 + 1/3 split at lg, stacked below. */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <RecentActivity entries={recentAudit ?? []} loading={!recentAudit} />
        <TrialPipeline trials={expiring ?? []} loading={!expiring} />
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground/80">
      {children}
    </h2>
  );
}

// Cards that surface counts requiring action — render as Links so the whole
// card is clickable, with a hover state to telegraph that.
function ActionCard({
  icon: Icon,
  label,
  count,
  to,
  loading,
  destructive,
}: {
  icon: typeof Building2;
  label: string;
  count: number | undefined;
  to: string;
  loading?: boolean;
  destructive?: boolean;
}) {
  const has = !loading && (count ?? 0) > 0;
  return (
    <Link
      to={to}
      className={cn(
        "block rounded-lg border bg-card p-4 transition-colors",
        "hover:border-primary/40 hover:bg-accent/40",
        has && !destructive && "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20",
        has && destructive && "border-red-300/60 bg-red-50/60 dark:bg-red-950/20",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </span>
        <Icon
          className={cn(
            "h-4 w-4",
            has && !destructive && "text-amber-600",
            has && destructive && "text-red-600",
            !has && "text-muted-foreground/60",
          )}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              has && !destructive && "text-amber-900 dark:text-amber-100",
              has && destructive && "text-red-900 dark:text-red-100",
            )}
          >
            {(count ?? 0).toLocaleString("en-GB")}
          </span>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      {!has && !loading && (
        <div className="mt-1 text-xs text-muted-foreground">All clear</div>
      )}
    </Link>
  );
}

// Plain stat cards — clickable when `to` is provided, static otherwise.
function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  to,
  loading,
}: {
  icon: typeof Building2;
  label: string;
  value: number | undefined;
  sublabel?: string;
  to?: string;
  loading?: boolean;
}) {
  const inner = (
    <div className="rounded-lg border bg-card p-4 h-full transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {loading ? <Skeleton className="h-7 w-16" /> : (value ?? 0).toLocaleString("en-GB")}
      </div>
      {sublabel && (
        <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>
      )}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

function RecentActivity({
  entries,
  loading,
}: {
  entries: AuditEntry[];
  loading: boolean;
}) {
  return (
    <div className="lg:col-span-2 rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Recent activity</h2>
        </div>
        <Link
          to="/audit"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all →
        </Link>
      </div>
      {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li
              key={`${e.kind}-${e.id}`}
              className="px-4 py-2.5 flex items-center gap-3 text-sm"
            >
              <span
                className={cn(
                  "inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                  e.action === "INSERT" && "bg-blue-100 text-blue-700",
                  e.action === "UPDATE" && "bg-slate-100 text-slate-700",
                  e.action === "DELETE" && "bg-red-100 text-red-700",
                )}
              >
                {e.action}
              </span>
              <span className="font-mono text-xs text-muted-foreground shrink-0">
                {e.entity_type}
              </span>
              <span className="text-xs text-muted-foreground truncate flex-1">
                {e.performed_by_email ?? "system"}
              </span>
              <span
                className="text-xs text-muted-foreground shrink-0 tabular-nums"
                title={format(new Date(e.performed_at), "d MMM yyyy HH:mm:ss")}
              >
                {formatDistanceToNow(new Date(e.performed_at), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrialPipeline({
  trials,
  loading,
}: {
  trials: ExpiringTrial[];
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Trials expiring soonest</h2>
      </div>
      {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : trials.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No active trials.
        </div>
      ) : (
        <ul className="divide-y">
          {trials.map((t) => {
            const days = t.trial_ends_at
              ? differenceInDays(new Date(t.trial_ends_at), new Date())
              : null;
            const expired = days !== null && days < 0;
            return (
              <li key={t.id}>
                <Link
                  to={`/tenants/${t.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <span className="text-sm font-medium truncate">{t.name}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums shrink-0",
                      expired
                        ? "text-red-600 font-medium"
                        : days !== null && days <= 3
                        ? "text-amber-600"
                        : "text-muted-foreground",
                    )}
                  >
                    {days === null
                      ? "—"
                      : expired
                      ? `${Math.abs(days)}d ago`
                      : days === 0
                      ? "today"
                      : `in ${days}d`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users2, Calendar, AlertTriangle } from "lucide-react";

interface OverviewStats {
  total_practices: number;
  active_practices: number;
  trial_practices: number;
  total_patients: number;
  appointments_last_30d: number;
  open_incidents: number;
}

function useOverviewStats() {
  return useQuery({
    queryKey: ["overview-stats"],
    queryFn: async (): Promise<OverviewStats> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      // Six independent count queries — small enough that fan-out from the
      // browser is fine. Could be consolidated into one RPC later.
      const [practices, patients, appts, incidents] = await Promise.all([
        supabase.from("practice").select("status", { count: "exact" }).is("deleted_at", null),
        supabase.from("patient").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase
          .from("appointment")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("starts_at", since),
        supabase
          .from("incident_report")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .in("status", ["REPORTED", "UNDER_INVESTIGATION", "ACTION_REQUIRED"]),
      ]);

      const practiceRows = (practices.data ?? []) as { status: string }[];
      return {
        total_practices: practiceRows.length,
        active_practices: practiceRows.filter((p) => p.status === "ACTIVE").length,
        trial_practices: practiceRows.filter((p) => p.status === "TRIAL").length,
        total_patients: patients.count ?? 0,
        appointments_last_30d: appts.count ?? 0,
        open_incidents: incidents.count ?? 0,
      };
    },
  });
}

export default function Overview() {
  const { data, isLoading } = useOverviewStats();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-practice metrics for dentaloptima-core.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Building2}
          label="Practices"
          value={data?.total_practices ?? 0}
          sublabel={data ? `${data.active_practices} active · ${data.trial_practices} trial` : undefined}
          loading={isLoading}
        />
        <StatCard
          icon={Users2}
          label="Patients"
          value={data?.total_patients ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={Calendar}
          label="Appts (last 30 days)"
          value={data?.appointments_last_30d ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={AlertTriangle}
          label="Open incidents"
          value={data?.open_incidents ?? 0}
          loading={isLoading}
          tone={data && data.open_incidents > 0 ? "warning" : "default"}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  loading,
  tone = "default",
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  sublabel?: string;
  loading?: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </div>
        <Icon
          className={`h-4 w-4 ${tone === "warning" ? "text-amber-500" : "text-muted-foreground/60"}`}
        />
      </div>
      <div className="text-2xl font-semibold mt-2 tabular-nums">
        {loading ? "—" : value.toLocaleString("en-GB")}
      </div>
      {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
    </div>
  );
}

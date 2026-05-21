import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfDay, endOfDay } from "date-fns";
import { Calendar, Clock, AlertCircle, CreditCard, Inbox, ChevronRight } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Badge, getAppointmentBadgeVariant } from "@/components/Badge";
import { formatPrice } from "@/types/entities";
import { GovernanceAttentionCard } from "@/components/dashboard/GovernanceAttentionCard";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";

// Operator-facing dashboard. Loads in parallel:
//   - Today's appointments (count + next-up time + a 3-row preview list)
//   - New booking requests count
//   - Outstanding balance + unpaid count from billing_item
//
// All RLS-scoped to the caller's practice automatically — no explicit
// practice_id filter needed in any of the queries.

interface UpcomingAppt {
  id: string;
  starts_at: string;
  status: string;
  patient: { full_name: string } | null;
  services: Array<{ service: { name: string } | null }>;
}

interface DashboardStats {
  todayAppointments: number;
  nextAppointmentTime: string | null;
  newEnquiries: number;
  outstandingBalancePence: number;
  outstandingCount: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  onClick,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`bg-card rounded-lg border p-4 text-left transition-colors ${
        onClick ? "hover:bg-muted/50 cursor-pointer" : ""
      } ${highlight ? "border-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground/60 mt-0.5" />
      </div>
    </Wrapper>
  );
}

export default function Dashboard() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();
  const tenant = usePractice();

  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    nextAppointmentTime: null,
    newEnquiries: 0,
    outstandingBalancePence: 0,
    outstandingCount: 0,
  });
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    void loadStats();
  }, [loading]);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();

      const [todayApts, newEnquiries, outstanding] = await Promise.all([
        supabase
          .from("appointment")
          .select(
            `id, starts_at, status,
             patient:patient_id (full_name),
             services:appointment_service ( service:service_id (name) )`,
          )
          .in("status", ["SCHEDULED", "CONFIRMED", "ARRIVED", "IN_PROGRESS"])
          .is("deleted_at", null)
          .gte("starts_at", todayStart)
          .lte("starts_at", todayEnd)
          .order("starts_at"),
        supabase
          .from("booking_request")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("status", "NEW"),
        supabase
          .from("billing_item")
          .select("total_pence, amount_paid_pence")
          .is("deleted_at", null)
          .in("payment_status", ["UNPAID", "PARTIALLY_PAID"]),
      ]);

      const apts = (todayApts.data ?? []) as UpcomingAppt[];
      const stillToCome = apts.filter((a) => new Date(a.starts_at) > now);

      const outstandingItems = outstanding.data ?? [];
      const balance = outstandingItems.reduce(
        (sum, item) => sum + (Number(item.total_pence) - Number(item.amount_paid_pence ?? 0)),
        0,
      );

      setStats({
        todayAppointments: apts.length,
        nextAppointmentTime:
          stillToCome.length > 0 ? format(new Date(stillToCome[0].starts_at), "HH:mm") : null,
        newEnquiries: newEnquiries.count ?? 0,
        outstandingBalancePence: balance,
        outstandingCount: outstandingItems.length,
      });
      setUpcoming(stillToCome.slice(0, 4));
    } catch (err) {
      logger.error("Error loading dashboard stats", err);
    } finally {
      setStatsLoading(false);
    }
  }

  if (loading) {
    return (
      <Layout title={`Welcome to ${tenant.practice.name}`}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Layout>
    );
  }

  const allClear =
    !statsLoading &&
    stats.outstandingCount === 0 &&
    stats.todayAppointments === 0 &&
    stats.newEnquiries === 0;

  return (
    <Layout
      title={`Welcome to ${tenant.practice.name}`}
      description={format(new Date(), "EEEE, d MMMM yyyy")}
    >
      <OnboardingChecklist />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Calendar}
          label="Today's Appointments"
          value={statsLoading ? "—" : stats.todayAppointments}
          onClick={() => navigate("/calendar")}
          highlight={stats.todayAppointments > 0}
        />
        <StatCard
          icon={Clock}
          label="Next Appointment"
          value={statsLoading ? "—" : stats.nextAppointmentTime ?? "None"}
          subtitle={stats.nextAppointmentTime ? "Today" : "Nothing left today"}
          onClick={() => navigate("/calendar")}
        />
        <StatCard
          icon={Inbox}
          label="New Enquiries"
          value={statsLoading ? "—" : stats.newEnquiries}
          onClick={() => navigate("/enquiries")}
          highlight={stats.newEnquiries > 0}
        />
        <StatCard
          icon={CreditCard}
          label="Outstanding Balance"
          value={statsLoading ? "—" : formatPrice(stats.outstandingBalancePence)}
          subtitle={
            stats.outstandingCount > 0 ? `${stats.outstandingCount} unpaid` : "All caught up"
          }
          highlight={stats.outstandingBalancePence > 0}
        />
      </div>

      <GovernanceAttentionCard />

      {!statsLoading && upcoming.length > 0 && (
        <div className="mt-8 rounded-lg border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm">Up next today</h2>
              <p className="text-xs text-muted-foreground">
                {upcoming.length} of {stats.todayAppointments} still to come
              </p>
            </div>
            <button
              onClick={() => navigate("/calendar")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View calendar
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y">
            {upcoming.map((apt) => {
              const services =
                apt.services?.map((s) => s.service?.name).filter(Boolean).join(", ") || "—";
              return (
                <button
                  key={apt.id}
                  onClick={() => navigate("/calendar")}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="text-sm font-mono font-medium tabular-nums w-14 shrink-0">
                    {format(new Date(apt.starts_at), "HH:mm")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {apt.patient?.full_name ?? "Unknown patient"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{services}</div>
                  </div>
                  <Badge variant={getAppointmentBadgeVariant(apt.status)}>{apt.status}</Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {allClear && (
        <div className="mt-8 rounded-lg border border-dashed bg-card p-8 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">Nothing on the schedule today</p>
          <p className="text-xs text-muted-foreground mt-1">
            Open the calendar to book an appointment, or check enquiries for new requests.
          </p>
        </div>
      )}
    </Layout>
  );
}

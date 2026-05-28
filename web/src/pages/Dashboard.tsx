import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfDay, endOfDay } from "date-fns";
import {
  Calendar,
  Clock,
  AlertCircle,
  CreditCard,
  Inbox,
  ChevronRight,
  PlayCircle,
  AlertTriangle,
  CheckCheck,
  XCircle,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Badge, getAppointmentBadgeVariant } from "@/components/Badge";
import { formatPrice } from "@/types/entities";
import { GovernanceAttentionCard } from "@/components/dashboard/GovernanceAttentionCard";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { UpcomingAppointmentSheet } from "@/components/dashboard/UpcomingAppointmentSheet";
import { getAppointmentBucket, type AppointmentBucket } from "@/lib/appointmentBuckets";
import { cn } from "@/lib/utils";

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
  ends_at: string;
  started_at: string | null;
  status: string;
  notes: string | null;
  patient_id: string;
  practice_id: string;
  patient: { full_name: string; phone: string | null } | null;
  staff: { full_name: string | null } | null;
  services: Array<{
    service: { id: string; name: string; price_pence: number | null; is_nhs: boolean; nhs_band: string | null } | null;
  }>;
}

interface DashboardStats {
  todayAppointments: number;
  nextAppointmentTime: string | null;
  // Surfaced under the next-appointment stat so the front desk can see
  // who's about to walk in (and with whom) at a glance.
  nextAppointmentStaff: string | null;
  nextAppointmentPatient: string | null;
  newEnquiries: number;
  outstandingBalancePence: number;
  /** Number of DISTINCT PATIENTS with outstanding balance — more honest
   *  than item count, which inflates when one patient has multiple bills. */
  outstandingPatients: number;
}

// Renders today's actionable appointments grouped by where they are in
// the visit journey. Each row opens the check-in sheet (the parent owns
// `setViewingAppointment`). The bucket order is deliberate — staff scan
// the dashboard top-down and need to see "what's happening right now"
// before "what's coming up".
interface BucketedAppointmentsProps {
  appointments: UpcomingAppt[];
  onOpen: (apt: UpcomingAppt) => void;
  onViewCalendar: () => void;
}

const BUCKET_ORDER: AppointmentBucket[] = [
  "in_treatment",
  "waiting",
  "late",
  "upcoming",
  "completed",
  "cancelled",
];

// Per-bucket visual theming. Backgrounds are deliberately faint so the
// dashboard reads as a calm traffic-light not a 90s spreadsheet — the
// tint is enough to scan-find a section, the content does the rest.
const BUCKET_META: Record<
  AppointmentBucket,
  {
    title: string;
    subtitle: string;
    icon: React.ElementType;
    /** Icon + accent text colour. */
    tone: string;
    /** Faint card background that survives both light and dark modes. */
    cardBg: string;
  }
> = {
  in_treatment: {
    title: "In treatment now",
    subtitle: "Currently being seen",
    icon: PlayCircle,
    tone: "text-emerald-700 dark:text-emerald-300",
    cardBg: "bg-emerald-50/40 dark:bg-emerald-950/20",
  },
  waiting: {
    title: "Waiting room",
    subtitle: "Checked in, ready to be seen",
    icon: CheckCheck,
    tone: "text-blue-700 dark:text-blue-300",
    cardBg: "bg-blue-50/40 dark:bg-blue-950/20",
  },
  late: {
    title: "Late",
    subtitle: "Past the booked time, not yet arrived",
    icon: AlertTriangle,
    tone: "text-amber-700 dark:text-amber-300",
    cardBg: "bg-amber-50/50 dark:bg-amber-950/20",
  },
  upcoming: {
    title: "Up next today",
    subtitle: "Future bookings",
    icon: Clock,
    tone: "text-foreground",
    cardBg: "bg-card",
  },
  completed: {
    title: "Done today",
    subtitle: "Treatments finished",
    icon: CheckCheck,
    tone: "text-muted-foreground",
    cardBg: "bg-muted/30",
  },
  cancelled: {
    title: "Didn't happen",
    subtitle: "Cancelled, no-show or rescheduled",
    icon: XCircle,
    tone: "text-red-700 dark:text-red-300",
    cardBg: "bg-red-50/40 dark:bg-red-950/20",
  },
};

function BucketedAppointments({
  appointments,
  onOpen,
  onViewCalendar,
}: BucketedAppointmentsProps) {
  // Stable-ish "now" reference for bucketing this render. We don't
  // bother with a per-second tick — bucketing changes when status
  // changes (operator action) or when the user reloads the dashboard,
  // both of which trigger a re-render anyway.
  const now = new Date();
  const grouped: Record<AppointmentBucket, UpcomingAppt[]> = {
    in_treatment: [],
    waiting: [],
    late: [],
    upcoming: [],
    completed: [],
    cancelled: [],
  };
  for (const apt of appointments) {
    const bucket = getAppointmentBucket(apt, now);
    grouped[bucket].push(apt);
  }

  return (
    <div className="mt-8 space-y-6">
      {BUCKET_ORDER.map((bucket) => {
        const items = grouped[bucket];
        if (items.length === 0) return null;
        const meta = BUCKET_META[bucket];
        const Icon = meta.icon;
        return (
          <div key={bucket} className={cn("rounded-lg border overflow-hidden", meta.cardBg)}>
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", meta.tone)} />
                <div>
                  <h2 className="font-semibold text-sm">
                    {meta.title}
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums normal-case">
                      {items.length}
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
                </div>
              </div>
              {bucket === "upcoming" && (
                <button
                  onClick={onViewCalendar}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View calendar
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="divide-y">
              {items.map((apt) => (
                <BucketRow
                  key={apt.id}
                  apt={apt}
                  bucket={bucket}
                  now={now}
                  onOpen={() => onOpen(apt)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BucketRow({
  apt,
  bucket,
  now,
  onOpen,
}: {
  apt: UpcomingAppt;
  bucket: AppointmentBucket;
  now: Date;
  onOpen: () => void;
}) {
  const services =
    apt.services?.map((s) => s.service?.name).filter(Boolean).join(", ") || "—";
  const start = new Date(apt.starts_at);
  const end = new Date(apt.ends_at);

  // Per-bucket trailing indicator. Late shows "12 min late"; in-treatment
  // shows planned-end and remaining minutes (or "X min over" if past
  // their scheduled end).
  let trailing: React.ReactNode;
  if (bucket === "late") {
    const minsLate = Math.round((now.getTime() - start.getTime()) / 60_000);
    trailing = (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
        {minsLate} min late
      </span>
    );
  } else if (bucket === "in_treatment") {
    // Expected end = actual start + booked duration. If treatment was
    // started early (or late), this gives the right countdown — a
    // 30-min treatment started early still shows ~30 min remaining,
    // not "however long until the originally booked end_at". Falls
    // back to the scheduled end for rows with no started_at (legacy).
    const startedAt = apt.started_at ? new Date(apt.started_at) : null;
    const apptDurationMs = end.getTime() - start.getTime();
    const expectedEnd =
      startedAt && apptDurationMs > 0
        ? new Date(startedAt.getTime() + apptDurationMs)
        : end;
    const minsRemaining = Math.round((expectedEnd.getTime() - now.getTime()) / 60_000);
    trailing = (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
        {minsRemaining >= 0
          ? `${minsRemaining} min remaining`
          : `${Math.abs(minsRemaining)} min over`}
      </span>
    );
  } else {
    trailing = (
      <Badge variant={getAppointmentBadgeVariant(apt.status)}>{apt.status}</Badge>
    );
  }

  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left"
    >
      <div className="text-sm font-mono font-medium tabular-nums w-14 shrink-0">
        {format(start, "HH:mm")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {apt.patient?.full_name ?? "Unknown patient"}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {services}
          {apt.staff?.full_name && (
            <>
              {" · "}
              <span className="text-foreground/70">with {apt.staff.full_name}</span>
            </>
          )}
        </div>
      </div>
      {trailing}
    </button>
  );
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
    nextAppointmentStaff: null,
    nextAppointmentPatient: null,
    newEnquiries: 0,
    outstandingBalancePence: 0,
    outstandingPatients: 0,
  });
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  // Which appointment row (if any) is being viewed in the read-only
  // summary sheet. null = sheet closed. Clicking a row opens the sheet
  // locally instead of navigating away to /calendar.
  const [viewingAppointment, setViewingAppointment] = useState<UpcomingAppt | null>(null);

  useEffect(() => {
    if (loading) return;
    void loadStats();
  }, [loading]);

  // Realtime: a colleague's booking, payment, or new enquiry should flow
  // into this dashboard without a manual refresh. Subscribed to the three
  // tables the stats query reads. 300ms debounce so a bulk write doesn't
  // refetch on every row event. useId gives this hook instance its own
  // channel name so StrictMode double-mount can't collide on a static name
  // (same pattern as the calendar realtime hooks).
  const channelId = useId();
  useEffect(() => {
    if (loading) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        void loadStats();
      }, 300);
    };
    const channel = supabase
      .channel(`dashboard-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointment" },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_request" },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "billing_item" },
        scheduleRefetch,
      )
      .subscribe();
    return () => {
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [loading, channelId]);

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
            // The text-notes column on appointment is `treatment_summary`,
            // NOT `notes`. Aliased to `notes` on the way through so the
            // UpcomingAppt interface + summary sheet can keep the simpler
            // local name without coupling to the DB column rename.
            // patient_id and service price_pence are needed for the
            // post-complete billing prompt — pulled here in the same
            // round trip so the prompt opens without an extra fetch.
            // started_at drives the "X min remaining" countdown for
            // IN_PROGRESS rows (vs. counting against the scheduled
            // ends_at, which inflates the timer for early starts).
            `id, starts_at, ends_at, started_at, status, notes:treatment_summary, patient_id, practice_id,
             patient:patient_id (full_name, phone),
             staff:staff_id (full_name),
             services:appointment_service ( service:service_id (id, name, price_pence, is_nhs, nhs_band) )`,
          )
          // No status filter — the bucketed sections need every status
          // for today (cancelled/no-show land in "Didn't happen",
          // completed in "Done today", etc.). The status enum is small
          // enough that pulling all of them adds negligible bytes.
          .is("deleted_at", null)
          .gte("starts_at", todayStart)
          .lte("starts_at", todayEnd)
          .order("starts_at"),
        supabase
          .from("booking_request")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("status", "NEW"),
        // Outstanding balance — scoped to the last 12 months so the query
        // doesn't drag the whole billing history on long-running practices.
        // Anything older lives on the dedicated Outstanding Balances page.
        // patient_id pulled so the headline can show distinct PATIENT
        // count (more useful than item count — one patient with three
        // bills reads as 3 outstanding but is really 1 owing person).
        supabase
          .from("billing_item")
          .select("total_pence, amount_paid_pence, patient_id")
          .is("deleted_at", null)
          .in("payment_status", ["UNPAID", "PARTIALLY_PAID"])
          .gte("created_at", new Date(Date.now() - 365 * 86_400_000).toISOString()),
      ]);

      const apts = (todayApts.data ?? []) as UpcomingAppt[];
      // "Still to come" for the next-appointment stat = future scheduled
      // ones. Excludes ARRIVED/IN_PROGRESS (they're already here) and
      // past-start scheduled ones (they're late, not "next").
      const stillToCome = apts.filter(
        (a) =>
          (a.status === "SCHEDULED" || a.status === "CONFIRMED") &&
          new Date(a.starts_at) > now,
      );

      const outstandingItems = outstanding.data ?? [];
      const balance = outstandingItems.reduce(
        (sum, item) => sum + (Number(item.total_pence) - Number(item.amount_paid_pence ?? 0)),
        0,
      );
      const outstandingPatients = new Set(
        outstandingItems.map((i) => i.patient_id).filter(Boolean),
      ).size;

      const next = stillToCome[0] ?? null;
      setStats({
        todayAppointments: apts.length,
        nextAppointmentTime: next ? format(new Date(next.starts_at), "HH:mm") : null,
        nextAppointmentStaff: next?.staff?.full_name ?? null,
        nextAppointmentPatient: next?.patient?.full_name ?? null,
        newEnquiries: newEnquiries.count ?? 0,
        outstandingBalancePence: balance,
        outstandingPatients,
      });
      // Keep every status today — the bucketed sections handle showing
      // each one in the right place (cancelled and no-show land in the
      // red "Didn't happen" bucket at the bottom, completed in its own
      // muted bucket, and active ones up top).
      setUpcoming(apts);
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
    stats.outstandingPatients === 0 &&
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
          subtitle={
            stats.nextAppointmentTime
              ? [stats.nextAppointmentPatient, stats.nextAppointmentStaff && `with ${stats.nextAppointmentStaff}`]
                  .filter(Boolean)
                  .join(" · ") || "Today"
              : "Nothing left today"
          }
          onClick={() => {
            // Open the check-in sheet for the next scheduled appt (the
            // one displayed in this card). Falls back to /calendar if
            // there isn't one — better than a dead click.
            const next = upcoming.find(
              (a) =>
                (a.status === "SCHEDULED" || a.status === "CONFIRMED") &&
                new Date(a.starts_at) > new Date(),
            );
            if (next) setViewingAppointment(next);
            else navigate("/calendar");
          }}
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
            stats.outstandingPatients > 0
              ? `${stats.outstandingPatients} patient${stats.outstandingPatients === 1 ? "" : "s"} owing`
              : "All caught up"
          }
          highlight={stats.outstandingBalancePence > 0}
          onClick={() => navigate("/outstanding")}
        />
      </div>

      <GovernanceAttentionCard />

      {!statsLoading && upcoming.length > 0 && (
        <BucketedAppointments
          appointments={upcoming}
          onOpen={setViewingAppointment}
          onViewCalendar={() => navigate("/calendar")}
        />
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

      {/* Read-only summary opened by clicking a row in "Up next today".
          Keeps the operator on the Dashboard for a quick look; the
          sheet's "View in calendar" button is the path to actions like
          editing, rescheduling or status changes. */}
      <UpcomingAppointmentSheet
        appointment={viewingAppointment}
        onOpenChange={(open) => {
          if (!open) setViewingAppointment(null);
        }}
        onStatusChanged={() => {
          // After a check-in / status change, refresh the stats + lists
          // so the row moves to the right bucket immediately.
          loadStats();
        }}
      />
    </Layout>
  );
}

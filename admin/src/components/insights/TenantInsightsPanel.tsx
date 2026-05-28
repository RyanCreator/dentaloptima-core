import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Clock, Users, BarChart3, AlertTriangle, TrendingUp, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useServiceTimingInsights,
  type ServiceTimingInsight,
  type TimingFlag,
} from "@/hooks/useServiceTimingInsights";
import {
  useAppointmentOutcomes,
  type OutcomeCounts,
  type StaffOutcomeRow,
} from "@/hooks/useAppointmentOutcomes";
import {
  useChairUtilisation,
  type StaffUtilisationRow,
  type UtilisationBucket,
} from "@/hooks/useChairUtilisation";
import {
  useTreatmentVolume,
  type TreatmentVolumeRow,
} from "@/hooks/useTreatmentVolume";

interface TenantInsightsPanelProps {
  practiceId: string;
  practiceName: string;
}

// The Insights tab — performance report for a single tenant. Four
// sections, fed by three independent hooks; each hook queries
// dentaloptima-core via the service-role client. Sections render their
// own empty/loading states.
//
// The "Download report" button packages all four sections into a single
// PDF — designed as a deliverable the Dentaloptima team hands to the
// practice during the quarterly review.

export function TenantInsightsPanel({ practiceId, practiceName }: TenantInsightsPanelProps) {
  const { insights, loading: timingLoading, windowDays } = useServiceTimingInsights(practiceId);
  const { report: outcomes, loading: outcomesLoading } = useAppointmentOutcomes(practiceId);
  const { rows: utilisation, loading: utilLoading } = useChairUtilisation(practiceId);
  const { rows: volume, total: volumeTotal, loading: volumeLoading } = useTreatmentVolume(practiceId);
  const [downloading, setDownloading] = useState(false);

  const loading = timingLoading || outcomesLoading || utilLoading || volumeLoading;

  async function handleDownload() {
    setDownloading(true);
    try {
      const { generateInsightsPdf } = await import("@/lib/generateInsightsPdf");
      await generateInsightsPdf({
        practiceName,
        windowDays,
        timingInsights: insights,
        outcomes,
        utilisation,
        volume,
        volumeTotal,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-medium">Performance insights</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {windowDays} days of completed appointments. Use for the quarterly review.
          </p>
        </div>
        <Button onClick={handleDownload} disabled={loading || downloading}>
          <Download className="h-4 w-4 mr-1.5" />
          {downloading ? "Generating…" : "Download report (PDF)"}
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading insights…</p>
      )}

      {!loading && (
        <>
          <ServiceTimingSection insights={insights} />
          <OutcomesSection outcomes={outcomes?.overall ?? null} />
          <StaffOutcomesSection rows={outcomes?.per_staff ?? []} />
          <UtilisationSection rows={utilisation} />
          <TreatmentVolumeSection rows={volume} total={volumeTotal} />
        </>
      )}
    </div>
  );
}

// ── Section 1 — service timing ─────────────────────────────────────

function ServiceTimingSection({ insights }: { insights: ServiceTimingInsight[] }) {
  if (insights.length === 0) {
    return (
      <SectionCard icon={Clock} title="Service timing" subtitle="No completed appointments with start + end timestamps in the window.">
        <p className="text-sm text-muted-foreground">
          Timing data is collected from the new check-in → start → complete flow. Run a few
          appointments through it and this section will populate.
        </p>
      </SectionCard>
    );
  }
  const maxMinutes = Math.max(
    ...insights.map((i) => Math.max(i.scheduled_minutes, i.avg_actual_minutes)),
  );
  return (
    <SectionCard
      icon={Clock}
      title="Service timing — scheduled vs actual"
      subtitle="How long treatments actually take compared to their booked duration."
    >
      <PanelLegend
        items={[
          { label: "Scheduled (booked slot)", className: "bg-primary/70" },
          { label: "Actual avg — on track", className: "bg-emerald-500/80" },
          { label: "Actual avg — monitor", className: "bg-blue-500/80" },
          { label: "Actual avg — needs attention", className: "bg-amber-500/80" },
        ]}
      />
      <div className="space-y-3">
        {insights.map((row) => (
          <TimingRow key={row.service_id} row={row} maxMinutes={maxMinutes} />
        ))}
      </div>
    </SectionCard>
  );
}

function TimingRow({ row, maxMinutes }: { row: ServiceTimingInsight; maxMinutes: number }) {
  const schedWidth = (row.scheduled_minutes / maxMinutes) * 100;
  const actualWidth = Math.min((row.avg_actual_minutes / maxMinutes) * 100, 100);
  return (
    <div className="rounded-md border p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-center gap-2">
          <span className="font-medium text-sm truncate">{row.service_name}</span>
          <FlagPill flag={row.flag} />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {row.sample_count} sample{row.sample_count === 1 ? "" : "s"}
        </div>
      </div>

      {/* Two bars stacked — scheduled in primary, actual in flag colour.
          Width proportional to the longest value across the whole table
          so rows are visually comparable. */}
      <div className="space-y-1">
        <BarLine label="Scheduled" minutes={row.scheduled_minutes} widthPercent={schedWidth} tone="primary" />
        <BarLine
          label="Actual avg"
          minutes={row.avg_actual_minutes}
          widthPercent={actualWidth}
          tone={
            row.flag === "BUMP" ? "amber" : row.flag === "MONITOR" ? "blue" : "emerald"
          }
        />
      </div>

      {row.flag === "BUMP" && row.suggested_minutes && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Average is <strong>{row.variance_percent}% over</strong> the booked slot.
          Suggest bumping to <strong>{row.suggested_minutes} min</strong>.
        </p>
      )}
      {row.flag === "MONITOR" && (
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Mild overrun ({row.variance_percent}%) — keep an eye on this one over the next period.
        </p>
      )}
      {row.flag === "INSUFFICIENT_DATA" && (
        <p className="text-xs text-muted-foreground">
          Only {row.sample_count} completion{row.sample_count === 1 ? "" : "s"} in the window — need at least 5 for a reliable read.
        </p>
      )}
    </div>
  );
}

function BarLine({
  label,
  minutes,
  widthPercent,
  tone,
}: {
  label: string;
  minutes: number;
  widthPercent: number;
  tone: "primary" | "amber" | "blue" | "emerald";
}) {
  const fill =
    tone === "primary"
      ? "bg-primary/70"
      : tone === "amber"
        ? "bg-amber-500/80"
        : tone === "blue"
          ? "bg-blue-500/80"
          : "bg-emerald-500/80";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
        <div className={cn("h-full", fill)} style={{ width: `${Math.max(2, widthPercent)}%` }} />
      </div>
      <span className="w-16 text-right tabular-nums">{minutes.toFixed(0)} min</span>
    </div>
  );
}

function FlagPill({ flag }: { flag: TimingFlag }) {
  const map: Record<TimingFlag, { label: string; tone: string }> = {
    BUMP: { label: "Needs attention", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    MONITOR: { label: "Monitor", tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    ON_TRACK: { label: "On track", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    INSUFFICIENT_DATA: { label: "Not enough data", tone: "bg-muted text-muted-foreground" },
  };
  const { label, tone } = map[flag];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", tone)}>
      {label}
    </span>
  );
}

// ── Section 2 — overall outcomes ────────────────────────────────────

function OutcomesSection({ outcomes }: { outcomes: OutcomeCounts | null }) {
  if (!outcomes || outcomes.total === 0) {
    return (
      <SectionCard icon={BarChart3} title="Appointment outcomes" subtitle="No completed/no-show/cancelled appointments in the window.">
        <p className="text-sm text-muted-foreground">Once the practice has booked + worked through some appointments, the outcome split will show here.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      icon={BarChart3}
      title="Appointment outcomes"
      subtitle={`${outcomes.total} appointments in the window.`}
    >
      <PanelLegend
        items={[
          { label: "Completed", className: "bg-emerald-500/80" },
          { label: "No-show", className: "bg-amber-500/80" },
          { label: "Cancelled", className: "bg-red-500/80" },
          { label: "Rescheduled", className: "bg-muted-foreground/40" },
        ]}
      />
      <StackedOutcomeBar outcomes={outcomes} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <OutcomeStat label="Completed" value={outcomes.completed} total={outcomes.total} tone="emerald" />
        <OutcomeStat label="No-show" value={outcomes.no_show} total={outcomes.total} tone="amber" />
        <OutcomeStat label="Cancelled" value={outcomes.cancelled} total={outcomes.total} tone="red" />
        <OutcomeStat label="Rescheduled" value={outcomes.rescheduled} total={outcomes.total} tone="muted" />
      </div>
    </SectionCard>
  );
}

function StackedOutcomeBar({ outcomes }: { outcomes: OutcomeCounts }) {
  const pct = (n: number) => (outcomes.total > 0 ? (n / outcomes.total) * 100 : 0);
  return (
    <div className="flex h-3 rounded overflow-hidden bg-muted">
      <div className="bg-emerald-500/80" style={{ width: `${pct(outcomes.completed)}%` }} />
      <div className="bg-amber-500/80" style={{ width: `${pct(outcomes.no_show)}%` }} />
      <div className="bg-red-500/80" style={{ width: `${pct(outcomes.cancelled)}%` }} />
      <div className="bg-muted-foreground/40" style={{ width: `${pct(outcomes.rescheduled)}%` }} />
    </div>
  );
}

function OutcomeStat({
  label, value, total, tone,
}: {
  label: string; value: number; total: number; tone: "emerald" | "amber" | "red" | "muted";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const dot = {
    emerald: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", muted: "bg-muted-foreground/50",
  }[tone];
  return (
    <div className="rounded-md border p-2.5 bg-card">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground tabular-nums">{pct}% of total</div>
    </div>
  );
}

// ── Section 3 — outcomes per staff ──────────────────────────────────

function StaffOutcomesSection({ rows }: { rows: StaffOutcomeRow[] }) {
  if (rows.length === 0) return null;
  return (
    <SectionCard icon={Users} title="Per-staff performance" subtitle="Outcome split for each clinician in the window.">
      <PanelLegend
        items={[
          { label: "Completed", className: "bg-emerald-500/80" },
          { label: "No-show", className: "bg-amber-500/80" },
          { label: "Cancelled", className: "bg-red-500/80" },
          { label: "Rescheduled", className: "bg-muted-foreground/40" },
        ]}
      />
      <div className="space-y-2">
        {rows.map((r) => (
          <StaffOutcomeRowView key={r.staff_id} row={r} />
        ))}
      </div>
    </SectionCard>
  );
}

function StaffOutcomeRowView({ row }: { row: StaffOutcomeRow }) {
  return (
    <div className="rounded-md border p-3 bg-card space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-medium text-sm">{row.staff_name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {row.counts.total} total · {row.completion_rate}% completed
          {row.no_show_rate >= 10 && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              {row.no_show_rate}% no-show
            </span>
          )}
        </span>
      </div>
      <StackedOutcomeBar outcomes={row.counts} />
      <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground tabular-nums">
        <span>✓ {row.counts.completed}</span>
        <span>⚠ {row.counts.no_show}</span>
        <span>✗ {row.counts.cancelled}</span>
        <span>↻ {row.counts.rescheduled}</span>
      </div>
    </div>
  );
}

// ── Section 4 — chair utilisation ───────────────────────────────────

function UtilisationSection({ rows }: { rows: StaffUtilisationRow[] }) {
  if (rows.length === 0) {
    return (
      <SectionCard icon={TrendingUp} title="Chair utilisation" subtitle="No working hours configured for any staff member.">
        <p className="text-sm text-muted-foreground">Set up each clinician's weekly schedule on their Staff page to see utilisation.</p>
      </SectionCard>
    );
  }
  const allZero = rows.every((r) => r.treatment_minutes === 0);
  return (
    <SectionCard
      icon={TrendingUp}
      title="Chair utilisation"
      subtitle="Treatment time as a fraction of scheduled working time."
    >
      <PanelLegend
        items={[
          { label: "75%+ excellent", className: "bg-emerald-500/80" },
          { label: "50–74% healthy", className: "bg-blue-500/80" },
          { label: "25–49% room to grow", className: "bg-amber-500/80" },
          { label: "Below 25% under-used", className: "bg-red-500/80" },
        ]}
      />
      {allZero && (
        <div className="mb-3 rounded-md border border-dashed border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
          <strong>No utilisation data yet.</strong> Utilisation is calculated from the new
          check-in → start → complete timestamps on appointments. Once clinicians start
          recording those, this section will fill in. Scheduled hours are shown for reference.
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <UtilisationRowView key={r.staff_id} row={r} />
        ))}
      </div>
    </SectionCard>
  );
}

function UtilisationRowView({ row }: { row: StaffUtilisationRow }) {
  const widthPct = Math.min(row.utilisation_percent, 100);
  const tone = utilisationTone(row.utilisation_percent);
  return (
    <div className="rounded-md border p-3 bg-card space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-medium text-sm">{row.staff_name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(row.treatment_minutes / 60)}h treatment / {Math.round(row.scheduled_minutes / 60)}h scheduled · 90-day avg
        </span>
      </div>

      {/* Overall 90-day bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
          <div className={cn("h-full", tone)} style={{ width: `${Math.max(2, widthPct)}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums w-12 text-right">
          {row.utilisation_percent}%
        </span>
      </div>

      {/* Weekly + monthly trend */}
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-3 pt-1">
        <div className="sm:col-span-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Weekly (last 4 weeks)
          </p>
          <BucketStrip buckets={row.weekly} />
        </div>
        <div className="sm:col-span-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Monthly (last 3 months)
          </p>
          <BucketStrip buckets={row.monthly} />
        </div>
      </div>
    </div>
  );
}

function BucketStrip({ buckets }: { buckets: UtilisationBucket[] }) {
  if (buckets.length === 0) return null;
  return (
    <div className="flex gap-1.5">
      {buckets.map((b) => (
        <BucketBar key={b.label} bucket={b} />
      ))}
    </div>
  );
}

function BucketBar({ bucket }: { bucket: UtilisationBucket }) {
  const tone = utilisationTone(bucket.utilisation_percent);
  const hasSchedule = bucket.scheduled_minutes > 0;
  return (
    <div className="flex-1 min-w-0">
      <div
        className="h-8 rounded bg-muted relative overflow-hidden"
        title={`${bucket.label}: ${bucket.treatment_minutes} min worked / ${bucket.scheduled_minutes} min scheduled`}
      >
        {hasSchedule && (
          <div
            className={cn("absolute bottom-0 left-0 right-0", tone)}
            style={{ height: `${Math.min(bucket.utilisation_percent, 100)}%` }}
          />
        )}
      </div>
      <div className="mt-1 text-center">
        <div className="text-[10px] font-medium tabular-nums leading-none">
          {hasSchedule ? `${bucket.utilisation_percent}%` : "—"}
        </div>
        <div className="text-[9px] text-muted-foreground leading-none mt-0.5">{bucket.label}</div>
      </div>
    </div>
  );
}

function utilisationTone(pct: number): string {
  if (pct >= 75) return "bg-emerald-500/80";
  if (pct >= 50) return "bg-blue-500/80";
  if (pct >= 25) return "bg-amber-500/80";
  return "bg-red-500/80";
}

// ── Section 5 — treatment volume ────────────────────────────────────

function TreatmentVolumeSection({ rows, total }: { rows: TreatmentVolumeRow[]; total: number }) {
  if (rows.length === 0 || total === 0) {
    return (
      <SectionCard icon={ListChecks} title="Treatments performed" subtitle="No completed treatments in the window.">
        <p className="text-sm text-muted-foreground">Volume appears here once appointments are completed.</p>
      </SectionCard>
    );
  }
  // Cap the visible list to the top 12 — beyond that it's noise. Total
  // count + "Other" tail at the bottom keeps the sum honest.
  const VISIBLE = 12;
  const top = rows.slice(0, VISIBLE);
  const tail = rows.slice(VISIBLE);
  const tailCount = tail.reduce((s, r) => s + r.count, 0);
  const tailShare = total > 0 ? Math.round((tailCount / total) * 100) : 0;
  const maxCount = top[0]?.count ?? 1;
  return (
    <SectionCard
      icon={ListChecks}
      title="Treatments performed"
      subtitle={`${total} treatments delivered across ${rows.length} service${rows.length === 1 ? "" : "s"}.`}
    >
      <PanelLegend
        items={[
          { label: "Private treatment", className: "bg-primary/70" },
          { label: "NHS treatment", className: "bg-blue-500/70" },
        ]}
      />
      <div className="space-y-2">
        {top.map((row) => (
          <VolumeRow key={row.service_id} row={row} maxCount={maxCount} />
        ))}
        {tail.length > 0 && (
          <div className="text-xs text-muted-foreground pl-2 pt-1 border-t mt-2">
            + {tail.length} other service{tail.length === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums">{tailCount}</span> treatments ({tailShare}%)
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function VolumeRow({ row, maxCount }: { row: TreatmentVolumeRow; maxCount: number }) {
  const widthPct = (row.count / maxCount) * 100;
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-40 min-w-0 flex items-center gap-1.5">
        <span className="truncate">{row.service_name}</span>
        {row.is_nhs && (
          <span className="inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            NHS
          </span>
        )}
      </div>
      <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
        <div
          className={cn("h-full", row.is_nhs ? "bg-blue-500/70" : "bg-primary/70")}
          style={{ width: `${Math.max(2, widthPct)}%` }}
        />
      </div>
      <span className="w-20 text-right tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{row.count}</span> · {row.share_percent}%
      </span>
    </div>
  );
}

// ── Reusable legend strip ───────────────────────────────────────────

interface PanelLegendItem {
  label: string;
  className: string;
}

function PanelLegend({ items }: { items: PanelLegendItem[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", item.className)} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Reusable card wrapper ───────────────────────────────────────────

function SectionCard({
  icon: Icon, title, subtitle, children,
}: {
  icon: React.ElementType; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <h4 className="font-semibold text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

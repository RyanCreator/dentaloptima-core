// Tenant Insights PDF — quarterly-review deliverable that the
// Dentaloptima team hands to a practice. Five sections:
//   1. Service timing (scheduled vs actual)
//   2. Appointment outcomes (overall)
//   3. Per-staff outcomes
//   4. Chair utilisation
//   5. Treatment volume per service
//
// Vector PDF via @react-pdf/renderer — selectable text, small file,
// sharp at any zoom. Bar charts are <View> rectangles with
// proportional width; no canvas/raster step needed.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { Fragment } from "react";
import type { GenerateInsightsPdfArgs } from "./generateInsightsPdf";
import type {
  ServiceTimingInsight,
  TimingFlag,
} from "@/hooks/useServiceTimingInsights";
import type {
  AppointmentOutcomesReport,
  OutcomeCounts,
  StaffOutcomeRow,
} from "@/hooks/useAppointmentOutcomes";
import type {
  StaffUtilisationRow,
  UtilisationBucket,
} from "@/hooks/useChairUtilisation";
import type { TreatmentVolumeRow } from "@/hooks/useTreatmentVolume";

export async function renderInsightsPdf(args: GenerateInsightsPdfArgs): Promise<void> {
  const filename =
    sanitiseFilename(`${args.practiceName} performance report ${todayStamp()}`) + ".pdf";

  const blob = await pdf(
    <Document title={`${args.practiceName} — performance report`} author="Dentaloptima">
      <Page size="A4" style={styles.page}>
        <CoverHeader practiceName={args.practiceName} windowDays={args.windowDays} />
        <TimingSection insights={args.timingInsights} />
        <OutcomesSection outcomes={args.outcomes?.overall ?? null} />
        <PerStaffOutcomesSection rows={args.outcomes?.per_staff ?? []} />
        <UtilisationSection rows={args.utilisation} />
        <VolumeSection rows={args.volume} total={args.volumeTotal} />
        <Caveats />
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Dentaloptima · ${args.practiceName} · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>,
  ).toBlob();

  triggerDownload(blob, filename);
}

// ── Sections ────────────────────────────────────────────────────────

function CoverHeader({ practiceName, windowDays }: { practiceName: string; windowDays: number }) {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  return (
    <View style={styles.cover}>
      <View style={styles.coverTop}>
        <Text style={styles.brand}>DENTALOPTIMA</Text>
        <Text style={styles.coverDate}>{humanDate(now)}</Text>
      </View>
      <Text style={styles.coverEyebrow}>PERFORMANCE REPORT</Text>
      <Text style={styles.title}>{practiceName}</Text>
      <Text style={styles.subtitleMuted}>
        Reporting period · {humanDate(since)} – {humanDate(now)}
      </Text>
    </View>
  );
}

function TimingSection({ insights }: { insights: ServiceTimingInsight[] }) {
  return (
    <Fragment>
      <SectionHeader
        title="1 · Service timing"
        subtitle="Scheduled slot length vs actual treatment time (single-service appointments only)."
      />
      <Legend
        items={[
          { label: "Scheduled (booked slot)", colour: PRIMARY },
          { label: "Actual avg — on track", colour: COLOUR.green },
          { label: "Actual avg — monitor", colour: COLOUR.blue },
          { label: "Actual avg — needs attention", colour: COLOUR.amber },
        ]}
      />
      <View style={styles.sectionBody}>
        {insights.length === 0 ? (
          <Text style={styles.empty}>
            No completed appointments with start + end timestamps in the window. Timing data
            builds up as clinicians use the check-in → start → complete flow.
          </Text>
        ) : (
          insights.map((row) => (
            <TimingRow key={row.service_id} row={row} maxMinutes={timingMax(insights)} />
          ))
        )}
      </View>
    </Fragment>
  );
}

function timingMax(insights: ServiceTimingInsight[]): number {
  return Math.max(
    1,
    ...insights.map((i) => Math.max(i.scheduled_minutes, i.avg_actual_minutes)),
  );
}

function TimingRow({ row, maxMinutes }: { row: ServiceTimingInsight; maxMinutes: number }) {
  const schedWidth = (row.scheduled_minutes / maxMinutes) * 100;
  const actualWidth = Math.min((row.avg_actual_minutes / maxMinutes) * 100, 100);
  const flagColour = FLAG_COLOURS[row.flag];
  return (
    <View style={styles.timingRow} wrap={false}>
      <View style={styles.timingHeader}>
        <Text style={styles.timingName}>{row.service_name}</Text>
        <View style={[styles.pill, { backgroundColor: flagColour.bg }]}>
          <Text style={[styles.pillText, { color: flagColour.fg }]}>{flagColour.label}</Text>
        </View>
        <Text style={styles.timingSamples}>
          {row.sample_count} sample{row.sample_count === 1 ? "" : "s"}
        </Text>
      </View>
      <BarLine label="Scheduled" minutes={row.scheduled_minutes} widthPercent={schedWidth} colour={PRIMARY} />
      <BarLine
        label="Actual avg"
        minutes={row.avg_actual_minutes}
        widthPercent={actualWidth}
        colour={flagColour.bar}
      />
      {row.flag === "BUMP" && row.suggested_minutes && (
        <Text style={styles.timingNote}>
          Average is {row.variance_percent}% over the booked slot — suggest bumping to {row.suggested_minutes} min.
        </Text>
      )}
      {row.flag === "MONITOR" && (
        <Text style={styles.timingNote}>
          Mild overrun ({row.variance_percent}%) — review next quarter if the trend holds.
        </Text>
      )}
      {row.flag === "INSUFFICIENT_DATA" && (
        <Text style={styles.timingNoteMuted}>
          Only {row.sample_count} completion{row.sample_count === 1 ? "" : "s"} — need at least 5 for a reliable read.
        </Text>
      )}
    </View>
  );
}

function OutcomesSection({ outcomes }: { outcomes: OutcomeCounts | null }) {
  const hasData = !!outcomes && outcomes.total > 0;
  return (
    <Fragment>
      <SectionHeader
        title="2 · Appointment outcomes"
        subtitle={
          hasData
            ? `${outcomes!.total} appointments due in the window.`
            : "Appointment outcomes in the window."
        }
      />
      <Legend
        items={[
          { label: "Completed", colour: COLOUR.green },
          { label: "No-show", colour: COLOUR.amber },
          { label: "Cancelled", colour: COLOUR.red },
          { label: "Rescheduled", colour: COLOUR.grey },
        ]}
      />
      <View style={styles.sectionBody}>
        {!hasData ? (
          <Text style={styles.empty}>
            No completed / no-show / cancelled appointments in the window.
          </Text>
        ) : (
          <Fragment>
            <StackedOutcomeBar outcomes={outcomes!} />
            <View style={styles.statRow}>
              <StatBox label="Completed" value={outcomes!.completed} total={outcomes!.total} colour={COLOUR.green} />
              <StatBox label="No-show" value={outcomes!.no_show} total={outcomes!.total} colour={COLOUR.amber} />
              <StatBox label="Cancelled" value={outcomes!.cancelled} total={outcomes!.total} colour={COLOUR.red} />
              <StatBox label="Rescheduled" value={outcomes!.rescheduled} total={outcomes!.total} colour={COLOUR.grey} />
            </View>
          </Fragment>
        )}
      </View>
    </Fragment>
  );
}

function PerStaffOutcomesSection({ rows }: { rows: StaffOutcomeRow[] }) {
  return (
    <Fragment>
      <SectionHeader title="3 · Per-staff performance" subtitle="Outcome split for each clinician." />
      <Legend
        items={[
          { label: "Completed", colour: COLOUR.green },
          { label: "No-show", colour: COLOUR.amber },
          { label: "Cancelled", colour: COLOUR.red },
          { label: "Rescheduled", colour: COLOUR.grey },
        ]}
      />
      <View style={styles.sectionBody}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No clinician-tagged appointments in the window.</Text>
        ) : (
          rows.map((r) => (
            <View key={r.staff_id} style={styles.staffRow} wrap={false}>
              <View style={styles.staffHeader}>
                <Text style={styles.staffName}>{r.staff_name}</Text>
                <Text style={styles.staffSummary}>
                  {r.counts.total} appts · {r.completion_rate}% completed
                  {r.no_show_rate >= 10 ? ` · ${r.no_show_rate}% no-show` : ""}
                </Text>
              </View>
              <StackedOutcomeBar outcomes={r.counts} />
              <View style={styles.staffCounts}>
                <Text style={styles.staffCountText}>Completed {r.counts.completed}</Text>
                <Text style={styles.staffCountText}>No-show {r.counts.no_show}</Text>
                <Text style={styles.staffCountText}>Cancelled {r.counts.cancelled}</Text>
                <Text style={styles.staffCountText}>Rescheduled {r.counts.rescheduled}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Fragment>
  );
}

function UtilisationSection({ rows }: { rows: StaffUtilisationRow[] }) {
  const allZero = rows.length > 0 && rows.every((r) => r.treatment_minutes === 0);
  return (
    <Fragment>
      <SectionHeader
        title="4 · Chair utilisation"
        subtitle="Treatment time vs scheduled working time, with weekly + monthly trend."
      />
      <Legend
        items={[
          { label: "75%+ excellent", colour: COLOUR.green },
          { label: "50–74% healthy", colour: COLOUR.blue },
          { label: "25–49% room to grow", colour: COLOUR.amber },
          { label: "Below 25% under-used", colour: COLOUR.red },
        ]}
      />
      <View style={styles.sectionBody}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No working hours configured for any clinician.</Text>
        ) : (
          <Fragment>
            {allZero && (
              <Text style={styles.timingNoteMuted}>
                No clinicians have completed an appointment using the check-in → start → complete
                flow yet — utilisation will populate as the new instrumentation is used.
              </Text>
            )}
            {rows.map((r) => (
              <UtilisationStaffRow key={r.staff_id} row={r} />
            ))}
          </Fragment>
        )}
      </View>
    </Fragment>
  );
}

function UtilisationStaffRow({ row }: { row: StaffUtilisationRow }) {
  const widthPct = Math.min(row.utilisation_percent, 100);
  const colour = utilisationColour(row.utilisation_percent);
  return (
    <View style={styles.utilRow} wrap={false}>
      <View style={styles.utilHeader}>
        <Text style={styles.staffName}>{row.staff_name}</Text>
        <Text style={styles.staffSummary}>
          {Math.round(row.treatment_minutes / 60)}h / {Math.round(row.scheduled_minutes / 60)}h · 90-day avg
        </Text>
      </View>

      <View style={styles.utilBarRow}>
        <View style={styles.utilBarTrack}>
          <View style={[styles.utilBarFill, { width: `${Math.max(2, widthPct)}%`, backgroundColor: colour }]} />
        </View>
        <Text style={styles.utilPct}>{row.utilisation_percent}%</Text>
      </View>

      <View style={styles.bucketRow}>
        <View style={styles.bucketGroup}>
          <Text style={styles.bucketGroupLabel}>Weekly (last 4)</Text>
          <View style={styles.bucketStrip}>
            {row.weekly.map((b) => (
              <BucketColumn key={b.label} bucket={b} />
            ))}
          </View>
        </View>
        <View style={styles.bucketGroup}>
          <Text style={styles.bucketGroupLabel}>Monthly (last 3)</Text>
          <View style={styles.bucketStrip}>
            {row.monthly.map((b) => (
              <BucketColumn key={b.label} bucket={b} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function BucketColumn({ bucket }: { bucket: UtilisationBucket }) {
  const hasSchedule = bucket.scheduled_minutes > 0;
  const colour = utilisationColour(bucket.utilisation_percent);
  const fillPct = Math.min(bucket.utilisation_percent, 100);
  return (
    <View style={styles.bucketCol}>
      <View style={styles.bucketTrack}>
        {hasSchedule && (
          <View
            style={[
              styles.bucketFill,
              { height: `${fillPct}%`, backgroundColor: colour },
            ]}
          />
        )}
      </View>
      <Text style={styles.bucketPct}>{hasSchedule ? `${bucket.utilisation_percent}%` : "—"}</Text>
      <Text style={styles.bucketLabel}>{bucket.label}</Text>
    </View>
  );
}

function utilisationColour(pct: number): string {
  if (pct >= 75) return COLOUR.green;
  if (pct >= 50) return COLOUR.blue;
  if (pct >= 25) return COLOUR.amber;
  return COLOUR.red;
}

function VolumeSection({ rows, total }: { rows: TreatmentVolumeRow[]; total: number }) {
  return (
    <Fragment>
      <SectionHeader
        title="5 · Treatments performed"
        subtitle={
          total > 0
            ? `${total} treatments delivered across ${rows.length} service${rows.length === 1 ? "" : "s"}.`
            : "Volume of each treatment type performed."
        }
      />
      <Legend
        items={[
          { label: "Private treatment", colour: PRIMARY },
          { label: "NHS treatment", colour: COLOUR.blue },
        ]}
      />
      <View style={styles.sectionBody}>
        {rows.length === 0 || total === 0 ? (
          <Text style={styles.empty}>No completed treatments in the window.</Text>
        ) : (
          <Fragment>
            {rows.slice(0, 15).map((r) => {
              const widthPct = (r.count / (rows[0]?.count || 1)) * 100;
              return (
                <View key={r.service_id} style={styles.volumeRow} wrap={false}>
                  <View style={styles.volumeNameCol}>
                    <Text style={styles.volumeName}>{r.service_name}</Text>
                    {r.is_nhs && (
                      <View style={[styles.pill, { backgroundColor: COLOUR.blueBg }]}>
                        <Text style={[styles.pillText, { color: COLOUR.blue }]}>NHS</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.volumeBarTrack}>
                    <View
                      style={[
                        styles.volumeBarFill,
                        { width: `${Math.max(2, widthPct)}%`, backgroundColor: r.is_nhs ? COLOUR.blue : PRIMARY },
                      ]}
                    />
                  </View>
                  <Text style={styles.volumeCount}>
                    {r.count} · {r.share_percent}%
                  </Text>
                </View>
              );
            })}
            {rows.length > 15 && (
              <Text style={styles.volumeTail}>
                + {rows.length - 15} other services (
                {rows.slice(15).reduce((s, r) => s + r.count, 0)} treatments)
              </Text>
            )}
          </Fragment>
        )}
      </View>
    </Fragment>
  );
}

function Caveats() {
  return (
    <View style={styles.caveats} wrap={false}>
      <Text style={styles.caveatsTitle}>Notes</Text>
      <Text style={styles.caveatsText}>
        Timing data is drawn from check-in / start / complete timestamps. Service timing excludes
        multi-service appointments to keep per-service averages honest. Chair utilisation
        compares actual treatment minutes against the recurring weekly schedule for the window
        — it doesn&apos;t subtract approved time-off or practice closures, so a clinician with a
        long break may appear under-utilised. Treat the numbers as directional, not absolute.
      </Text>
    </View>
  );
}

// ── Primitives ──────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  // Splits "1 · Service timing" into a number chip + label so we can
  // style the section number distinctly without parsing in every caller.
  const match = /^(\d+)\s+·\s+(.+)$/.exec(title);
  const number = match?.[1];
  const label = match?.[2] ?? title;
  return (
    <View style={styles.sectionHeader} wrap={false}>
      <View style={styles.sectionTitleRow}>
        {number && (
          <View style={styles.sectionChip}>
            <Text style={styles.sectionChipText}>{number}</Text>
          </View>
        )}
        <Text style={styles.sectionTitle}>{label}</Text>
      </View>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

// Legend strip rendered under each section subtitle. Keeps colour
// meanings explicit so a reader can interpret the chart without
// hunting back through the prose.

interface LegendItem {
  label: string;
  colour: string;
}

function Legend({ items }: { items: LegendItem[] }) {
  return (
    <View style={styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: item.colour }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function BarLine({
  label,
  minutes,
  widthPercent,
  colour,
}: {
  label: string;
  minutes: number;
  widthPercent: number;
  colour: string;
}) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(2, widthPercent)}%`, backgroundColor: colour }]} />
      </View>
      <Text style={styles.barValue}>{Math.round(minutes)} min</Text>
    </View>
  );
}

function StackedOutcomeBar({ outcomes }: { outcomes: OutcomeCounts }) {
  const pct = (n: number) => (outcomes.total > 0 ? (n / outcomes.total) * 100 : 0);
  return (
    <View style={styles.stackedBar}>
      <View style={{ width: `${pct(outcomes.completed)}%`, backgroundColor: COLOUR.green }} />
      <View style={{ width: `${pct(outcomes.no_show)}%`, backgroundColor: COLOUR.amber }} />
      <View style={{ width: `${pct(outcomes.cancelled)}%`, backgroundColor: COLOUR.red }} />
      <View style={{ width: `${pct(outcomes.rescheduled)}%`, backgroundColor: COLOUR.grey }} />
    </View>
  );
}

function StatBox({
  label,
  value,
  total,
  colour,
}: {
  label: string;
  value: number;
  total: number;
  colour: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.statBox}>
      <View style={styles.statLabelRow}>
        <View style={[styles.statDot, { backgroundColor: colour }]} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statPct}>{pct}% of total</Text>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function sanitiseFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function humanDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Colours ─────────────────────────────────────────────────────────

const PRIMARY = "#3554d1";

const COLOUR = {
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  blueBg: "#dbeafe",
  grey: "#9ca3af",
};

const FLAG_COLOURS: Record<TimingFlag, { label: string; bg: string; fg: string; bar: string }> = {
  BUMP: { label: "NEEDS ATTENTION", bg: "#fef3c7", fg: "#92400e", bar: COLOUR.amber },
  MONITOR: { label: "MONITOR", bg: "#dbeafe", fg: "#1e40af", bar: COLOUR.blue },
  ON_TRACK: { label: "ON TRACK", bg: "#d1fae5", fg: "#065f46", bar: COLOUR.green },
  INSUFFICIENT_DATA: { label: "LOW DATA", bg: "#f3f4f6", fg: "#4b5563", bar: COLOUR.grey },
};

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 44,
    paddingVertical: 40,
    paddingBottom: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111111",
    lineHeight: 1.4,
  },
  cover: {
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: PRIMARY,
  },
  coverTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  brand: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: PRIMARY,
    letterSpacing: 2,
  },
  coverDate: {
    fontSize: 9,
    color: "#6b7280",
  },
  coverEyebrow: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    lineHeight: 1.15,
    marginBottom: 10,
  },
  subtitleMuted: {
    fontSize: 10,
    color: "#6b7280",
  },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#d1d5db",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PRIMARY,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  sectionChipText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  sectionSubtitle: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 3,
    marginLeft: 26,
  },
  sectionBody: {},
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
    marginLeft: 26,
    paddingTop: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 14,
    marginBottom: 2,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 4,
  },
  legendLabel: {
    fontSize: 8,
    color: "#4b5563",
  },
  empty: {
    fontSize: 9.5,
    color: "#6b7280",
    fontStyle: "italic",
  },
  timingRow: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  timingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  timingName: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  timingSamples: {
    fontSize: 8.5,
    color: "#6b7280",
    marginLeft: 6,
  },
  timingNote: {
    fontSize: 8.5,
    color: "#92400e",
    marginTop: 3,
  },
  timingNoteMuted: {
    fontSize: 8.5,
    color: "#6b7280",
    marginTop: 3,
  },
  pill: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginLeft: 6,
  },
  pillText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.4,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  barLabel: {
    fontSize: 8.5,
    color: "#6b7280",
    width: 56,
  },
  barTrack: {
    flex: 1,
    height: 7,
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 7,
  },
  barValue: {
    fontSize: 8.5,
    color: "#374151",
    width: 50,
    textAlign: "right",
  },
  stackedBar: {
    flexDirection: "row",
    height: 9,
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 8,
  },
  statRow: {
    flexDirection: "row",
    gap: 6,
  },
  statBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    padding: 6,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statLabel: {
    fontSize: 7.5,
    color: "#6b7280",
    letterSpacing: 0.4,
    fontFamily: "Helvetica-Bold",
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  statPct: {
    fontSize: 8,
    color: "#6b7280",
  },
  staffRow: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  staffHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  staffName: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
  },
  staffSummary: {
    fontSize: 9,
    color: "#6b7280",
  },
  staffCounts: {
    flexDirection: "row",
    marginTop: 2,
    gap: 12,
  },
  staffCountText: {
    fontSize: 8.5,
    color: "#6b7280",
  },
  utilRow: {
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  utilHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  utilBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  utilBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    overflow: "hidden",
  },
  utilBarFill: {
    height: 8,
  },
  utilPct: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginLeft: 6,
    width: 36,
    textAlign: "right",
  },
  bucketRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  bucketGroup: {
    flex: 1,
  },
  bucketGroupLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  bucketStrip: {
    flexDirection: "row",
    gap: 4,
  },
  bucketCol: {
    flex: 1,
    alignItems: "center",
  },
  bucketTrack: {
    width: "100%",
    height: 26,
    backgroundColor: "#f3f4f6",
    borderRadius: 2,
    position: "relative",
    overflow: "hidden",
  },
  bucketFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  bucketPct: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginTop: 2,
  },
  bucketLabel: {
    fontSize: 6.5,
    color: "#9ca3af",
    marginTop: 1,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  volumeNameCol: {
    width: 140,
    flexDirection: "row",
    alignItems: "center",
  },
  volumeName: {
    fontSize: 9.5,
    flexShrink: 1,
  },
  volumeBarTrack: {
    flex: 1,
    height: 7,
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    overflow: "hidden",
    marginHorizontal: 6,
  },
  volumeBarFill: {
    height: 7,
  },
  volumeCount: {
    fontSize: 9,
    color: "#374151",
    width: 60,
    textAlign: "right",
  },
  volumeTail: {
    fontSize: 8.5,
    color: "#6b7280",
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
    fontStyle: "italic",
  },
  caveats: {
    marginTop: 22,
    padding: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
  },
  caveatsTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 3,
    letterSpacing: 0.4,
  },
  caveatsText: {
    fontSize: 8.5,
    color: "#4b5563",
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

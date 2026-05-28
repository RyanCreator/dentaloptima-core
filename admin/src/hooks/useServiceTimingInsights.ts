import { useCallback, useEffect, useState } from "react";
import { supabaseCore } from "@/integrations/supabase/client";

// Compares scheduled service duration against actual treatment duration
// (completed_at - started_at) across recent completed appointments, so
// the Dentaloptima team can flag services where the booking grid doesn't
// match reality. Output drives both the Tenant → Insights tab and the
// downloadable PDF report.
//
// Design choices:
//   - Single-service appointments only. Multi-service appointments share
//     the total elapsed time across N services, which dilutes the signal;
//     simpler to ignore them for v1 than to apportion time.
//   - 90-day window. Recent enough to reflect current patterns, long
//     enough to gather samples for low-volume services.
//   - sample_count < 5 → "INSUFFICIENT_DATA". Below that the average is
//     just noise from one slow Tuesday.

export type TimingFlag = "BUMP" | "MONITOR" | "ON_TRACK" | "INSUFFICIENT_DATA";

export interface ServiceTimingInsight {
  service_id: string;
  service_name: string;
  scheduled_minutes: number;
  avg_actual_minutes: number;
  median_actual_minutes: number;
  sample_count: number;
  variance_minutes: number;
  variance_percent: number;
  flag: TimingFlag;
  /** When flag is BUMP, the rounded-up suggested duration. */
  suggested_minutes: number | null;
}

const WINDOW_DAYS = 90;
const MIN_SAMPLE = 5;
const BUMP_THRESHOLD = 20; // % variance
const MONITOR_THRESHOLD = 10; // % variance

function roundUpToBoundary(mins: number, boundary = 15): number {
  return Math.ceil(mins / boundary) * boundary;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

interface RawCompletion {
  appointment_id: string;
  started_at: string;
  completed_at: string;
  // appointment_service rows for this appointment — we only count
  // single-service appointments (length === 1) in the analytics.
  services: Array<{
    service: {
      id: string;
      name: string;
      duration_minutes: number;
    } | null;
  }>;
}

export function useServiceTimingInsights(practiceId: string | undefined) {
  const [insights, setInsights] = useState<ServiceTimingInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays] = useState(WINDOW_DAYS);

  const reload = useCallback(async () => {
    if (!practiceId) {
      setInsights([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    // Pull completed appointments in window WITH their services + the
    // service's configured duration. One round trip via the embed.
    const { data, error } = await supabaseCore
      .from("appointment")
      .select(
        `id, started_at, completed_at,
         services:appointment_service ( service:service_id (id, name, duration_minutes) )`,
      )
      .eq("practice_id", practiceId)
      .eq("status", "COMPLETED")
      .not("started_at", "is", null)
      .not("completed_at", "is", null)
      .gte("completed_at", since)
      .is("deleted_at", null)
      .limit(2000); // Hard cap on absurd practices; 2000 covers ~6 mo of normal volume.

    if (error || !data) {
      setInsights([]);
      setLoading(false);
      return;
    }

    // Bucket per-service actual durations from single-service completions.
    const byService = new Map<
      string,
      {
        service_name: string;
        scheduled_minutes: number;
        actuals: number[];
      }
    >();

    for (const row of data as unknown as RawCompletion[]) {
      // Only single-service appointments — multi-service ones dilute the
      // per-service signal (we don't know how the time was split between
      // services). Reduces sample size but keeps the analytics honest.
      if (!row.services || row.services.length !== 1) continue;
      const svc = row.services[0].service;
      if (!svc) continue;
      const actualMin =
        (new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) /
        60_000;
      // Sanity: ignore obviously wrong samples (negative durations from
      // mis-stamped started_at, or > 6h marathons that suggest a forgotten
      // status change). Both are noise.
      if (actualMin <= 0 || actualMin > 360) continue;

      const bucket = byService.get(svc.id) ?? {
        service_name: svc.name,
        scheduled_minutes: svc.duration_minutes,
        actuals: [],
      };
      bucket.actuals.push(actualMin);
      byService.set(svc.id, bucket);
    }

    const out: ServiceTimingInsight[] = [];
    for (const [service_id, b] of byService) {
      const sample_count = b.actuals.length;
      const avg = b.actuals.reduce((s, v) => s + v, 0) / sample_count;
      const med = median(b.actuals);
      const variance_minutes = avg - b.scheduled_minutes;
      const variance_percent =
        b.scheduled_minutes > 0 ? (variance_minutes / b.scheduled_minutes) * 100 : 0;

      let flag: TimingFlag = "ON_TRACK";
      let suggested_minutes: number | null = null;
      if (sample_count < MIN_SAMPLE) {
        flag = "INSUFFICIENT_DATA";
      } else if (variance_percent >= BUMP_THRESHOLD) {
        flag = "BUMP";
        // Round avg up to the next 15-min increment. This matches how
        // most practices think about slot length (15/30/45/60).
        suggested_minutes = roundUpToBoundary(avg);
      } else if (variance_percent >= MONITOR_THRESHOLD) {
        flag = "MONITOR";
      }

      out.push({
        service_id,
        service_name: b.service_name,
        scheduled_minutes: b.scheduled_minutes,
        avg_actual_minutes: Math.round(avg * 10) / 10,
        median_actual_minutes: Math.round(med * 10) / 10,
        sample_count,
        variance_minutes: Math.round(variance_minutes * 10) / 10,
        variance_percent: Math.round(variance_percent),
        flag,
        suggested_minutes,
      });
    }

    // Sort so the most-pressing services float to the top: BUMP first
    // (sorted by variance), then MONITOR, then ON_TRACK, then INSUFFICIENT.
    const flagOrder: Record<TimingFlag, number> = {
      BUMP: 0,
      MONITOR: 1,
      ON_TRACK: 2,
      INSUFFICIENT_DATA: 3,
    };
    out.sort((a, b) => {
      const f = flagOrder[a.flag] - flagOrder[b.flag];
      if (f !== 0) return f;
      return b.variance_percent - a.variance_percent;
    });

    setInsights(out);
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { insights, loading, windowDays, reload };
}

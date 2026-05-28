import { useCallback, useEffect, useState } from "react";
import { supabaseCore } from "@/integrations/supabase/client";

// Volume of each treatment type performed in the window. Unlike the
// timing-insights hook (which restricts to single-service appointments
// to keep per-service averages honest), this counts EVERY service that
// appears on a completed appointment — including those on combined
// visits, because the question "how many crowns did we do" should
// include crowns done alongside a checkup.

const WINDOW_DAYS = 90;

export interface TreatmentVolumeRow {
  service_id: string;
  service_name: string;
  is_nhs: boolean;
  count: number;
  /** Share of total treatments performed in the window. */
  share_percent: number;
}

interface RawRow {
  appointment_id: string;
  service: { id: string; name: string; is_nhs: boolean } | null;
}

export function useTreatmentVolume(practiceId: string | undefined) {
  const [rows, setRows] = useState<TreatmentVolumeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [windowDays] = useState(WINDOW_DAYS);

  const reload = useCallback(async () => {
    if (!practiceId) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);

    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    // Fetch appointment_service rows whose parent appointment was
    // completed in the window. Filter on the embedded appointment to
    // scope properly via PostgREST's inner-join semantics.
    const { data, error } = await supabaseCore
      .from("appointment_service")
      .select(
        `appointment_id,
         appointment:appointment_id!inner(status, completed_at, practice_id, deleted_at),
         service:service_id (id, name, is_nhs)`,
      )
      .eq("appointment.practice_id", practiceId)
      .eq("appointment.status", "COMPLETED")
      .gte("appointment.completed_at", since)
      .is("appointment.deleted_at", null)
      .limit(10000);

    if (error || !data) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const byService = new Map<string, { name: string; is_nhs: boolean; count: number }>();
    let runningTotal = 0;
    for (const row of data as unknown as RawRow[]) {
      const svc = row.service;
      if (!svc) continue;
      const bucket =
        byService.get(svc.id) ?? { name: svc.name, is_nhs: svc.is_nhs, count: 0 };
      bucket.count += 1;
      runningTotal += 1;
      byService.set(svc.id, bucket);
    }

    const out: TreatmentVolumeRow[] = Array.from(byService.entries())
      .map(([service_id, b]) => ({
        service_id,
        service_name: b.name,
        is_nhs: b.is_nhs,
        count: b.count,
        share_percent: runningTotal > 0 ? Math.round((b.count / runningTotal) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    setRows(out);
    setTotal(runningTotal);
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, total, loading, windowDays, reload };
}

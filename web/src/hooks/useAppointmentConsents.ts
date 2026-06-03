import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Pending-consent computation for an appointment.
//
// For every service on the appointment we look up the consent_template
// rows required by that service (consent_template_service join). Each
// active template is "needed". We then cross-reference the patient's
// signed consent_record rows — if there's a valid, non-revoked record
// for that template, we mark it satisfied. Otherwise it's pending.
//
// "Sign now" creates the unsigned consent_record rows in one go and
// returns the kiosk URL. The existing /kiosk/consents/:patientId route
// then walks them — no kiosk changes needed.

export interface AppointmentConsentStatus {
  template_id: string;
  template_code: string;
  template_title: string;
  template_version: string;
  template_body: string;
  /** consent_record.id if already signed (or queued unsigned), else null. */
  consent_record_id: string | null;
  /** True when a signed, valid, non-revoked record exists. */
  satisfied: boolean;
  /** When the satisfied record was signed (null while pending). */
  granted_at: string | null;
}

export function useAppointmentConsents(
  patientId: string | undefined,
  serviceIds: string[],
  practiceId: string | undefined,
  appointmentId?: string,
) {
  const [statuses, setStatuses] = useState<AppointmentConsentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!patientId || serviceIds.length === 0) {
      setStatuses([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Required templates for the appointment's services. We pull the
    // active template version per (code, practice) — older versions
    // don't count toward "required" any more.
    const { data: required, error: reqErr } = await supabase
      .from("consent_template_service")
      .select(
        `template_id,
         template:template_id (
           id, code, title, body, version, is_active, deleted_at
         )`,
      )
      .in("service_id", serviceIds);

    if (reqErr) {
      logger.error("Failed to load required consent templates", reqErr);
      setStatuses([]);
      setLoading(false);
      return;
    }

    // De-duplicate (two services can require the same template) and drop
    // anything that's been deactivated/deleted since the link was made.
    const templateMap = new Map<
      string,
      { id: string; code: string; title: string; body: string; version: string }
    >();
    for (const r of (required ?? []) as any[]) {
      const t = r.template;
      if (!t || t.deleted_at || !t.is_active) continue;
      templateMap.set(t.id, {
        id: t.id,
        code: t.code,
        title: t.title,
        body: t.body,
        version: t.version,
      });
    }

    if (templateMap.size === 0) {
      setStatuses([]);
      setLoading(false);
      return;
    }

    // Existing consent records for this patient — any template_id we
    // need. Includes still-pending (unsigned) rows so a second "Sign
    // now" click doesn't duplicate them.
    const templateIds = Array.from(templateMap.keys());
    const { data: existing, error: existErr } = await supabase
      .from("consent_record")
      .select(
        "id, template_id, granted_at, document_id, revoked_at, valid_until",
      )
      .eq("patient_id", patientId)
      .in("template_id", templateIds)
      .is("deleted_at", null)
      .order("granted_at", { ascending: false });

    if (existErr) {
      logger.error("Failed to load existing consents", existErr);
      setStatuses([]);
      setLoading(false);
      return;
    }

    const now = new Date();
    // For each template, pick the most-recent record that's still valid.
    // Pending (no document_id) records get matched but don't count as
    // satisfied — they're already-queued kiosk rows the patient hasn't
    // signed yet, so we can hand off the same row to the kiosk.
    const byTemplate = new Map<
      string,
      { id: string; signed: boolean; granted_at: string | null }
    >();
    for (const r of (existing ?? []) as any[]) {
      if (!r.template_id) continue;
      const existingPick = byTemplate.get(r.template_id);
      if (existingPick && existingPick.signed) continue; // prefer signed picks
      const signed = !!r.document_id && !r.revoked_at &&
        (!r.valid_until || new Date(r.valid_until) > now);
      // Keep the most-recent signed, else most-recent pending.
      if (!existingPick || (signed && !existingPick.signed)) {
        byTemplate.set(r.template_id, {
          id: r.id,
          signed,
          granted_at: r.granted_at,
        });
      }
    }

    const out: AppointmentConsentStatus[] = [];
    for (const t of templateMap.values()) {
      const pick = byTemplate.get(t.id);
      out.push({
        template_id: t.id,
        template_code: t.code,
        template_title: t.title,
        template_version: t.version,
        template_body: t.body,
        consent_record_id: pick?.id ?? null,
        satisfied: !!pick?.signed,
        granted_at: pick?.granted_at ?? null,
      });
    }
    setStatuses(out);
    setLoading(false);
  }, [patientId, serviceIds.join(","), practiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime: when the kiosk writes a signature (UPDATE on consent_record
  // setting document_id), or when reception adds another pending row, the
  // sheet auto-refreshes — no manual page refresh, no toast-and-pray
  // polling. Filtered server-side by patient so we don't hear every other
  // patient's traffic. Unique channel name per hook instance avoids the
  // StrictMode "cannot add postgres_changes after subscribe" collision.
  const channelId = useId();
  useEffect(() => {
    if (!patientId) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { void reload(); }, 250);
    };
    const channel = supabase
      .channel(`apt-consents-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "consent_record",
          filter: `patient_id=eq.${patientId}`,
        },
        scheduleRefetch,
      )
      .subscribe();
    // Belt-and-braces: also refetch when the user switches back to this
    // tab (e.g. after handing the kiosk back). Catches the edge case
    // where realtime momentarily disconnected.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [patientId, channelId, reload]);

  /**
   * Creates unsigned consent_record rows for every required template
   * that isn't already satisfied or queued. Returns the kiosk URL the
   * caller should send the patient to — the existing /kiosk route
   * walks any unsigned rows for the patient and captures signatures.
   */
  const queueAndOpenKiosk = useCallback(async (): Promise<string | null> => {
    if (!patientId || !practiceId) return null;
    const toCreate = statuses.filter((s) => !s.satisfied && !s.consent_record_id);
    if (toCreate.length > 0) {
      const rows = toCreate.map((s) => ({
        practice_id: practiceId,
        patient_id: patientId,
        // appointment_id ties the audit trail back to the visit that
        // triggered the consent. Nullable so the same insert path works
        // for ad-hoc kiosk handoffs outside an appointment.
        appointment_id: appointmentId ?? null,
        consent_type: "TREATMENT_SPECIFIC" as const,
        consent_version: s.template_version,
        consent_text: s.template_body,
        granted_method: "IPAD_SIGNATURE" as const,
        granted_by_patient: true,
        granted_at: new Date().toISOString(),
        template_id: s.template_id,
        template_version: s.template_version,
      }));
      const { error } = await supabase.from("consent_record").insert(rows);
      if (error) {
        // 23505 = unique violation — another tab/staff member just
        // queued the same template a moment ago. Not actually a failure
        // from the user's perspective: the kiosk will pick up the
        // existing pending row. Refetch silently and continue.
        if ((error as any).code !== "23505") {
          logger.error("Couldn't queue pending consents", error);
          return null;
        }
      }
    }
    return `/kiosk/consents/${patientId}`;
  }, [statuses, patientId, practiceId, appointmentId]);

  return { statuses, loading, reload, queueAndOpenKiosk };
}

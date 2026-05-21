// Shared type + defaults for the practice complaints procedure. Used by
// the Settings editor in the booking app and (in mirrored form) by the
// marketing site's public /complaints page. Keep this file in sync with
// `marketing/src/lib/complaintsProcedure.ts` — changes here should be
// copied across.
//
// The national-regulator contacts (GDC, CQC, Parliamentary Ombudsman) are
// intentionally NOT part of the per-practice JSON. They're identical for
// every UK dental practice, so they live as constants in the renderer.
// Centralising them means one place to update if any of those contacts
// change — and one less thing for practices to get wrong.

export interface LocalIcbContact {
  /** ICB display name, e.g. "NHS North East and North Cumbria ICB". */
  name: string;
  /** Multi-line postal address (newline-separated). */
  address: string;
  /** Optional enquiries email. */
  email: string | null;
  /** Optional enquiries phone. */
  phone: string | null;
}

export interface ComplaintsProcedureData {
  /** Named complaints manager — the patient's personal contact. */
  complaints_manager_name: string;
  /** e.g. "Practice Manager", "Owner". Shown alongside the name. */
  complaints_manager_role: string | null;
  /**
   * Direct email for the complaints manager. Optional — the renderer
   * falls back to the practice's primary_email when null.
   */
  complaints_manager_email: string | null;
  /** Hours within which we aim to resolve verbal complaints. Default 24. */
  ack_verbal_hours: number;
  /** Working days within which we acknowledge written complaints. Default 3. */
  ack_written_days: number;
  /** Working-day cadence for progress updates during investigation. Default 10. */
  update_cadence_days: number;
  /**
   * Whether the practice provides NHS care. Toggles the visibility of
   * the local NHS ICB escalation block and the Parliamentary Health
   * Ombudsman line on the public page.
   */
  accepts_nhs: boolean;
  /**
   * Local NHS Integrated Care Board contact for NHS complaints
   * escalation. Region-specific so it can't be hardcoded centrally.
   * Null when the practice is private-only (or hasn't filled it in yet).
   */
  local_icb: LocalIcbContact | null;
  /**
   * Free-text addendum appended to the rendered procedure. Useful for
   * practice-specific extras (e.g. signposting to Healthwatch). Treated
   * as plain text — newlines preserved, HTML escaped.
   */
  additional_notes: string | null;
  /**
   * ISO date (YYYY-MM-DD) of the last formal review. Rendered as
   * "Last reviewed dd mmm yyyy" on the public page, which doubles as a
   * CQC freshness signal.
   */
  last_reviewed_at: string | null;
}

/**
 * Safe starting point when a practice opens the editor for the first
 * time. Pre-populates the timeline numbers and accepts-NHS to match the
 * most common UK practice setup. Practice-specific bits (manager name,
 * ICB) are left empty so the operator has to consciously fill them in.
 */
export const COMPLAINTS_PROCEDURE_DEFAULTS: ComplaintsProcedureData = {
  complaints_manager_name: "",
  complaints_manager_role: "Practice Manager",
  complaints_manager_email: null,
  ack_verbal_hours: 24,
  ack_written_days: 3,
  update_cadence_days: 10,
  accepts_nhs: true,
  local_icb: null,
  additional_notes: null,
  last_reviewed_at: null,
};

/**
 * Returns true when the procedure has enough content to be publishable —
 * i.e. a named complaints manager. Used to gate the "publish to public
 * site" affordance and to surface "incomplete" warnings in the editor.
 */
export function isComplaintsProcedurePublishable(
  d: ComplaintsProcedureData | null,
): boolean {
  if (!d) return false;
  return d.complaints_manager_name.trim().length > 0;
}

/**
 * Coerce an arbitrary DB value back into our typed shape, applying
 * defaults for missing keys. JSONB columns return `unknown`; this gives
 * downstream code a stable type to work against without each consumer
 * re-validating field-by-field.
 */
export function normaliseComplaintsProcedure(
  raw: unknown,
): ComplaintsProcedureData {
  if (!raw || typeof raw !== "object") return { ...COMPLAINTS_PROCEDURE_DEFAULTS };
  const r = raw as Partial<ComplaintsProcedureData>;
  return {
    ...COMPLAINTS_PROCEDURE_DEFAULTS,
    ...r,
    // Manually merge nested icb so a partial DB write doesn't lose fields.
    local_icb: r.local_icb
      ? {
          name: r.local_icb.name ?? "",
          address: r.local_icb.address ?? "",
          email: r.local_icb.email ?? null,
          phone: r.local_icb.phone ?? null,
        }
      : null,
  };
}

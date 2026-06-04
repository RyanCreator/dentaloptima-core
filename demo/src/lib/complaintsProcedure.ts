// Shared type + defaults for the practice complaints procedure. Mirrored
// from `web/src/lib/complaintsProcedure.ts` — the marketing site only
// needs the shape + normaliser to render whatever the booking app saved,
// so we don't ship the defaults to clients here. Keep this file in sync
// with the booking-app copy.

export interface LocalIcbContact {
  name: string;
  address: string;
  email: string | null;
  phone: string | null;
}

export interface ComplaintsProcedureData {
  complaints_manager_name: string;
  complaints_manager_role: string | null;
  complaints_manager_email: string | null;
  ack_verbal_hours: number;
  ack_written_days: number;
  ack_written_days_unit?: "working_days" | "days";
  update_cadence_days: number;
  accepts_nhs: boolean;
  local_icb: LocalIcbContact | null;
  additional_notes: string | null;
  last_reviewed_at: string | null;
}

const DEFAULTS: ComplaintsProcedureData = {
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
 * Coerce a raw JSONB value into our typed shape, applying defaults for
 * missing keys. Returns `null` only when the input is null/undefined —
 * the public site uses that to render a "not yet published" state.
 */
export function normaliseComplaintsProcedure(
  raw: unknown,
): ComplaintsProcedureData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ComplaintsProcedureData>;
  // Treat an explicit empty manager name as "not yet published" — the
  // booking app prevents publishing without one, but a half-filled draft
  // could exist in the DB.
  if (!r.complaints_manager_name?.trim()) return null;
  return {
    ...DEFAULTS,
    ...r,
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

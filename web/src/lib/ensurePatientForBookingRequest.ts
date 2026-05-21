import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type EnsurePatientResult =
  | {
      ok: true;
      patientId: string;
      // True only when a brand-new patient row was inserted. False when
      // the booking_request already linked to a patient OR an existing
      // patient was matched by email / phone+last-name.
      created: boolean;
      // True when an existing patient was matched (i.e. we did NOT create
      // a new row and the booking_request had no prior link).
      matched: boolean;
      // For UX — the matched patient's display name so the caller can
      // surface "Linked to existing patient: …" feedback.
      matchedName?: string;
      // Which signal produced the match — useful for diagnostic toasts
      // ("matched by email" vs "matched by phone").
      matchedBy?: "email" | "phone";
    }
  | { ok: false; error: string };

interface Params {
  practiceId: string;
  requestId: string;
  existingPatientId: string | null;
  fallback?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

// Strip whitespace, parens, hyphens, dots, plus signs — anything visual.
// Matches the normalisation done by the public booking form so a phone
// stored from the form will compare equal to one typed in the staff UI
// (which we also normalise on patient insert below).
function normalisePhone(raw: string): string {
  return raw.replace(/[\s()\-.+]/g, "");
}

function eqCaseInsensitive(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Resolves the patient row to use for a booking_request action (book or
// waitlist). Order of resolution:
//   1. If the booking_request already links to a patient, use that.
//   2. If the public-form email matches an existing patient (citext, so
//      case-insensitive), reuse it. Prefer a row whose last_name also
//      matches when there are multiple email hits — covers the case
//      where a family shares one inbox.
//   3. If the (normalised) phone matches an existing patient AND the
//      last_name matches, reuse it. We require the last_name match
//      here because phone numbers are commonly shared (landlines,
//      family mobiles) and we don't want to silently link a booking
//      to the wrong household member.
//   4. Otherwise create a new PROSPECT patient and link the request.
export async function ensurePatientForBookingRequest({
  practiceId,
  requestId,
  existingPatientId,
  fallback,
}: Params): Promise<EnsurePatientResult> {
  if (existingPatientId) {
    return {
      ok: true,
      patientId: existingPatientId,
      created: false,
      matched: false,
    };
  }

  const first = fallback?.first_name?.trim();
  const last = fallback?.last_name?.trim();
  if (!first || !last) {
    return {
      ok: false,
      error:
        "Enquiry is missing the patient's name — can't create a patient record",
    };
  }

  const rawEmail = fallback?.email?.trim() || null;
  const rawPhone = fallback?.phone?.trim() || null;
  const normalisedPhone = rawPhone ? normalisePhone(rawPhone) : null;

  // ── 1. Email match (citext column → case-insensitive on DB side) ──
  if (rawEmail) {
    const { data: emailMatches, error: emailErr } = await supabase
      .from("patient")
      .select("id, full_name, last_name")
      .eq("practice_id", practiceId)
      .eq("email", rawEmail)
      .is("deleted_at", null)
      .limit(5);

    if (emailErr) {
      logger.error("Patient email lookup failed", emailErr);
    } else if (emailMatches && emailMatches.length > 0) {
      const byLast = emailMatches.find((p) =>
        eqCaseInsensitive(p.last_name, last),
      );
      const chosen = byLast || emailMatches[0];
      await supabase
        .from("booking_request")
        .update({ patient_id: chosen.id })
        .eq("id", requestId);
      return {
        ok: true,
        patientId: chosen.id,
        created: false,
        matched: true,
        matchedName: chosen.full_name ?? `${first} ${last}`,
        matchedBy: "email",
      };
    }
  }

  // ── 2. Phone match (requires last-name match — phones are shared) ──
  if (normalisedPhone) {
    // Try the normalised form first (matches form-submitted phones and
    // those we wrote through this helper). If nothing hits, also try
    // the raw form in case a staff member typed the phone with spaces.
    const phoneCandidates: { id: string; full_name: string | null; last_name: string | null; phone: string | null }[] = [];

    const { data: pNorm } = await supabase
      .from("patient")
      .select("id, full_name, last_name, phone")
      .eq("practice_id", practiceId)
      .eq("phone", normalisedPhone)
      .is("deleted_at", null)
      .limit(10);
    if (pNorm) phoneCandidates.push(...pNorm);

    if (rawPhone && rawPhone !== normalisedPhone) {
      const { data: pRaw } = await supabase
        .from("patient")
        .select("id, full_name, last_name, phone")
        .eq("practice_id", practiceId)
        .eq("phone", rawPhone)
        .is("deleted_at", null)
        .limit(10);
      if (pRaw) {
        for (const row of pRaw) {
          if (!phoneCandidates.some((c) => c.id === row.id)) {
            phoneCandidates.push(row);
          }
        }
      }
    }

    const byLast = phoneCandidates.find((p) =>
      eqCaseInsensitive(p.last_name, last),
    );
    if (byLast) {
      await supabase
        .from("booking_request")
        .update({ patient_id: byLast.id })
        .eq("id", requestId);
      return {
        ok: true,
        patientId: byLast.id,
        created: false,
        matched: true,
        matchedName: byLast.full_name ?? `${first} ${last}`,
        matchedBy: "phone",
      };
    }
  }

  // ── 3. No match — create a new PROSPECT row ────────────────────────
  const { data: newPatient, error: patientError } = await supabase
    .from("patient")
    .insert({
      practice_id: practiceId,
      first_name: first,
      last_name: last,
      email: rawEmail,
      phone: normalisedPhone || rawPhone,
      registration_status: "PROSPECT",
    })
    .select("id")
    .single();

  if (patientError || !newPatient) {
    logger.error(
      "Failed to create patient from booking request",
      patientError,
    );
    return { ok: false, error: "Failed to create patient record" };
  }

  await supabase
    .from("booking_request")
    .update({ patient_id: newPatient.id })
    .eq("id", requestId);

  return {
    ok: true,
    patientId: newPatient.id,
    created: true,
    matched: false,
  };
}

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Direct-to-DB appointment creation. Replaces the legacy "create-appointment"
// edge function — that function isn't deployed against dentaloptima-core
// (only create-practice-with-owner / invite-member / set-operator-role
// are), and we don't actually need a service-role round-trip:
//
//   - RLS scopes inserts to the caller's practice automatically.
//   - The `appointment` table has a GiST exclusion constraint that prevents
//     overlapping non-cancelled appointments per staff at the DB level —
//     atomic, no race, no need for a transaction in the edge function.
//   - `appointment_service` is a separate insert; if it fails after the
//     appointment row was created, we roll the appointment back manually.
//
// Returns the same { success, appointment, error } shape the old edge
// function did, so call sites barely change.

export interface CreateAppointmentInput {
  practiceId: string;
  staffId: string;
  serviceId: string;
  /** Already in the desired wall-clock time. Caller handles UK timezone math. */
  startsAt: Date;
  /** Optional clinical/admin note attached to the appointment. */
  notes?: string;
  /** Existing patient. Mutually exclusive with `newPatient`. */
  patientId?: string;
  /** New patient — created on the fly before the appointment. */
  newPatient?: {
    fullName: string;
    phone: string;
    email?: string;
  };
}

export interface CreateAppointmentResult {
  success: boolean;
  appointment?: { id: string; patient_id: string };
  error?: string;
}

/** Splits "Jane Smith" → { first: "Jane", last: "Smith" }. Single-word names
 *  go in first_name with last_name = "" so the NOT NULL constraint passes
 *  without putting the only name in the wrong column. */
function splitFullName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim();
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1) };
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  if (!input.patientId && !input.newPatient) {
    return { success: false, error: "Patient is required" };
  }

  // 1. Resolve patient id — create a new prospect record if needed.
  let patientId = input.patientId;
  if (!patientId && input.newPatient) {
    const { first, last } = splitFullName(input.newPatient.fullName);
    if (!first && !last) {
      return { success: false, error: "Patient name is required" };
    }
    const { data, error } = await supabase
      .from("patient")
      .insert({
        practice_id: input.practiceId,
        first_name: first,
        last_name: last,
        phone: input.newPatient.phone || null,
        email: input.newPatient.email?.trim() || null,
        registration_status: "PROSPECT",
      })
      .select("id")
      .single();
    if (error || !data) {
      logger.error("Failed to create patient", error);
      return { success: false, error: error?.message ?? "Failed to create patient" };
    }
    patientId = data.id;
  }

  if (!patientId) {
    return { success: false, error: "Patient is required" };
  }

  // 2. Read the service so we know duration + buffers + price snapshot.
  const { data: service, error: serviceError } = await supabase
    .from("service")
    .select("id, duration_minutes, buffer_before_minutes, buffer_after_minutes, price_pence")
    .eq("id", input.serviceId)
    .single();
  if (serviceError || !service) {
    return { success: false, error: serviceError?.message ?? "Service not found" };
  }

  // 3. Compute the booked window. Buffer-before extends backwards (so
  //    sterilisation/setup blocks the slot before the visit), buffer-after
  //    extends forwards.
  const startsAt = new Date(input.startsAt);
  startsAt.setMinutes(startsAt.getMinutes() - (service.buffer_before_minutes ?? 0));
  const endsAt = new Date(input.startsAt);
  endsAt.setMinutes(
    endsAt.getMinutes() + service.duration_minutes + (service.buffer_after_minutes ?? 0),
  );

  // 4. Insert the appointment. Postgres exclusion constraint code 23P01
  //    fires when there's an overlap with a non-cancelled appointment for
  //    the same staff member — surface a friendly message for that case.
  const { data: appt, error: aptError } = await supabase
    .from("appointment")
    .insert({
      practice_id: input.practiceId,
      patient_id: patientId,
      staff_id: input.staffId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "SCHEDULED",
      booking_source: "INTERNAL",
    })
    .select("id, patient_id")
    .single();

  if (aptError || !appt) {
    if (aptError?.code === "23P01" || /overlap|exclusion/i.test(aptError?.message ?? "")) {
      return {
        success: false,
        error: "This time overlaps with another appointment for the same staff member.",
      };
    }
    logger.error("Failed to create appointment", aptError);
    return { success: false, error: aptError?.message ?? "Failed to create appointment" };
  }

  // 5. Attach the service. If this fails the appointment is orphaned without
  //    a service link, so roll the appointment row back so we don't leave
  //    half-state behind.
  const { error: asError } = await supabase.from("appointment_service").insert({
    practice_id: input.practiceId,
    appointment_id: appt.id,
    service_id: input.serviceId,
    display_order: 0,
    duration_minutes_snapshot: service.duration_minutes,
    price_pence_snapshot: service.price_pence ?? null,
  });

  if (asError) {
    logger.error("Failed to attach service — rolling back appointment", asError);
    await supabase.from("appointment").delete().eq("id", appt.id);
    return { success: false, error: asError.message ?? "Failed to attach service" };
  }

  // 6. Optional clinical/admin note. Best-effort; if it fails the
  //    appointment is still considered booked.
  if (input.notes && input.notes.trim()) {
    const { error: noteError } = await supabase.from("note").insert({
      practice_id: input.practiceId,
      parent_type: "APPOINTMENT",
      parent_id: appt.id,
      patient_id: patientId,
      body: input.notes.trim(),
      note_type: "ADMIN",
    });
    if (noteError) {
      logger.error("Appointment created but note insert failed", noteError);
    }
  }

  return { success: true, appointment: appt };
}

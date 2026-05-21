// Domain entity types — match the dentaloptima-core public schema, not the
// legacy app_staff/services schema. Field names follow the new conventions:
// is_active (not active), color_hex (not colour_tag), price_pence (not
// price), first_name + last_name + full_name (not just full_name), etc.

export interface Patient {
  id: string;
  practice_id: string;
  patient_number: string | null;
  title: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  full_name: string; // generated column on the new schema
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  dob: string | null;
  nhs_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  preferred_dentist_id: string | null;
  last_visited_at: string | null;
  next_recall_date: string | null;
  registration_status: string | null;
  marketing_consent_email: boolean | null;
  marketing_consent_sms: boolean | null;
  marketing_consent_post: boolean | null;
  legal_hold: boolean | null;
  created_at: string;
}

// Renamed from `Staff`. Backed by `public.practice_member`.
export interface Staff {
  id: string;
  user_id: string | null;
  practice_id: string;
  role: "OWNER" | "ADMIN" | "DENTIST" | "HYGIENIST" | "NURSE" | "RECEPTIONIST";
  full_name: string | null;
  email: string;
  phone: string | null;
  gdc_number: string | null;
  specialism: string | null;
  is_active: boolean;
  available_for_booking: boolean;
  color_hex: string | null;
  created_at?: string;
}

export interface Service {
  id: string;
  practice_id: string;
  name: string;
  description: string | null;
  treatment_type: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price_pence: number;
  is_nhs: boolean;
  nhs_band: string | null;
  recall_months: number | null;
  color_hex: string | null;
  display_order: number;
  is_publicly_bookable: boolean;
  is_active: boolean;
  created_at?: string;
}

// Helper: format `price_pence` for display. Pence/100 with one or two
// decimal places as needed. Example: 4500 → "£45", 4525 → "£45.25".
export function formatPrice(pence: number | null | undefined, withSymbol: boolean = true): string {
  if (pence === null || pence === undefined) return "—";
  const pounds = pence / 100;
  const formatted = pounds % 1 === 0
    ? pounds.toFixed(0)
    : pounds.toFixed(2);
  return withSymbol ? `£${formatted}` : formatted;
}

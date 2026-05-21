import { usePractice } from "@/contexts/PracticeContext";

interface ClinicSettings {
  clinic_name: string;
  timezone: string;
  default_appt_duration: number;
  reminder_days_before: number | null;
  reminder_hours_before: number | null;
  min_booking_notice_hours: number | null;
  max_advance_booking_days: number | null;
}

// In dentaloptima-core, basic clinic identity (name, timezone, country)
// lives on the `practice` row and is loaded once at boot via
// PracticeBootstrap. Booking-policy defaults (min notice, max advance,
// default appt duration, reminder timings) aren't on `practice` yet —
// they'll come back as a `practice_settings` table or extra columns when
// we bring that feature back. For now we return reasonable defaults.
export function useClinicSettings() {
  const tenant = usePractice();

  const settings: ClinicSettings = {
    clinic_name: tenant.practice.name,
    timezone: tenant.practice.timezone,
    default_appt_duration: 30,
    reminder_days_before: 1,
    reminder_hours_before: 1,
    min_booking_notice_hours: 2,
    max_advance_booking_days: 60,
  };

  return {
    settings,
    loading: false,
    timezone: tenant.practice.timezone,
    clinicName: tenant.practice.name,
    defaultApptDuration: 30,
    bookingPolicy: {
      minNoticeHours: 2,
      maxAdvanceDays: 60,
    },
  };
}

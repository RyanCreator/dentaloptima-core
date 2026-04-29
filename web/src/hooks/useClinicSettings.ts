import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ClinicSettings {
  clinic_name: string;
  timezone: string;
  default_appt_duration: number;
  reminder_days_before: number | null;
  reminder_hours_before: number | null;
  min_booking_notice_hours: number | null;
  max_advance_booking_days: number | null;
}

/**
 * Hook to load and provide clinic settings including timezone
 * Returns Europe/London as fallback if settings not loaded
 */
export function useClinicSettings() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .single();

    if (!error && data) {
      setSettings(data);
    }
    setLoading(false);
  };

  return {
    settings,
    loading,
    // Provide timezone with fallback
    timezone: settings?.timezone || "Europe/London",
    clinicName: settings?.clinic_name || "",
    defaultApptDuration: settings?.default_appt_duration || 30,
    // Booking policy — fallbacks match the DB defaults so first-boot
    // behaviour is still reasonable if settings haven't loaded yet.
    bookingPolicy: {
      minNoticeHours: settings?.min_booking_notice_hours ?? 2,
      maxAdvanceDays: settings?.max_advance_booking_days ?? 60,
    },
  };
}

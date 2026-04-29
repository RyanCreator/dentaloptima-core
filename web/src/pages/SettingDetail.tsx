import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { ServicesSettings } from "@/components/settings/ServicesSettings";

interface Settings {
  id: string;
  clinic_name: string;
  timezone: string;
  default_appt_duration: number;
  reminder_days_before: number | null;
  reminder_hours_before: number | null;
  post_appointment_hours_after: number | null;
  google_review_url: string | null;
  from_email: string | null;
  from_name: string | null;
  practice_phone: string | null;
  practice_address: string | null;
  practice_website: string | null;
  min_booking_notice_hours: number;
  max_advance_booking_days: number;
  notify_on_enquiry_received: boolean | null;
  notify_on_appointment_confirmed: boolean | null;
  notify_on_appointment_cancelled: boolean | null;
  notify_on_appointment_rescheduled: boolean | null;
  notify_on_request_rejected: boolean | null;
  notify_on_waitlist_added: boolean | null;
  notify_on_recall_due: boolean;
  recall_reminder_lead_days: number;
  auto_send_invoice_on_completion: boolean;
}

export default function SettingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading } = useRequireAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      loadSettings();
    }
  }, [loading]);

  const loadSettings = async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .single();

    if (error || !data) {
      setLoadError(error?.message ?? "Settings row not found");
      return;
    }
    setSettings(data);
  };

  const handleSave = async () => {
    if (!settings) return;

    // Reminder timing sanity check: second reminder (hours before) should be
    // closer to the appointment than the first reminder (days before). If not,
    // they'll collapse or fire in the wrong order.
    const days = settings.reminder_days_before ?? 0;
    const hours = settings.reminder_hours_before ?? 0;
    if (days > 0 && hours > 0 && hours >= days * 24) {
      toast.error(
        `Second reminder (${hours}h) must be closer than first (${days}d = ${days * 24}h)`
      );
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        clinic_name: settings.clinic_name,
        timezone: settings.timezone,
        default_appt_duration: settings.default_appt_duration,
        reminder_days_before: settings.reminder_days_before,
        reminder_hours_before: settings.reminder_hours_before,
        post_appointment_hours_after: settings.post_appointment_hours_after,
        google_review_url: settings.google_review_url?.trim() || null,
        from_email: settings.from_email?.trim() || null,
        from_name: settings.from_name?.trim() || null,
        practice_phone: settings.practice_phone?.trim() || null,
        practice_address: settings.practice_address?.trim() || null,
        practice_website: settings.practice_website?.trim() || null,
        min_booking_notice_hours: settings.min_booking_notice_hours,
        max_advance_booking_days: settings.max_advance_booking_days,
        notify_on_enquiry_received: settings.notify_on_enquiry_received,
        notify_on_appointment_confirmed: settings.notify_on_appointment_confirmed,
        notify_on_appointment_cancelled: settings.notify_on_appointment_cancelled,
        notify_on_appointment_rescheduled: settings.notify_on_appointment_rescheduled,
        notify_on_request_rejected: settings.notify_on_request_rejected,
        notify_on_waitlist_added: settings.notify_on_waitlist_added,
        notify_on_recall_due: settings.notify_on_recall_due,
        recall_reminder_lead_days: settings.recall_reminder_lead_days,
        auto_send_invoice_on_completion: settings.auto_send_invoice_on_completion,
      })
      .eq("id", settings.id);

    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Settings saved successfully");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Layout title="Loading...">
        <div>Loading...</div>
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout title="Settings" onBack={() => navigate("/settings")}>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">Couldn't load settings</p>
            <p className="text-xs text-destructive/80 mt-0.5 break-words">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 text-xs"
              onClick={loadSettings}
            >
              <RefreshCw className="h-3 w-3 mr-1.5" />
              Try again
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!settings) {
    return (
      <Layout title="Loading...">
        <div>Loading...</div>
      </Layout>
    );
  }

  const getTitle = () => {
    switch (id) {
      case "clinic":
        return "Clinic Settings";
      case "appointments":
        return "Appointment Settings";
      case "templates":
        return "Message Templates";
      case "services":
        return "Services Management";
      default:
        return "Settings";
    }
  };

  const renderContent = () => {
    if (id === "services") {
      return <ServicesSettings />;
    }

    if (id === "clinic" || id === "appointments" || id === "templates") {
      return (
        <GeneralSettings
          settingType={id}
          settings={settings}
          onSettingsChange={setSettings}
          onSave={handleSave}
          saving={saving}
        />
      );
    }

    return null;
  };

  return (
    <Layout title={getTitle()} onBack={() => navigate("/settings")}>
      <div className="space-y-6">
        <div className="bg-card rounded-lg border p-6 space-y-6">
          {renderContent()}
        </div>
      </div>
    </Layout>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ServicesSettings } from "@/components/settings/ServicesSettings";
import { HoursAndClosures } from "@/components/settings/HoursAndClosures";
import { ComplaintsProcedureSettings } from "@/components/settings/ComplaintsProcedureSettings";
import { PageLoading } from "@/components/PageLoading";
import { SettingsShell } from "@/components/SettingsShell";
import { AlertCircle, ChevronRight, RefreshCw, RotateCcw, Mail, Bell } from "lucide-react";

// Adapted to dentaloptima-core. Settings are split across two tables:
//   - `practice`         (name, timezone, address, primary phone — identity)
//   - `practice_setting` (booking window, reminders, message templates,
//                         notification toggles — operational config)
// The Settings UI loads + saves both. RLS enforces:
//   - Anyone on the practice can read settings.
//   - Only OWNER/ADMIN can update either table; non-admin saves get
//     rejected by the policy and we surface a friendly toast.

interface PracticeRow {
  id: string;
  name: string;
  timezone: string;
  primary_phone: string | null;
  primary_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  // Regulator-display fields (legally required to display on public site).
  ico_registration_number: string | null;
  cqc_provider_id: string | null;
  cqc_rating: "OUTSTANDING" | "GOOD" | "REQUIRES_IMPROVEMENT" | "INADEQUATE" | null;
  cqc_rating_date: string | null;
  // Principal Dentist name + GDC — surfaced in the public site footer
  // Regulatory Information block. Live-editable so the operator can
  // update without a redeploy when the principal changes.
  principal_dentist_name: string | null;
  principal_dentist_gdc_number: string | null;
}

interface PracticeSettingRow {
  practice_id: string;
  from_email: string | null;
  from_name: string | null;
  google_review_url: string | null;
  practice_website: string | null;
  default_appt_duration_minutes: number;
  min_booking_notice_hours: number;
  max_advance_booking_days: number;
  reminder_days_before: number | null;
  reminder_hours_before: number | null;
  post_appointment_hours_after: number | null;
  recall_reminder_lead_days: number;
  notify_on_enquiry_received: boolean;
  notify_on_appointment_confirmed: boolean;
  notify_on_appointment_cancelled: boolean;
  notify_on_appointment_rescheduled: boolean;
  notify_on_request_rejected: boolean;
  notify_on_waitlist_added: boolean;
  notify_on_recall_due: boolean;
  // 10 template subject + 10 body columns
  enquiry_received_subject: string | null;
  enquiry_received_body: string | null;
  appointment_confirmed_subject: string | null;
  appointment_confirmed_body: string | null;
  appointment_cancelled_subject: string | null;
  appointment_cancelled_body: string | null;
  appointment_rescheduled_subject: string | null;
  appointment_rescheduled_body: string | null;
  request_rejected_subject: string | null;
  request_rejected_body: string | null;
  added_to_waitlist_subject: string | null;
  added_to_waitlist_body: string | null;
  first_reminder_subject: string | null;
  first_reminder_body: string | null;
  second_reminder_subject: string | null;
  second_reminder_body: string | null;
  post_appointment_subject: string | null;
  post_appointment_body: string | null;
  recall_reminder_subject: string | null;
  recall_reminder_body: string | null;
}

const PLACEHOLDER_TITLES: Record<string, string> = {
  clinic: "Clinic Settings",
  hours: "Hours & Closures",
  appointments: "Appointment Settings",
  templates: "Message Templates",
  services: "Services Management",
  complaints: "Complaints Procedure",
  account: "My Account",
};

export default function SettingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading } = useRequireAuth();

  const [practice, setPractice] = useState<PracticeRow | null>(null);
  const [setting, setSetting] = useState<PracticeSettingRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const isServices = id === "services";
  const isHours = id === "hours";
  const isTemplates = id === "templates";
  const isAppointments = id === "appointments";
  const isClinic = id === "clinic";
  const isAccount = id === "account";
  const isComplaints = id === "complaints";

  // Pages that don't read practice_setting up front — they load their own
  // data — skip the parallel practice + practice_setting fetch.
  const skipBaseLoad = isServices || isHours || isAccount || isComplaints;

  // Auto-load fires once per component mount. Without this guard, every
  // rail navigation between data-using sections (Clinic / Appointments /
  // Templates) would re-trigger loadData() and flash the loading spinner,
  // making section switching feel clunky. Explicit reloads after a save
  // still happen by passing `loadData` as the `onSaved` callback below.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (skipBaseLoad) {
      setLoadingData(false);
      return;
    }
    if (!hasLoadedRef.current) {
      void loadData();
    }
  }, [loading, skipBaseLoad]);

  async function loadData() {
    setLoadError(null);
    setLoadingData(true);

    const [practiceRes, settingRes] = await Promise.all([
      supabase
        .from("practice")
        .select(
          "id, name, timezone, primary_phone, primary_email, address_line1, address_line2, city, postcode, ico_registration_number, cqc_provider_id, cqc_rating, cqc_rating_date, principal_dentist_name, principal_dentist_gdc_number",
        )
        .single(),
      supabase.from("practice_setting").select("*").single(),
    ]);

    if (practiceRes.error || !practiceRes.data) {
      setLoadError(practiceRes.error?.message ?? "Failed to load practice");
      setLoadingData(false);
      return;
    }
    if (settingRes.error || !settingRes.data) {
      setLoadError(settingRes.error?.message ?? "Failed to load practice settings");
      setLoadingData(false);
      return;
    }

    setPractice(practiceRes.data);
    setSetting(settingRes.data as PracticeSettingRow);
    setLoadingData(false);
    hasLoadedRef.current = true;
  }

  if (loading) {
    return (
      <Layout title="Settings">
        <PageLoading />
      </Layout>
    );
  }

  if (isServices) {
    return (
      <Layout title="Services Management" onBack={() => navigate("/settings")}>
        <SettingsShell activeId="services">
          <div className="bg-card rounded-lg border p-6 space-y-6">
            <ServicesSettings />
          </div>
        </SettingsShell>
      </Layout>
    );
  }

  if (isHours) {
    return (
      <Layout title="Hours & Closures" onBack={() => navigate("/settings")}>
        <SettingsShell activeId="hours">
          <div className="bg-card rounded-lg border p-6">
            <HoursAndClosures />
          </div>
        </SettingsShell>
      </Layout>
    );
  }

  if (isAccount) {
    // Account page is per-user, not per-practice — it doesn't need the
    // practice / practice_setting fetch the other pages do.
    return (
      <Layout title="My Account" onBack={() => navigate("/settings")}>
        <SettingsShell activeId="account">
          <div className="bg-card rounded-lg border p-6">
            <AccountSettings />
          </div>
        </SettingsShell>
      </Layout>
    );
  }

  if (isComplaints) {
    // Complaints procedure editor loads its own slice of practice data
    // (name + address + complaints_procedure JSON), so we skip the base
    // load and let the component manage everything itself.
    return (
      <Layout title="Complaints Procedure" onBack={() => navigate("/settings")}>
        <SettingsShell activeId="complaints">
          <div className="bg-card rounded-lg border p-6">
            <ComplaintsProcedureSettings />
          </div>
        </SettingsShell>
      </Layout>
    );
  }

  if (loadingData) {
    return (
      <Layout title="Settings" onBack={() => navigate("/settings")}>
        <SettingsShell activeId={id ?? "clinic"}>
          <PageLoading />
        </SettingsShell>
      </Layout>
    );
  }

  if (loadError || !practice || !setting) {
    return (
      <Layout title="Settings" onBack={() => navigate("/settings")}>
        <SettingsShell activeId={id ?? "clinic"}>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">Couldn't load settings</p>
              <p className="text-xs text-destructive/80 mt-0.5 break-words">
                {loadError ?? "Settings not available"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-xs"
                onClick={loadData}
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Try again
              </Button>
            </div>
          </div>
        </SettingsShell>
      </Layout>
    );
  }

  const title = (id && PLACEHOLDER_TITLES[id]) ?? "Settings";

  return (
    <Layout title={title} onBack={() => navigate("/settings")}>
      <SettingsShell activeId={id ?? "clinic"}>
        <div className="bg-card rounded-lg border p-6 space-y-6">
          {isClinic && (
            <ClinicSettings
              practice={practice}
              setting={setting}
              onSaved={loadData}
            />
          )}
          {isAppointments && <AppointmentsSettings setting={setting} onSaved={loadData} />}
          {isTemplates && <TemplatesSettings setting={setting} onSaved={loadData} />}
        </div>
      </SettingsShell>
    </Layout>
  );
}

// ============================================================================
// Clinic Settings
// ============================================================================
function ClinicSettings({
  practice,
  setting,
  onSaved,
}: {
  practice: PracticeRow;
  setting: PracticeSettingRow;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: practice.name,
    timezone: practice.timezone,
    primary_phone: practice.primary_phone ?? "",
    primary_email: practice.primary_email ?? "",
    address_line1: practice.address_line1 ?? "",
    address_line2: practice.address_line2 ?? "",
    city: practice.city ?? "",
    postcode: practice.postcode ?? "",
    practice_website: setting.practice_website ?? "",
    from_name: setting.from_name ?? "",
    from_email: setting.from_email ?? "",
    google_review_url: setting.google_review_url ?? "",
    // Regulator-display fields. cqc_rating is "__none__" when unset so
    // the Select component has a controllable empty value.
    ico_registration_number: practice.ico_registration_number ?? "",
    cqc_provider_id: practice.cqc_provider_id ?? "",
    cqc_rating: (practice.cqc_rating as string | null) ?? "__none__",
    cqc_rating_date: practice.cqc_rating_date ?? "",
    // Principal Dentist (shown in public site footer).
    principal_dentist_name: practice.principal_dentist_name ?? "",
    principal_dentist_gdc_number: practice.principal_dentist_gdc_number ?? "",
  });
  const [saving, setSaving] = useState(false);

  const update = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Practice name is required");
      return;
    }
    setSaving(true);

    const [practiceRes, settingRes] = await Promise.all([
      supabase
        .from("practice")
        .update({
          name: form.name.trim(),
          timezone: form.timezone,
          primary_phone: form.primary_phone.trim() || null,
          primary_email: form.primary_email.trim() || null,
          address_line1: form.address_line1.trim() || null,
          address_line2: form.address_line2.trim() || null,
          city: form.city.trim() || null,
          postcode: form.postcode.trim() || null,
          // Normalise ICO format on save — practices type it as "Z1234567"
          // or "Z 1234567" or "z1234567". Strip spaces + uppercase.
          ico_registration_number:
            form.ico_registration_number.trim().replace(/\s+/g, "").toUpperCase() || null,
          cqc_provider_id: form.cqc_provider_id.trim() || null,
          cqc_rating: form.cqc_rating === "__none__" ? null : form.cqc_rating,
          cqc_rating_date: form.cqc_rating_date || null,
          // Principal Dentist — strip non-digits from GDC so a stray
          // space or hyphen doesn't end up on the public footer.
          principal_dentist_name: form.principal_dentist_name.trim() || null,
          principal_dentist_gdc_number:
            form.principal_dentist_gdc_number.replace(/\D+/g, "") || null,
        })
        .eq("id", practice.id),
      supabase
        .from("practice_setting")
        .update({
          practice_website: form.practice_website.trim() || null,
          from_name: form.from_name.trim() || null,
          from_email: form.from_email.trim() || null,
          google_review_url: form.google_review_url.trim() || null,
        })
        .eq("practice_id", practice.id),
    ]);

    setSaving(false);

    if (practiceRes.error || settingRes.error) {
      toast.error(
        practiceRes.error?.message?.includes("permission")
          ? "Only practice owners and admins can change settings"
          : "Failed to save settings",
      );
      return;
    }
    toast.success("Clinic settings saved");
    await onSaved();
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Practice Identity"
        subtitle="Name, timezone, and primary contact for the practice."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Practice name *">
          <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label="Timezone">
          <Input
            value={form.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            placeholder="Europe/London"
          />
        </Field>
        <Field label="Primary phone">
          <Input
            value={form.primary_phone}
            onChange={(e) => update("primary_phone", e.target.value)}
          />
        </Field>
        <Field label="Primary email">
          <Input
            type="email"
            value={form.primary_email}
            onChange={(e) => update("primary_email", e.target.value)}
          />
        </Field>
      </div>

      <Separator />

      <SectionHeading title="Address" subtitle="Used in booking confirmations and CQC records." />
      <div className="space-y-3">
        <Field label="Line 1">
          <Input
            value={form.address_line1}
            onChange={(e) => update("address_line1", e.target.value)}
          />
        </Field>
        <Field label="Line 2">
          <Input
            value={form.address_line2}
            onChange={(e) => update("address_line2", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
          </Field>
          <Field label="Postcode">
            <Input
              value={form.postcode}
              onChange={(e) => update("postcode", e.target.value)}
            />
          </Field>
        </div>
      </div>

      <Separator />

      <SectionHeading
        title="Outbound Mail + Web"
        subtitle="How patients see you in emails and on the booking page."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="From name">
          <Input
            value={form.from_name}
            onChange={(e) => update("from_name", e.target.value)}
          />
        </Field>
        <Field label="From email">
          <Input
            type="email"
            value={form.from_email}
            onChange={(e) => update("from_email", e.target.value)}
            placeholder="hello@optimadental.co.uk"
          />
        </Field>
        <Field label="Practice website">
          <Input
            value={form.practice_website}
            onChange={(e) => update("practice_website", e.target.value)}
            placeholder="https://your-practice.co.uk"
          />
        </Field>
        <Field label="Google review URL">
          <Input
            value={form.google_review_url}
            onChange={(e) => update("google_review_url", e.target.value)}
            placeholder="https://g.page/your-practice/review"
          />
        </Field>
      </div>

      <Separator />

      {/* Regulator-display block. ICO + CQC registration numbers are
          legally required to display on the public practice site; this is
          where the admin enters them. CQC rating is optional but commonly
          surfaced as a trust signal. */}
      <SectionHeading
        title="Regulator Registration"
        subtitle="Legally-required identifiers shown on your public booking site. Enter exactly as issued by each regulator."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="ICO registration number">
          <Input
            value={form.ico_registration_number}
            onChange={(e) => update("ico_registration_number", e.target.value)}
            placeholder="Z1234567"
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Every UK dental practice must register with the ICO as a data controller.
            Find yours via the ICO register if you're not sure.
          </p>
        </Field>
        <Field label="CQC provider ID">
          <Input
            value={form.cqc_provider_id}
            onChange={(e) => update("cqc_provider_id", e.target.value)}
            placeholder="1-123456789"
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Your CQC-issued provider identifier. Lets the public site link to your CQC profile.
          </p>
        </Field>
        <Field label="CQC rating (latest inspection)">
          <Select
            value={form.cqc_rating}
            onValueChange={(v) => update("cqc_rating", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Not yet inspected" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— not set —</SelectItem>
              <SelectItem value="OUTSTANDING">Outstanding</SelectItem>
              <SelectItem value="GOOD">Good</SelectItem>
              <SelectItem value="REQUIRES_IMPROVEMENT">Requires improvement</SelectItem>
              <SelectItem value="INADEQUATE">Inadequate</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="CQC rating date">
          <Input
            type="date"
            value={form.cqc_rating_date}
            onChange={(e) => update("cqc_rating_date", e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            When the rating above was published. Surfaced on the public site as e.g. "Rated Good (Mar 2024)".
          </p>
        </Field>
      </div>

      <Separator />

      {/* Principal Dentist block. Shown publicly in the marketing site
          footer's Regulatory Information strip (linked to the GDC online
          register). Live-editable so a change of principal is a Settings
          save, not a redeploy. */}
      <SectionHeading
        title="Principal Dentist"
        subtitle="Displayed in your public site footer with a link to the GDC register."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Principal Dentist name">
          <Input
            value={form.principal_dentist_name}
            onChange={(e) => update("principal_dentist_name", e.target.value)}
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            The named registered manager / principal for the practice — what
            patients see in the footer.
          </p>
        </Field>
        <Field label="GDC number">
          <Input
            value={form.principal_dentist_gdc_number}
            onChange={(e) =>
              update(
                "principal_dentist_gdc_number",
                e.target.value.replace(/\D+/g, ""),
              )
            }
            inputMode="numeric"
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            6-digit GDC registration number. We link directly to the GDC
            online register so visitors can verify.
          </p>
        </Field>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Appointment Settings
// ============================================================================
function AppointmentsSettings({
  setting,
  onSaved,
}: {
  setting: PracticeSettingRow;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    default_appt_duration_minutes: setting.default_appt_duration_minutes,
    min_booking_notice_hours: setting.min_booking_notice_hours,
    max_advance_booking_days: setting.max_advance_booking_days,
    reminder_days_before: setting.reminder_days_before,
    reminder_hours_before: setting.reminder_hours_before,
    post_appointment_hours_after: setting.post_appointment_hours_after,
    recall_reminder_lead_days: setting.recall_reminder_lead_days,
    notify_on_enquiry_received: setting.notify_on_enquiry_received,
    notify_on_appointment_confirmed: setting.notify_on_appointment_confirmed,
    notify_on_appointment_cancelled: setting.notify_on_appointment_cancelled,
    notify_on_appointment_rescheduled: setting.notify_on_appointment_rescheduled,
    notify_on_request_rejected: setting.notify_on_request_rejected,
    notify_on_waitlist_added: setting.notify_on_waitlist_added,
    notify_on_recall_due: setting.notify_on_recall_due,
  });
  const [saving, setSaving] = useState(false);

  const setNumber = (key: keyof typeof form, raw: string) => {
    const trimmed = raw.trim();
    setForm((prev) => ({
      ...prev,
      [key]: trimmed === "" ? null : Number(trimmed),
    }));
  };

  const setBool = (key: keyof typeof form, value: boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    // Reminder timing sanity check: the second reminder should fire closer
    // to the appointment than the first.
    const days = form.reminder_days_before ?? 0;
    const hours = form.reminder_hours_before ?? 0;
    if (days > 0 && hours > 0 && hours >= days * 24) {
      toast.error(
        `Second reminder (${hours}h) must be closer than first (${days}d = ${days * 24}h)`,
      );
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("practice_setting")
      .update(form)
      .eq("practice_id", setting.practice_id);
    setSaving(false);

    if (error) {
      toast.error(
        error.message?.includes("permission")
          ? "Only practice owners and admins can change settings"
          : "Failed to save settings",
      );
      return;
    }
    toast.success("Appointment settings saved");
    await onSaved();
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Booking Window"
        subtitle="Constraints applied when patients book through the public form."
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Default duration (min)">
          <Input
            type="number"
            min={5}
            max={480}
            value={form.default_appt_duration_minutes}
            onChange={(e) => setNumber("default_appt_duration_minutes", e.target.value)}
          />
        </Field>
        <Field label="Minimum notice (hours)">
          <Input
            type="number"
            min={0}
            max={720}
            value={form.min_booking_notice_hours}
            onChange={(e) => setNumber("min_booking_notice_hours", e.target.value)}
          />
        </Field>
        <Field label="Max advance (days)">
          <Input
            type="number"
            min={1}
            max={365}
            value={form.max_advance_booking_days}
            onChange={(e) => setNumber("max_advance_booking_days", e.target.value)}
          />
        </Field>
      </div>

      <Separator />

      <SectionHeading
        title="Reminders"
        subtitle="Leave blank to disable that reminder. Second reminder must be closer to the appointment than first."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First reminder (days before)">
          <Input
            type="number"
            min={1}
            max={60}
            placeholder="e.g. 3"
            value={form.reminder_days_before ?? ""}
            onChange={(e) => setNumber("reminder_days_before", e.target.value)}
          />
        </Field>
        <Field label="Second reminder (hours before)">
          <Input
            type="number"
            min={1}
            max={168}
            placeholder="e.g. 24"
            value={form.reminder_hours_before ?? ""}
            onChange={(e) => setNumber("reminder_hours_before", e.target.value)}
          />
        </Field>
        <Field label="Post-appointment follow-up (hours after)">
          <Input
            type="number"
            min={1}
            max={168}
            placeholder="e.g. 4"
            value={form.post_appointment_hours_after ?? ""}
            onChange={(e) => setNumber("post_appointment_hours_after", e.target.value)}
          />
        </Field>
        <Field label="Recall reminder lead (days)">
          <Input
            type="number"
            min={1}
            max={90}
            value={form.recall_reminder_lead_days}
            onChange={(e) => setNumber("recall_reminder_lead_days", e.target.value)}
          />
        </Field>
      </div>

      <Separator />

      <SectionHeading
        title="Practice Notifications"
        subtitle="Email the practice when these things happen."
      />
      <div className="space-y-3">
        <ToggleRow
          label="New enquiry received"
          value={form.notify_on_enquiry_received}
          onChange={(v) => setBool("notify_on_enquiry_received", v)}
        />
        <ToggleRow
          label="Appointment confirmed"
          value={form.notify_on_appointment_confirmed}
          onChange={(v) => setBool("notify_on_appointment_confirmed", v)}
        />
        <ToggleRow
          label="Appointment cancelled"
          value={form.notify_on_appointment_cancelled}
          onChange={(v) => setBool("notify_on_appointment_cancelled", v)}
        />
        <ToggleRow
          label="Appointment rescheduled"
          value={form.notify_on_appointment_rescheduled}
          onChange={(v) => setBool("notify_on_appointment_rescheduled", v)}
        />
        <ToggleRow
          label="Request rejected"
          value={form.notify_on_request_rejected}
          onChange={(v) => setBool("notify_on_request_rejected", v)}
        />
        <ToggleRow
          label="Patient added to waitlist"
          value={form.notify_on_waitlist_added}
          onChange={(v) => setBool("notify_on_waitlist_added", v)}
        />
        <ToggleRow
          label="Recall due"
          value={form.notify_on_recall_due}
          onChange={(v) => setBool("notify_on_recall_due", v)}
        />
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Templates
// ============================================================================
type BodyKey =
  | "enquiry_received_body"
  | "appointment_confirmed_body"
  | "appointment_cancelled_body"
  | "appointment_rescheduled_body"
  | "request_rejected_body"
  | "added_to_waitlist_body"
  | "first_reminder_body"
  | "second_reminder_body"
  | "post_appointment_body"
  | "recall_reminder_body";

type SubjectKey =
  | "enquiry_received_subject"
  | "appointment_confirmed_subject"
  | "appointment_cancelled_subject"
  | "appointment_rescheduled_subject"
  | "request_rejected_subject"
  | "added_to_waitlist_subject"
  | "first_reminder_subject"
  | "second_reminder_subject"
  | "post_appointment_subject"
  | "recall_reminder_subject";

interface TemplateMeta {
  id: string;
  label: string;
  description: string;
  category: "status" | "reminder";
  subjectKey: SubjectKey;
  bodyKey: BodyKey;
  defaultSubject: string;
  defaultBody: string;
  placeholders: string[];
}

// System defaults. NULL in the DB means "use these"; saving a string
// overrides for the practice. Kept in sync with the booking app's
// outbound mail builder.
const TEMPLATES: TemplateMeta[] = [
  {
    id: "enquiry_received",
    label: "Enquiry received",
    description: "Sent when a booking request first lands.",
    category: "status",
    subjectKey: "enquiry_received_subject",
    bodyKey: "enquiry_received_body",
    defaultSubject: "Appointment Request Received - {clinic_name}",
    defaultBody:
      "Hello {patient_name}, we have received your appointment request and will contact you shortly.",
    placeholders: ["patient_name", "clinic_name"],
  },
  {
    id: "appointment_confirmed",
    label: "Appointment confirmed",
    description: "Sent when an appointment is confirmed.",
    category: "status",
    subjectKey: "appointment_confirmed_subject",
    bodyKey: "appointment_confirmed_body",
    defaultSubject: "Appointment Confirmed - {clinic_name}",
    defaultBody:
      "Hello {patient_name}, your appointment has been confirmed for {date} at {time}.",
    placeholders: ["patient_name", "clinic_name", "date", "time", "service", "staff"],
  },
  {
    id: "appointment_cancelled",
    label: "Appointment cancelled",
    description: "Sent when an appointment is cancelled.",
    category: "status",
    subjectKey: "appointment_cancelled_subject",
    bodyKey: "appointment_cancelled_body",
    defaultSubject: "Appointment Cancelled - {clinic_name}",
    defaultBody:
      "Hello {patient_name}, your appointment on {date} at {time} has been cancelled.",
    placeholders: ["patient_name", "clinic_name", "date", "time"],
  },
  {
    id: "appointment_rescheduled",
    label: "Appointment rescheduled",
    description: "Sent when an appointment is moved.",
    category: "status",
    subjectKey: "appointment_rescheduled_subject",
    bodyKey: "appointment_rescheduled_body",
    defaultSubject: "Appointment Rescheduled - {clinic_name}",
    defaultBody:
      "Hello {patient_name}, your appointment has been rescheduled from {old_date} at {old_time} to {new_date} at {new_time}.",
    placeholders: [
      "patient_name",
      "clinic_name",
      "old_date",
      "old_time",
      "new_date",
      "new_time",
    ],
  },
  {
    id: "request_rejected",
    label: "Request rejected",
    description: "Sent when a booking request can't be accommodated.",
    category: "status",
    subjectKey: "request_rejected_subject",
    bodyKey: "request_rejected_body",
    defaultSubject: "Appointment Request Update - {clinic_name}",
    defaultBody:
      "Hello {patient_name}, unfortunately we are unable to accommodate your appointment request at this time.",
    placeholders: ["patient_name", "clinic_name"],
  },
  {
    id: "added_to_waitlist",
    label: "Added to waitlist",
    description: "Sent when a patient is placed on the waiting list.",
    category: "status",
    subjectKey: "added_to_waitlist_subject",
    bodyKey: "added_to_waitlist_body",
    defaultSubject: "Added to Waiting List - {clinic_name}",
    defaultBody:
      "Hello {patient_name}, you have been added to our waiting list. We will contact you when an appointment becomes available.",
    placeholders: ["patient_name", "clinic_name"],
  },
  {
    id: "first_reminder",
    label: "First reminder",
    description: "Sent several days before the appointment.",
    category: "reminder",
    subjectKey: "first_reminder_subject",
    bodyKey: "first_reminder_body",
    defaultSubject: "Appointment Reminder - {date}",
    defaultBody:
      "Hello {patient_name}, this is a reminder about your upcoming appointment on {date} at {time}. If you need to reschedule, please contact us.",
    placeholders: ["patient_name", "clinic_name", "date", "time", "service", "staff"],
  },
  {
    id: "second_reminder",
    label: "Second reminder",
    description: "Sent within 24 hours of the appointment.",
    category: "reminder",
    subjectKey: "second_reminder_subject",
    bodyKey: "second_reminder_body",
    defaultSubject: "Reminder: Appointment Coming Up - {time}",
    defaultBody:
      "Hello {patient_name}, your appointment is coming up soon on {date} at {time}. Please arrive 10 minutes early.",
    placeholders: ["patient_name", "clinic_name", "date", "time"],
  },
  {
    id: "post_appointment",
    label: "Post-appointment follow-up",
    description: "Sent after an appointment is completed.",
    category: "reminder",
    subjectKey: "post_appointment_subject",
    bodyKey: "post_appointment_body",
    defaultSubject: "How was your recent appointment?",
    defaultBody:
      "Hello {patient_name}, thank you for visiting us today. We hope you had a positive experience. If you have a moment, please leave us a Google review: {google_review_url}",
    placeholders: ["patient_name", "clinic_name", "google_review_url"],
  },
  {
    id: "recall_reminder",
    label: "Recall reminder",
    description: "Sent when a patient's recall is due soon.",
    category: "reminder",
    subjectKey: "recall_reminder_subject",
    bodyKey: "recall_reminder_body",
    defaultSubject: "Time for your {service} - {clinic_name}",
    defaultBody:
      "Hello {patient_name}, you're due a {service} at {clinic_name}. Book online any time at {practice_website}, or call us on {practice_phone}.",
    placeholders: [
      "patient_name",
      "clinic_name",
      "service",
      "due_date",
      "practice_website",
      "practice_phone",
    ],
  },
];

// Sample values used for the "with sample data" preview.
const SAMPLE_VALUES: Record<string, string> = {
  patient_name: "Jane Doe",
  clinic_name: "Your Practice",
  date: "Mon, 20 April",
  time: "14:30",
  old_date: "Mon, 20 April",
  old_time: "14:30",
  new_date: "Wed, 22 April",
  new_time: "10:00",
  service: "General Checkup",
  staff: "Dr Smith",
  google_review_url: "https://g.page/your-practice/review",
  practice_phone: "0207 123 4567",
  practice_website: "https://your-practice.co.uk",
  due_date: "20 May 2026",
};

function renderWithSample(text: string): string {
  return text.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return SAMPLE_VALUES[key] ?? `{${key}}`;
  });
}

function TemplatesSettings({
  setting,
  onSaved,
}: {
  setting: PracticeSettingRow;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<TemplateMeta | null>(null);
  const [subjectValue, setSubjectValue] = useState("");
  const [bodyValue, setBodyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastFocused, setLastFocused] = useState<"subject" | "body">("body");

  const status = useMemo(() => TEMPLATES.filter((t) => t.category === "status"), []);
  const reminders = useMemo(() => TEMPLATES.filter((t) => t.category === "reminder"), []);

  const openEdit = (template: TemplateMeta) => {
    setEditing(template);
    setSubjectValue(setting[template.subjectKey] ?? template.defaultSubject);
    setBodyValue(setting[template.bodyKey] ?? template.defaultBody);
    setLastFocused("body");
  };

  const insertPlaceholder = (key: string) => {
    const token = `{${key}}`;
    if (lastFocused === "subject") {
      const el = subjectRef.current;
      if (!el) {
        setSubjectValue((v) => v + token);
        return;
      }
      const start = el.selectionStart ?? subjectValue.length;
      const end = el.selectionEnd ?? subjectValue.length;
      const next = subjectValue.slice(0, start) + token + subjectValue.slice(end);
      setSubjectValue(next);
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + token.length;
        el.setSelectionRange(caret, caret);
      });
    } else {
      const el = bodyRef.current;
      if (!el) {
        setBodyValue((v) => v + token);
        return;
      }
      const start = el.selectionStart ?? bodyValue.length;
      const end = el.selectionEnd ?? bodyValue.length;
      const next = bodyValue.slice(0, start) + token + bodyValue.slice(end);
      setBodyValue(next);
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + token.length;
        el.setSelectionRange(caret, caret);
      });
    }
  };

  const resetToDefault = () => {
    if (!editing) return;
    setSubjectValue(editing.defaultSubject);
    setBodyValue(editing.defaultBody);
  };

  const save = async () => {
    if (!editing) return;
    if (!subjectValue.trim()) {
      toast.error("Subject cannot be empty");
      return;
    }

    // Match against the system default — if the user hasn't changed
    // anything, store NULL so future default updates flow through.
    const subjectToSave =
      subjectValue === editing.defaultSubject ? null : subjectValue;
    const bodyToSave = bodyValue === editing.defaultBody ? null : bodyValue;

    setSaving(true);
    const { error } = await supabase
      .from("practice_setting")
      .update({
        [editing.subjectKey]: subjectToSave,
        [editing.bodyKey]: bodyToSave,
      })
      .eq("practice_id", setting.practice_id);
    setSaving(false);

    if (error) {
      toast.error(
        error.message?.includes("permission")
          ? "Only practice owners and admins can change templates"
          : "Failed to save template",
      );
      return;
    }
    toast.success("Template saved");
    await onSaved();
    setEditing(null);
  };

  const isCustomised = (template: TemplateMeta) =>
    setting[template.subjectKey] != null || setting[template.bodyKey] != null;

  return (
    <div className="space-y-6">
      <TemplateGroup
        icon={<Mail className="h-4 w-4 text-primary" />}
        title="Status update templates"
        subtitle="Automated emails for booking lifecycle events."
        templates={status}
        isCustomised={isCustomised}
        onEdit={openEdit}
      />
      <TemplateGroup
        icon={<Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
        title="Reminder templates"
        subtitle="Automated appointment reminders."
        templates={reminders}
        isCustomised={isCustomised}
        onEdit={openEdit}
      />

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="sm:max-w-xl flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit {editing?.label}</SheetTitle>
            <SheetDescription className="sr-only">
              Edit the message template subject, body, and placeholders.
            </SheetDescription>
          </SheetHeader>

          {editing && (
            <div className="mt-6 space-y-4 flex-1">
              <div className="flex items-center justify-end -mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={resetToDefault}
                  title="Restore the default subject and body"
                >
                  <RotateCcw className="h-3 w-3 mr-1.5" />
                  Restore default
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-subject">Subject line</Label>
                <Input
                  ref={subjectRef}
                  id="template-subject"
                  value={subjectValue}
                  onChange={(e) => setSubjectValue(e.target.value)}
                  onFocus={() => setLastFocused("subject")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-body">Message body</Label>
                <Textarea
                  ref={bodyRef}
                  id="template-body"
                  rows={8}
                  value={bodyValue}
                  onChange={(e) => setBodyValue(e.target.value)}
                  onFocus={() => setLastFocused("body")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Insert placeholder</Label>
                <div className="flex flex-wrap gap-1.5">
                  {editing.placeholders.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => insertPlaceholder(key)}
                      className="text-xs font-mono px-2 py-1 rounded border bg-muted/40 hover:bg-muted transition-colors"
                    >
                      {`{${key}}`}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Click a chip to insert at the cursor of the last-focused input.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Preview (with sample data)</Label>
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2 min-h-[80px]">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Subject:</span>{" "}
                    {subjectValue.trim() ? (
                      <span className="text-foreground">{renderWithSample(subjectValue)}</span>
                    ) : (
                      <span className="italic">Subject is empty</span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap border-t pt-2">
                    {bodyValue.trim() ? (
                      renderWithSample(bodyValue)
                    ) : (
                      <span className="text-muted-foreground italic">
                        Body is empty — preview will appear here.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <Button onClick={save} disabled={saving} className="w-full mt-6 shrink-0">
            {saving ? "Saving..." : "Save template"}
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TemplateGroup({
  icon,
  title,
  subtitle,
  templates,
  isCustomised,
  onEdit,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  templates: TemplateMeta[];
  isCustomised: (t: TemplateMeta) => boolean;
  onEdit: (t: TemplateMeta) => void;
}) {
  return (
    <div className="bg-card rounded-lg border">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onEdit(template)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-medium">{template.label}</div>
                {isCustomised(template) && (
                  <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    Customised
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{template.description}</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// ============================================================================
// My Account
// ============================================================================
// Per-user (not per-practice) — set/change your password. Replaces the
// footer-button + sheet flow with an inline form so password changes live
// in the same place as the rest of the user's settings. The active session
// proves identity (supabase.auth.updateUser is auth-gated), so we don't
// re-prompt for the current password — that would lock out users who
// arrived via an invite or recovery link and never set one in the first
// place.
function AccountSettings() {
  const auth = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const email = auth.session?.user?.email ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPassword.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setErrorMsg("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setSubmitting(false);
    if (updateErr) {
      setErrorMsg(updateErr.message);
      return;
    }

    toast.success("Password updated.");
    setNewPassword("");
    setConfirm("");
  };

  return (
    <div className="space-y-6 max-w-md">
      <SectionHeading
        title="Signed in as"
        subtitle="The account this device is currently using."
      />
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">{email || "—"}</span>
      </div>

      <Separator />

      <SectionHeading
        title="Change password"
        subtitle="Set a new password. You'll stay signed in on this device."
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="New password">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={submitting}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            At least 8 characters. Use a mix of letters, numbers and symbols.
          </p>
        </Field>

        <Field label="Confirm new password">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
          />
        </Field>

        {errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
            {errorMsg}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={submitting || !newPassword || !confirm}>
            {submitting ? "Saving…" : "Save password"}
          </Button>
        </div>
      </form>
    </div>
  );
}

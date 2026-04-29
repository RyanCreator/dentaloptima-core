import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PracticeHoursManager } from "./PracticeHoursManager";
import { PracticeClosuresManager } from "./PracticeClosuresManager";
import { MessageTemplatesManager } from "./MessageTemplatesManager";
import { SendTestEmailRow } from "./SendTestEmailRow";

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

// Resolve a full IANA timezone list when the browser supports it (all modern
// engines since ~2022), otherwise fall back to a hand-picked short list.
const TIMEZONES: string[] = (() => {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === "function") return fn("timeZone");
  } catch {
    // ignore
  }
  return [
    "Europe/London",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland",
  ];
})();

interface GeneralSettingsProps {
  settingType: "clinic" | "appointments" | "templates";
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onSave: () => void;
  saving: boolean;
}

export function GeneralSettings({
  settingType,
  settings,
  onSettingsChange,
  onSave,
  saving,
}: GeneralSettingsProps) {
  const renderContent = () => {
    switch (settingType) {
      case "clinic":
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clinic_name">Clinic Name</Label>
                <Input
                  id="clinic_name"
                  value={settings.clinic_name}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, clinic_name: e.target.value })
                  }
                />
              </div>

                <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(value) =>
                    onSettingsChange({ ...settings, timezone: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This timezone will be used for all appointment scheduling and time displays
                </p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-1">Practice email identity</h3>
                <p className="text-xs text-muted-foreground">
                  Sender name and address used on all outgoing emails (reminders, confirmations, notifications).
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from_name">From name</Label>
                  <Input
                    id="from_name"
                    value={settings.from_name ?? ""}
                    onChange={(e) =>
                      onSettingsChange({ ...settings, from_name: e.target.value })
                    }
                    placeholder={settings.clinic_name || "Your practice"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from_email">From email</Label>
                  <Input
                    id="from_email"
                    type="email"
                    value={settings.from_email ?? ""}
                    onChange={(e) =>
                      onSettingsChange({ ...settings, from_email: e.target.value })
                    }
                    placeholder="bookings@your-practice.co.uk"
                  />
                </div>
              </div>

              <div className="pt-2">
                <SendTestEmailRow
                  templateKey="appointment_confirmed"
                  buttonLabel="Send test email"
                  helperText="Sends a sample Appointment Confirmed email to verify your sender identity delivers. Save changes to from_email/from_name first."
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-1">Practice contact details</h3>
                <p className="text-xs text-muted-foreground">
                  Available as {"{practice_phone}"}, {"{practice_address}"}, {"{practice_website}"} placeholders in email templates so patients can easily get in touch.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="practice_phone">Phone</Label>
                  <Input
                    id="practice_phone"
                    value={settings.practice_phone ?? ""}
                    onChange={(e) =>
                      onSettingsChange({ ...settings, practice_phone: e.target.value })
                    }
                    placeholder="0207 123 4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="practice_website">Website</Label>
                  <Input
                    id="practice_website"
                    type="url"
                    value={settings.practice_website ?? ""}
                    onChange={(e) =>
                      onSettingsChange({ ...settings, practice_website: e.target.value })
                    }
                    placeholder="https://your-practice.co.uk"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="practice_address">Address</Label>
                <Textarea
                  id="practice_address"
                  rows={3}
                  value={settings.practice_address ?? ""}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, practice_address: e.target.value })
                  }
                  placeholder="123 Example Street&#10;Town&#10;AB1 2CD"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <PracticeHoursManager />
            </div>

            <div className="border-t pt-4">
              <PracticeClosuresManager />
            </div>
          </div>
        );

      case "appointments":
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-1">Scheduling Defaults</h3>
                <p className="text-sm text-muted-foreground">
                  Defaults applied when scheduling new appointments
                </p>
              </div>
              <div className="bg-card rounded-lg border p-4 space-y-3 max-w-sm">
                <Label htmlFor="default_duration" className="text-sm font-medium">
                  Default appointment duration
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="default_duration"
                    type="number"
                    min="5"
                    max="480"
                    step="5"
                    value={settings.default_appt_duration || 30}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        default_appt_duration: parseInt(e.target.value) || 30,
                      })
                    }
                    className="w-24 text-center"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used when creating an appointment without a service selected
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <Label htmlFor="min_notice" className="text-sm font-medium">
                    Minimum booking notice
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="min_notice"
                      type="number"
                      min="0"
                      max="336"
                      value={settings.min_booking_notice_hours ?? 2}
                      onChange={(e) =>
                        onSettingsChange({
                          ...settings,
                          min_booking_notice_hours: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-sm text-muted-foreground">hours before</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Patients can't book closer than this to the start time. Stops same-hour bookings that give you no prep time.
                  </p>
                </div>

                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <Label htmlFor="max_advance" className="text-sm font-medium">
                    Maximum advance booking
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max_advance"
                      type="number"
                      min="1"
                      max="730"
                      value={settings.max_advance_booking_days ?? 60}
                      onChange={(e) =>
                        onSettingsChange({
                          ...settings,
                          max_advance_booking_days: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-sm text-muted-foreground">days ahead</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hides slots further out than this. Keeps patients from booking a year ahead, and your diary manageable.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <div>
                <h3 className="text-lg font-medium mb-1">Appointment Reminders</h3>
                <p className="text-sm text-muted-foreground">
                  Configure automated email reminders for upcoming appointments
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">1</span>
                    </div>
                    <div>
                      <Label htmlFor="reminder_days" className="text-sm font-medium">
                        First Reminder
                      </Label>
                      <p className="text-xs text-muted-foreground">Days before appointment</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="reminder_days"
                      type="number"
                      min="1"
                      max="30"
                      value={settings.reminder_days_before || 7}
                      onChange={(e) =>
                        onSettingsChange({
                          ...settings,
                          reminder_days_before: parseInt(e.target.value) || 7,
                        })
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-sm text-muted-foreground">days before</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sent via email to remind patients well in advance
                  </p>
                </div>

                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                      <span className="text-amber-600 dark:text-amber-400 font-semibold text-sm">2</span>
                    </div>
                    <div>
                      <Label htmlFor="reminder_hours" className="text-sm font-medium">
                        Second Reminder
                      </Label>
                      <p className="text-xs text-muted-foreground">Hours before appointment</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="reminder_hours"
                      type="number"
                      min="1"
                      max="24"
                      value={settings.reminder_hours_before || 24}
                      onChange={(e) =>
                        onSettingsChange({
                          ...settings,
                          reminder_hours_before: parseInt(e.target.value) || 24,
                        })
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-sm text-muted-foreground">hours before</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Final reminder sent closer to appointment time
                  </p>
                </div>

                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                      <span className="text-green-600 dark:text-green-400 font-semibold text-sm">3</span>
                    </div>
                    <div>
                      <Label htmlFor="post_appointment_hours" className="text-sm font-medium">
                        Post-Appointment Follow-Up
                      </Label>
                      <p className="text-xs text-muted-foreground">Hours after completion</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="post_appointment_hours"
                      type="number"
                      min="1"
                      max="72"
                      value={settings.post_appointment_hours_after || 4}
                      onChange={(e) =>
                        onSettingsChange({
                          ...settings,
                          post_appointment_hours_after: parseInt(e.target.value) || 4,
                        })
                      }
                      className="w-20 text-center"
                    />
                    <span className="text-sm text-muted-foreground">hours after</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ask for feedback and Google review after appointment completion
                  </p>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="google_review_url" className="text-sm font-medium">
                      Google Review URL
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Link to your Google Business profile for reviews
                    </p>
                  </div>
                  <Input
                    id="google_review_url"
                    type="url"
                    placeholder="https://g.page/your-business/review"
                    value={settings.google_review_url || ""}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        google_review_url: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    This URL will be used in the post-appointment template via the {"{google_review_url}"} placeholder
                  </p>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-1">Status Change Notifications</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure which email notifications to send when appointment or request statuses change
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify_enquiry_received" className="text-sm font-medium">
                          Enquiry Received
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send confirmation email when a new booking request is submitted
                        </p>
                      </div>
                      <Switch
                        id="notify_enquiry_received"
                        checked={settings.notify_on_enquiry_received ?? true}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            notify_on_enquiry_received: checked,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify_appointment_confirmed" className="text-sm font-medium">
                          Appointment Confirmed
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send confirmation email when an appointment is created or confirmed
                        </p>
                      </div>
                      <Switch
                        id="notify_appointment_confirmed"
                        checked={settings.notify_on_appointment_confirmed ?? true}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            notify_on_appointment_confirmed: checked,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify_appointment_cancelled" className="text-sm font-medium">
                          Appointment Cancelled
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send notification email when an appointment is cancelled
                        </p>
                      </div>
                      <Switch
                        id="notify_appointment_cancelled"
                        checked={settings.notify_on_appointment_cancelled ?? true}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            notify_on_appointment_cancelled: checked,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify_appointment_rescheduled" className="text-sm font-medium">
                          Appointment Rescheduled
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send notification email when an appointment is rescheduled
                        </p>
                      </div>
                      <Switch
                        id="notify_appointment_rescheduled"
                        checked={settings.notify_on_appointment_rescheduled ?? true}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            notify_on_appointment_rescheduled: checked,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify_request_rejected" className="text-sm font-medium">
                          Request Rejected
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send notification email when a booking request is rejected
                        </p>
                      </div>
                      <Switch
                        id="notify_request_rejected"
                        checked={settings.notify_on_request_rejected ?? true}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            notify_on_request_rejected: checked,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify_recall_due" className="text-sm font-medium">
                          Recall Due
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send a reminder when a patient's recall is approaching, using the lead time below
                        </p>
                      </div>
                      <Switch
                        id="notify_recall_due"
                        checked={settings.notify_on_recall_due ?? true}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            notify_on_recall_due: checked,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto_invoice" className="text-sm font-medium">
                          Auto-email invoice on completion
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When you mark an appointment COMPLETED, automatically email the patient any unpaid billing items with a Stripe pay link. Off by default — most practices take payment chair-side.
                        </p>
                      </div>
                      <Switch
                        id="auto_invoice"
                        checked={settings.auto_send_invoice_on_completion ?? false}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            auto_send_invoice_on_completion: checked,
                          })
                        }
                      />
                    </div>

                    <div className="rounded-lg border p-4 space-y-2">
                      <Label htmlFor="recall_lead_days" className="text-sm font-medium">
                        Recall reminder lead time
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        How many days before the recall due date the email is sent
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Input
                          id="recall_lead_days"
                          type="number"
                          min="1"
                          max="90"
                          value={settings.recall_reminder_lead_days ?? 14}
                          onChange={(e) =>
                            onSettingsChange({
                              ...settings,
                              recall_reminder_lead_days: Math.max(
                                1,
                                Math.min(90, parseInt(e.target.value) || 14)
                              ),
                            })
                          }
                          className="w-20 text-center"
                        />
                        <span className="text-sm text-muted-foreground">days before due date</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify_waitlist_added" className="text-sm font-medium">
                          Added to Waiting List
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Send notification email when a patient is added to the waiting list
                        </p>
                      </div>
                      <Switch
                        id="notify_waitlist_added"
                        checked={settings.notify_on_waitlist_added ?? true}
                        onCheckedChange={(checked) =>
                          onSettingsChange({
                            ...settings,
                            notify_on_waitlist_added: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "templates":
        return <MessageTemplatesManager />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {renderContent()}
      {settingType !== "templates" && (
        <div className="pt-4 border-t">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}

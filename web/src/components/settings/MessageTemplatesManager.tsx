import { useState, useEffect, useRef } from "react";
import { ChevronRight, Mail, Bell, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SendTestEmailRow } from "./SendTestEmailRow";
import type { TestTemplateKey } from "@/hooks/useSendTestEmail";

// Default templates, kept in sync with core_schema.sql app_settings defaults.
// Used for "Restore default" per template — if the user breaks one they can
// get back to a known-good starting point for both subject and body.
const DEFAULT_BODIES: Record<BodyKey, string> = {
  enquiry_received_template:
    "Hello {patient_name}, we have received your appointment request and will contact you shortly.",
  appointment_confirmed_template:
    "Hello {patient_name}, your appointment has been confirmed for {date} at {time}.",
  appointment_cancelled_template:
    "Hello {patient_name}, your appointment on {date} at {time} has been cancelled.",
  appointment_rescheduled_template:
    "Hello {patient_name}, your appointment has been rescheduled from {old_date} at {old_time} to {new_date} at {new_time}.",
  request_rejected_template:
    "Hello {patient_name}, unfortunately we are unable to accommodate your appointment request at this time.",
  added_to_waitlist_template:
    "Hello {patient_name}, you have been added to our waiting list. We will contact you when an appointment becomes available.",
  first_reminder_template:
    "Hello {patient_name}, this is a reminder about your upcoming appointment on {date} at {time}. If you need to reschedule, please contact us.",
  second_reminder_template:
    "Hello {patient_name}, your appointment is coming up soon on {date} at {time}. Please arrive 10 minutes early.",
  post_appointment_template:
    "Hello {patient_name}, thank you for visiting us today. We hope you had a positive experience. If you have a moment, please leave us a Google review: {google_review_url}",
  recall_reminder_template:
    "Hello {patient_name}, you're due a {service} at {clinic_name}. Book online any time at {practice_website}, or call us on {practice_phone}.",
};

// Default subject lines — must stay in sync with the
// 20260415173000_add_customisable_email_subjects migration defaults.
const DEFAULT_SUBJECTS: Record<SubjectKey, string> = {
  enquiry_received_subject: "Appointment Request Received - {clinic_name}",
  appointment_confirmed_subject: "Appointment Confirmed - {clinic_name}",
  appointment_cancelled_subject: "Appointment Cancelled - {clinic_name}",
  appointment_rescheduled_subject: "Appointment Rescheduled - {clinic_name}",
  request_rejected_subject: "Appointment Request Update - {clinic_name}",
  added_to_waitlist_subject: "Added to Waiting List - {clinic_name}",
  first_reminder_subject: "Appointment Reminder - {date}",
  second_reminder_subject: "Reminder: Appointment Coming Up - {time}",
  post_appointment_subject: "How was your recent appointment?",
  recall_reminder_subject: "Time for your {service} - {clinic_name}",
};

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
  practice_address: "123 Example Street, London, AB1 2CD",
  practice_website: "https://your-practice.co.uk",
  due_date: "20 May 2026",
};

// Practice-level contact placeholders that make sense in every template.
// Appended to each template's chip list so they're one click away.
const PRACTICE_CONTACT_PLACEHOLDERS = [
  "practice_phone",
  "practice_address",
  "practice_website",
] as const;

// Placeholders allowed per template. Subjects share the same set — practices
// often want {clinic_name} there, and the extra options don't hurt.
const PLACEHOLDERS_BY_TEMPLATE: Record<BodyKey, string[]> = {
  enquiry_received_template: ["patient_name", "clinic_name"],
  appointment_confirmed_template: ["patient_name", "clinic_name", "date", "time", "service", "staff"],
  appointment_cancelled_template: ["patient_name", "clinic_name", "date", "time"],
  appointment_rescheduled_template: [
    "patient_name",
    "clinic_name",
    "old_date",
    "old_time",
    "new_date",
    "new_time",
  ],
  request_rejected_template: ["patient_name", "clinic_name"],
  added_to_waitlist_template: ["patient_name", "clinic_name"],
  first_reminder_template: ["patient_name", "clinic_name", "date", "time", "service", "staff"],
  second_reminder_template: ["patient_name", "clinic_name", "date", "time"],
  post_appointment_template: ["patient_name", "clinic_name", "google_review_url"],
  recall_reminder_template: ["patient_name", "clinic_name", "service", "due_date"],
};

function renderWithSample(text: string): string {
  return text.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return SAMPLE_VALUES[key] ?? `{${key}}`;
  });
}

type BodyKey =
  | "enquiry_received_template"
  | "appointment_confirmed_template"
  | "appointment_cancelled_template"
  | "appointment_rescheduled_template"
  | "request_rejected_template"
  | "added_to_waitlist_template"
  | "first_reminder_template"
  | "second_reminder_template"
  | "post_appointment_template"
  | "recall_reminder_template";

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

interface MessageTemplate {
  id: TestTemplateKey;
  label: string;
  bodyKey: BodyKey;
  subjectKey: SubjectKey;
  description: string;
  category: "status" | "reminder";
  color: string;
}

// Saved row shape — subject + body for every template plus the singleton id.
type Templates = Record<BodyKey | SubjectKey, string | null> & { id: string };

const templates: MessageTemplate[] = [
  {
    id: "enquiry_received",
    label: "Enquiry Received",
    bodyKey: "enquiry_received_template",
    subjectKey: "enquiry_received_subject",
    description: "Sent when enquiry is first received",
    category: "status",
    color: "bg-primary",
  },
  {
    id: "appointment_confirmed",
    label: "Appointment Confirmed",
    bodyKey: "appointment_confirmed_template",
    subjectKey: "appointment_confirmed_subject",
    description: "Sent when appointment is confirmed",
    category: "status",
    color: "bg-primary",
  },
  {
    id: "appointment_cancelled",
    label: "Appointment Cancelled",
    bodyKey: "appointment_cancelled_template",
    subjectKey: "appointment_cancelled_subject",
    description: "Sent when appointment is cancelled",
    category: "status",
    color: "bg-destructive",
  },
  {
    id: "appointment_rescheduled",
    label: "Appointment Rescheduled",
    bodyKey: "appointment_rescheduled_template",
    subjectKey: "appointment_rescheduled_subject",
    description: "Sent when appointment is rescheduled",
    category: "status",
    color: "bg-primary",
  },
  {
    id: "request_rejected",
    label: "Request Rejected",
    bodyKey: "request_rejected_template",
    subjectKey: "request_rejected_subject",
    description: "Sent when request is rejected",
    category: "status",
    color: "bg-destructive",
  },
  {
    id: "added_to_waitlist",
    label: "Added to Waitlist",
    bodyKey: "added_to_waitlist_template",
    subjectKey: "added_to_waitlist_subject",
    description: "Sent when added to waitlist",
    category: "status",
    color: "bg-secondary",
  },
  {
    id: "first_reminder",
    label: "First Reminder",
    bodyKey: "first_reminder_template",
    subjectKey: "first_reminder_subject",
    description: "Sent several days before appointment",
    category: "reminder",
    color: "bg-accent",
  },
  {
    id: "second_reminder",
    label: "Second Reminder",
    bodyKey: "second_reminder_template",
    subjectKey: "second_reminder_subject",
    description: "Sent within 24 hours of appointment",
    category: "reminder",
    color: "bg-accent",
  },
  {
    id: "post_appointment",
    label: "Post-Appointment Follow-Up",
    bodyKey: "post_appointment_template",
    subjectKey: "post_appointment_subject",
    description: "Sent after appointment is completed",
    category: "reminder",
    color: "bg-green-600",
  },
  {
    id: "recall_reminder",
    label: "Recall Reminder",
    bodyKey: "recall_reminder_template",
    subjectKey: "recall_reminder_subject",
    description: "Sent when a patient's recall is due soon",
    category: "reminder",
    color: "bg-amber-500",
  },
];

const SELECT_COLUMNS = [
  "id",
  ...templates.flatMap((t) => [t.bodyKey, t.subjectKey]),
].join(", ");

export function MessageTemplatesManager() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [currentTemplates, setCurrentTemplates] = useState<Templates | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [subjectValue, setSubjectValue] = useState("");
  const [bodyValue, setBodyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  // Tracks which input was last focused so placeholder-chip clicks go to the
  // right place. Defaults to body since that's the longer edit surface.
  const [lastFocused, setLastFocused] = useState<"subject" | "body">("body");

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
      const el = textareaRef.current;
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
    if (!editingTemplate) return;
    setSubjectValue(DEFAULT_SUBJECTS[editingTemplate.subjectKey]);
    setBodyValue(DEFAULT_BODIES[editingTemplate.bodyKey]);
  };

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) {
      toast.error("Couldn't load message templates");
      return;
    }
    setSettingsId((data as Templates).id);
    setCurrentTemplates(data as Templates);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleEditTemplate = (template: MessageTemplate) => {
    setSubjectValue(currentTemplates?.[template.subjectKey] ?? "");
    setBodyValue(currentTemplates?.[template.bodyKey] ?? "");
    setLastFocused("body");
    setEditingTemplate(template);
    setIsEditOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate || !settingsId) return;

    if (!subjectValue.trim()) {
      toast.error("Subject cannot be empty");
      return;
    }

    setSaving(true);
    const patch = {
      [editingTemplate.bodyKey]: bodyValue,
      [editingTemplate.subjectKey]: subjectValue,
    };
    const { error } = await supabase
      .from("app_settings")
      .update(patch)
      .eq("id", settingsId);

    if (error) {
      toast.error("Failed to save template");
    } else {
      toast.success("Template saved successfully");
      await loadTemplates();
      setIsEditOpen(false);
      setEditingTemplate(null);
    }
    setSaving(false);
  };

  const statusTemplates = templates.filter((t) => t.category === "status");
  const reminderTemplates = templates.filter((t) => t.category === "reminder");

  const hasUnsavedChanges = Boolean(
    editingTemplate &&
      (subjectValue !== (currentTemplates?.[editingTemplate.subjectKey] ?? "") ||
        bodyValue !== (currentTemplates?.[editingTemplate.bodyKey] ?? ""))
  );

  const isAtDefault = Boolean(
    editingTemplate &&
      subjectValue === DEFAULT_SUBJECTS[editingTemplate.subjectKey] &&
      bodyValue === DEFAULT_BODIES[editingTemplate.bodyKey]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Status Update Templates */}
        <div className="bg-card rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Status Update Templates</h3>
              <p className="text-xs text-muted-foreground">Automated emails for booking updates</p>
            </div>
          </div>
          <div className="border rounded-lg divide-y">
            {statusTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleEditTemplate(template)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${template.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{template.label}</div>
                    <div className="text-xs text-muted-foreground">{template.description}</div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Reminder Templates */}
        <div className="bg-card rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Reminder Templates</h3>
              <p className="text-xs text-muted-foreground">Automated appointment reminders</p>
            </div>
          </div>
          <div className="border rounded-lg divide-y">
            {reminderTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleEditTemplate(template)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${template.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{template.label}</div>
                    <div className="text-xs text-muted-foreground">{template.description}</div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="sm:max-w-xl flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit {editingTemplate?.label}</SheetTitle>
            <SheetDescription className="sr-only">
              Edit the message template subject, body, and placeholders
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 flex-1">
            <div className="flex items-center justify-end -mb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={resetToDefault}
                disabled={isAtDefault}
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
                placeholder="Appointment Confirmed - {clinic_name}"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-body">Message body</Label>
              <Textarea
                ref={textareaRef}
                id="template-body"
                rows={8}
                value={bodyValue}
                onChange={(e) => setBodyValue(e.target.value)}
                onFocus={() => setLastFocused("body")}
                placeholder="Enter your message body..."
              />
            </div>

            {editingTemplate && PLACEHOLDERS_BY_TEMPLATE[editingTemplate.bodyKey] && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Insert placeholder</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ...PLACEHOLDERS_BY_TEMPLATE[editingTemplate.bodyKey],
                    ...PRACTICE_CONTACT_PLACEHOLDERS,
                  ].map((key) => (
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
                  Click a chip to insert at the cursor of the last-focused input (subject or body).
                </p>
              </div>
            )}

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

            {editingTemplate && (
              <div className="border-t pt-4">
                <SendTestEmailRow
                  templateKey={editingTemplate.id}
                  hasUnsavedChanges={hasUnsavedChanges}
                  helperText="Sends this template with sample data to verify it delivers correctly. Uses the saved copy — save first if you've edited."
                />
              </div>
            )}
          </div>

          <Button onClick={handleSaveTemplate} disabled={saving} className="w-full mt-6 shrink-0">
            {saving ? "Saving..." : "Save template"}
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

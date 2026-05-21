import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Save, Eye, FileText, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { PageLoading } from "@/components/PageLoading";
import { usePractice } from "@/contexts/PracticeContext";
import {
  COMPLAINTS_PROCEDURE_DEFAULTS,
  isComplaintsProcedurePublishable,
  normaliseComplaintsProcedure,
  type ComplaintsProcedureData,
} from "@/lib/complaintsProcedure";
import {
  ComplaintsProcedureRender,
  type PracticePublicContact,
} from "@/components/complaints/ComplaintsProcedureRender";

// Editor + live preview for the practice's complaints procedure. The form
// covers the configurable bits only — the national regulator contacts are
// baked into the renderer and don't need touching.
//
// Two columns on desktop (form | preview), stacked on mobile. The preview
// updates as you type so the operator can see exactly what their patients
// will read on the public site.

export function ComplaintsProcedureSettings() {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [data, setData] = useState<ComplaintsProcedureData>(COMPLAINTS_PROCEDURE_DEFAULTS);
  const [practice, setPractice] = useState<PracticePublicContact | null>(null);
  // Tracks whether the practice has ever saved a procedure. False means
  // the row's complaints_procedure column is NULL — we show a "Use the
  // template" CTA instead of populating defaults silently, so the
  // operator consciously chooses to publish.
  const [hasSavedProcedure, setHasSavedProcedure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const initialDataRef = useRef<ComplaintsProcedureData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: row, error } = await supabase
      .from("practice")
      .select(
        `name, address_line1, address_line2, city, postcode,
         primary_phone, primary_email, complaints_procedure`,
      )
      .eq("id", practiceId)
      .single();

    if (error || !row) {
      logger.error("Failed to load complaints procedure", error);
      toast.error("Couldn't load complaints procedure");
      setLoading(false);
      return;
    }

    setPractice({
      name: row.name,
      address_line1: row.address_line1,
      address_line2: row.address_line2,
      city: row.city,
      postcode: row.postcode,
      primary_phone: row.primary_phone,
      primary_email: row.primary_email,
    });

    if (row.complaints_procedure) {
      const normalised = normaliseComplaintsProcedure(row.complaints_procedure);
      setData(normalised);
      initialDataRef.current = normalised;
      setHasSavedProcedure(true);
    } else {
      setData(COMPLAINTS_PROCEDURE_DEFAULTS);
      initialDataRef.current = null;
      setHasSavedProcedure(false);
    }
    setLoading(false);
  }, [practiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(() => {
    if (!hasSavedProcedure) return data.complaints_manager_name.trim().length > 0;
    return JSON.stringify(data) !== JSON.stringify(initialDataRef.current);
  }, [data, hasSavedProcedure]);

  const handleSave = async (markReviewed: boolean) => {
    setSaving(true);
    const payload: ComplaintsProcedureData = markReviewed
      ? { ...data, last_reviewed_at: format(new Date(), "yyyy-MM-dd") }
      : data;
    const { error } = await supabase
      .from("practice")
      .update({ complaints_procedure: payload })
      .eq("id", practiceId);
    setSaving(false);
    if (error) {
      logger.error("Failed to save complaints procedure", error);
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    setData(payload);
    initialDataRef.current = payload;
    setHasSavedProcedure(true);
    toast.success(
      markReviewed
        ? "Complaints procedure saved and marked as reviewed"
        : "Complaints procedure saved",
    );
  };

  const update = <K extends keyof ComplaintsProcedureData>(
    key: K,
    value: ComplaintsProcedureData[K],
  ) => setData((prev) => ({ ...prev, [key]: value }));

  const updateIcb = (patch: Partial<NonNullable<ComplaintsProcedureData["local_icb"]>>) =>
    setData((prev) => ({
      ...prev,
      local_icb: {
        name: "",
        address: "",
        email: null,
        phone: null,
        ...prev.local_icb,
        ...patch,
      },
    }));

  if (loading || !practice) {
    return <PageLoading variant="inline" label="Loading complaints procedure..." />;
  }

  const publishable = isComplaintsProcedurePublishable(data);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Complaints Procedure
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Patients need a clear route to raise concerns. Fill in your named
            Complaints Manager and your local NHS ICB (if you take NHS
            patients); the regulator contacts (GDC, CQC, Ombudsman) are
            already included for you.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview((s) => !s)}
        >
          <Eye className="h-4 w-4 mr-1.5" />
          {showPreview ? "Hide preview" : "Show preview"}
        </Button>
      </header>

      {!hasSavedProcedure && (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">No procedure published yet</p>
            <p className="text-amber-800/80 dark:text-amber-200/80 mt-0.5">
              Fill in the form below and save — your procedure will appear on
              the <code className="text-xs">/complaints</code> page of your
              public site.
            </p>
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${showPreview ? "lg:grid-cols-2" : ""}`}>
        {/* ───── Editor column ───── */}
        <div className="space-y-6">
          <Section title="Complaints Manager">
            <Field label="Name" required>
              <Input
                value={data.complaints_manager_name}
                onChange={(e) => update("complaints_manager_name", e.target.value)}
              />
            </Field>
            <Field label="Role">
              <Input
                value={data.complaints_manager_role ?? ""}
                onChange={(e) =>
                  update("complaints_manager_role", e.target.value || null)
                }
                placeholder="e.g. Practice Manager"
              />
            </Field>
            <Field label="Direct email (optional)">
              <Input
                type="email"
                value={data.complaints_manager_email ?? ""}
                onChange={(e) =>
                  update("complaints_manager_email", e.target.value || null)
                }
                placeholder={practice.primary_email ?? "uses practice email if blank"}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Falls back to the practice's primary email if left blank.
              </p>
            </Field>
          </Section>

          <Section title="Response timeframes">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Verbal (hours)">
                <Input
                  type="number"
                  min={1}
                  max={72}
                  value={data.ack_verbal_hours}
                  onChange={(e) =>
                    update("ack_verbal_hours", parseInt(e.target.value, 10) || 24)
                  }
                />
              </Field>
              <Field label="Written (working days)">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={data.ack_written_days}
                  onChange={(e) =>
                    update("ack_written_days", parseInt(e.target.value, 10) || 3)
                  }
                />
              </Field>
              <Field label="Progress updates (working days)">
                <Input
                  type="number"
                  min={5}
                  max={28}
                  value={data.update_cadence_days}
                  onChange={(e) =>
                    update("update_cadence_days", parseInt(e.target.value, 10) || 10)
                  }
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Defaults match CQC guidance (24h verbal / 3 working days written /
              10 working days progress).
            </p>
          </Section>

          <Section title="NHS services">
            <label className="flex items-start gap-3 cursor-pointer">
              <Switch
                checked={data.accepts_nhs}
                onCheckedChange={(v) => update("accepts_nhs", v)}
              />
              <div className="text-sm">
                <span className="font-medium block">
                  This practice provides NHS care
                </span>
                <span className="text-muted-foreground text-[12px]">
                  Shows the NHS ICB escalation block and the Parliamentary
                  Health Ombudsman line on the public page.
                </span>
              </div>
            </label>

            {data.accepts_nhs && (
              <div className="space-y-3 mt-2 rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Local NHS ICB
                </p>
                <Field label="ICB name">
                  <Input
                    value={data.local_icb?.name ?? ""}
                    onChange={(e) => updateIcb({ name: e.target.value })}
                    placeholder="e.g. NHS North East and North Cumbria ICB"
                  />
                </Field>
                <Field label="Postal address">
                  <Textarea
                    rows={4}
                    value={data.local_icb?.address ?? ""}
                    onChange={(e) => updateIcb({ address: e.target.value })}
                    placeholder={`Parkhouse Building\nBaron Way\nKingmoor Park\nCarlisle\nCA6 4SJ`}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    One line per address line. Find your ICB at{" "}
                    <a
                      href="https://www.england.nhs.uk/integratedcare/integrated-care-in-your-area/"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline"
                    >
                      england.nhs.uk
                    </a>
                    .
                  </p>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email">
                    <Input
                      type="email"
                      value={data.local_icb?.email ?? ""}
                      onChange={(e) =>
                        updateIcb({ email: e.target.value || null })
                      }
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={data.local_icb?.phone ?? ""}
                      onChange={(e) =>
                        updateIcb({ phone: e.target.value || null })
                      }
                    />
                  </Field>
                </div>
              </div>
            )}
          </Section>

          <Section title="Additional information">
            <Field label="Custom notes (optional)">
              <Textarea
                rows={5}
                value={data.additional_notes ?? ""}
                onChange={(e) => update("additional_notes", e.target.value || null)}
                placeholder="Anything specific to your practice — e.g. Healthwatch signposting, additional internal escalation steps."
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Appended at the end of the published procedure. Plain text only;
                use blank lines to separate paragraphs.
              </p>
            </Field>
          </Section>

          <Separator />

          {/* Save actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => handleSave(false)}
              disabled={saving || !isDirty}
              variant="outline"
              className="sm:flex-1"
            >
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={saving || !publishable}
              className="sm:flex-1"
              title={
                !publishable
                  ? "Add a Complaints Manager name before publishing"
                  : "Save and stamp today's date as the last reviewed date"
              }
            >
              <FileText className="h-4 w-4 mr-1.5" />
              {saving ? "Saving..." : "Save and mark reviewed"}
            </Button>
          </div>
          {data.last_reviewed_at && (
            <p className="text-xs text-muted-foreground">
              Last marked as reviewed:{" "}
              {format(new Date(data.last_reviewed_at), "d MMMM yyyy")}
            </p>
          )}
        </div>

        {/* ───── Preview column ───── */}
        {showPreview && (
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-lg border bg-card p-6 max-h-[calc(100vh-8rem)] overflow-auto">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3 font-semibold">
                Public preview — this is what patients will see
              </p>
              <ComplaintsProcedureRender data={data} practice={practice} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

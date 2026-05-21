import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select as SelectUI,
  SelectContent as SelectContentUI,
  SelectItem as SelectItemUI,
  SelectTrigger as SelectTriggerUI,
  SelectValue as SelectValueUI,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Info, Users2, Eye, AlertTriangle, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNhsEligibleStaffIds } from "@/hooks/useNhsEligibleStaffIds";
import { ServiceBookingsList } from "@/components/settings/ServiceBookingsList";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Service, Staff } from "@/types/entities";

// dentaloptima-core service treatment_type enum values.
const TREATMENT_TYPES = [
  { value: "EXAMINATION", label: "Examination" },
  { value: "HYGIENE", label: "Hygiene" },
  { value: "RESTORATIVE", label: "Restorative" },
  { value: "ENDODONTIC", label: "Endodontic" },
  { value: "PROSTHODONTIC", label: "Prosthodontic" },
  { value: "ORTHODONTIC", label: "Orthodontic" },
  { value: "PERIODONTAL", label: "Periodontal" },
  { value: "ORAL_SURGERY", label: "Oral surgery" },
  { value: "COSMETIC", label: "Cosmetic" },
  { value: "EMERGENCY", label: "Emergency" },
  { value: "CONSULTATION", label: "Consultation" },
  { value: "X_RAY", label: "X-ray" },
  { value: "OTHER", label: "Other" },
];

// dentaloptima-core nhs_band enum values. URGENT/FREE_NHS/NOT_NHS exist on
// the enum but aren't bands you'd assign to a saleable service from the
// settings page, so they aren't surfaced here.
const NHS_BANDS = [
  { value: "BAND_1", label: "Band 1 — Examination, diagnosis, X-rays" },
  { value: "BAND_2", label: "Band 2 — Fillings, extractions, root canals" },
  { value: "BAND_3", label: "Band 3 — Crowns, bridges, dentures" },
];

interface ServiceFormProps {
  service: Partial<Service>;
  staff: Staff[];
  selectedStaff: string[];
  onServiceChange: (service: Partial<Service>) => void;
  onStaffSelectionChange: (staffIds: string[]) => void;
  onSubmit: () => void;
  // Optional. When provided, a Cancel button is rendered next to the
  // Save action — callers without their own back-out path (e.g. the
  // full-page ServiceDetail) pass this; sheet-based callers don't.
  onCancel?: () => void;
  saving: boolean;
  mode: "create" | "edit";
}

export function ServiceForm({
  service,
  staff,
  selectedStaff,
  onServiceChange,
  onStaffSelectionChange,
  onSubmit,
  onCancel,
  saving,
  mode,
}: ServiceFormProps) {
  const [showDeactivationWarning, setShowDeactivationWarning] = useState(false);
  const [futureAppointments, setFutureAppointments] = useState<{
    count: number;
    nextAppointment?: { starts_at: string };
    lastAppointment?: { starts_at: string };
  } | null>(null);
  const [checkingAppointments, setCheckingAppointments] = useState(false);

  // NHS eligibility — set of practice_member ids with an active NHS performer
  // registration. Drives the disabled state on the Staff tab when this is
  // an NHS service.
  const { eligibleSet: nhsEligibleSet } = useNhsEligibleStaffIds();
  const nhsServiceMode = service.is_nhs ?? false;
  const noStaffSelected = selectedStaff.length === 0;
  // Staff who are currently assigned but wouldn't pass the NHS gate — usually
  // happens when a service flips from non-NHS to NHS, or when an existing
  // performer registration ended. Surfaced as an amber warning so the admin
  // can review rather than silently lose the assignment.
  const assignedNonEligible = selectedStaff.filter(
    (id) => nhsServiceMode && !nhsEligibleSet.has(id),
  );

  const handleStaffToggle = (staffId: string, checked: boolean) => {
    if (checked) {
      onStaffSelectionChange([...selectedStaff, staffId]);
    } else {
      onStaffSelectionChange(selectedStaff.filter((id) => id !== staffId));
    }
  };

  // Counts future SCHEDULED appointments still using this service. The new
  // schema has appointment_service as the join, so we walk through it and
  // grab the parent appointment's starts_at.
  const checkFutureAppointments = async (serviceId: string) => {
    setCheckingAppointments(true);
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("appointment_service")
        .select("appointment:appointment_id (starts_at, status)")
        .eq("service_id", serviceId);

      if (error) {
        console.error("Error checking future appointments:", error);
        return null;
      }

      const future = (data ?? [])
        .map((row: any) => row.appointment)
        .filter((a: any) => a && a.status === "SCHEDULED" && a.starts_at >= now)
        .sort((a: any, b: any) => a.starts_at.localeCompare(b.starts_at));

      if (future.length > 0) {
        return {
          count: future.length,
          nextAppointment: future[0],
          lastAppointment: future[future.length - 1],
        };
      }

      return { count: 0 };
    } finally {
      setCheckingAppointments(false);
    }
  };

  const handleActiveToggle = async (checked: boolean) => {
    // If trying to deactivate an existing service that still has future
    // appointments, warn rather than silently breaking those appointments.
    if (!checked && mode === "edit" && service.id) {
      const appointments = await checkFutureAppointments(service.id);

      if (appointments && appointments.count > 0) {
        setFutureAppointments(appointments);
        setShowDeactivationWarning(true);
        return;
      }
    }

    onServiceChange({ ...service, is_active: checked });
  };

  const presetColors = [
    "#EF4444",
    "#F97316",
    "#F59E0B",
    "#EAB308",
    "#84CC16",
    "#22C55E",
    "#10B981",
    "#14B8A6",
    "#06B6D4",
    "#0EA5E9",
    "#3B82F6",
    "#6366F1",
    "#8B5CF6",
    "#A855F7",
    "#D946EF",
    "#EC4899",
  ];

  // Price input is in pounds for humans; persisted as integer pence.
  const priceInPounds = service.price_pence != null ? (service.price_pence / 100).toString() : "";

  return (
    <div className="space-y-4">
      <Tabs defaultValue="details">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="details" className="gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Details
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5">
            <Users2 className="h-3.5 w-3.5" />
            Staff
            {/* Amber dot when nothing's selected — easy to miss otherwise
                because the action bar is on a different tab. */}
            {noStaffSelected && (
              <span
                className="h-2 w-2 rounded-full bg-amber-500"
                aria-label="No staff assigned"
              />
            )}
          </TabsTrigger>
          <TabsTrigger value="visibility" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Visibility
          </TabsTrigger>
          {/* Bookings tab is meaningful only in edit mode — there are no
              upcoming appointments for a service that doesn't exist yet. */}
          {mode === "edit" && service.id && (
            <TabsTrigger value="bookings" className="gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Bookings
            </TabsTrigger>
          )}
        </TabsList>

        {/* DETAILS TAB ===================================================== */}
        <TabsContent value="details" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Basics ------------------------------------------------------ */}
            <div className="lg:col-span-2">
      <Section
        title="Basics"
        description="What this service is called and how it's classified."
      >
        <div className="space-y-2">
          <Label htmlFor="service_name">Service name *</Label>
          <Input
            id="service_name"
            value={service.name || ""}
            onChange={(e) => onServiceChange({ ...service, name: e.target.value })}
            placeholder="e.g. General check-up"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="treatment_type">Treatment type</Label>
          <SelectUI
            value={service.treatment_type || "OTHER"}
            onValueChange={(v) => onServiceChange({ ...service, treatment_type: v })}
          >
            <SelectTriggerUI id="treatment_type">
              <SelectValueUI placeholder="Select type…" />
            </SelectTriggerUI>
            <SelectContentUI>
              {TREATMENT_TYPES.map((t) => (
                <SelectItemUI key={t.value} value={t.value}>
                  {t.label}
                </SelectItemUI>
              ))}
            </SelectContentUI>
          </SelectUI>
        </div>

        <div className="space-y-2">
          <Label>Calendar colour</Label>
          <div className="grid grid-cols-8 gap-2">
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onServiceChange({ ...service, color_hex: color })}
                className={`w-9 h-9 rounded-md transition-all hover:scale-105 ${
                  service.color_hex?.toLowerCase() === color.toLowerCase()
                    ? "ring-2 ring-offset-2 ring-primary"
                    : "hover:ring-2 hover:ring-offset-2 hover:ring-muted-foreground/30"
                }`}
                style={{ backgroundColor: color }}
                title={color}
                aria-label={`Choose ${color}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="color"
              aria-label="Custom colour"
              value={service.color_hex ?? "#3B82F6"}
              onChange={(e) =>
                onServiceChange({ ...service, color_hex: e.target.value.toUpperCase() })
              }
              className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-0"
            />
            <Input
              value={service.color_hex ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  onServiceChange({ ...service, color_hex: null });
                  return;
                }
                const withHash = raw.startsWith("#") ? raw : `#${raw}`;
                onServiceChange({ ...service, color_hex: withHash.toUpperCase() });
              }}
              placeholder="#3B82F6"
              className="font-mono text-xs h-9 w-32"
              maxLength={7}
            />
            {service.color_hex && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onServiceChange({ ...service, color_hex: null })}
                className="text-xs"
              >
                Clear
              </Button>
            )}
            <p className="text-xs text-muted-foreground ml-auto">
              Used on the calendar stripe
            </p>
          </div>
        </div>
      </Section>
      </div>

      {/* Duration & pricing ----------------------------------------------- */}
      <Section
        title="Duration & pricing"
        description="How long this service takes and what it costs."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (minutes) *</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              value={service.duration_minutes || 30}
              onChange={(e) =>
                onServiceChange({
                  ...service,
                  duration_minutes: parseInt(e.target.value) || 30,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price (£)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={priceInPounds}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onServiceChange({ ...service, price_pence: null });
                  return;
                }
                const pounds = parseFloat(v);
                if (Number.isNaN(pounds)) return;
                onServiceChange({ ...service, price_pence: Math.round(pounds * 100) });
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recall_months">Recall interval (months)</Label>
          <Input
            id="recall_months"
            type="number"
            min="1"
            max="24"
            value={service.recall_months || ""}
            onChange={(e) =>
              onServiceChange({ ...service, recall_months: parseInt(e.target.value) || null })
            }
            placeholder="e.g. 6 for biannual check-ups"
            className="sm:max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            Completing this service auto-creates a recall this many months later.
          </p>
        </div>
      </Section>

      {/* NHS --------------------------------------------------------------- */}
      <Section
        title="NHS"
        description="Submit this service via FP17 with the corresponding band."
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="is_nhs" className="text-sm font-medium">NHS service</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Subject to NHS band pricing — the band determines the patient charge
              and the FP17 claim line.
            </p>
          </div>
          <Switch
            id="is_nhs"
            checked={service.is_nhs ?? false}
            onCheckedChange={(checked) =>
              onServiceChange({
                ...service,
                is_nhs: checked,
                nhs_band: checked ? service.nhs_band || "BAND_1" : null,
              })
            }
          />
        </div>

        {service.is_nhs && (
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="nhs_band">NHS band</Label>
            <SelectUI
              value={service.nhs_band || "BAND_1"}
              onValueChange={(v) => onServiceChange({ ...service, nhs_band: v })}
            >
              <SelectTriggerUI id="nhs_band">
                <SelectValueUI />
              </SelectTriggerUI>
              <SelectContentUI>
                {NHS_BANDS.map((b) => (
                  <SelectItemUI key={b.value} value={b.value}>
                    {b.label}
                  </SelectItemUI>
                ))}
              </SelectContentUI>
            </SelectUI>
          </div>
        )}
      </Section>

      {/* Buffers (col-span-2) ----------------------------------------- */}
      <div className="lg:col-span-2">
      <Section
        title="Buffers"
        description="Padding around the appointment for set-up and turnaround. Counts toward staff availability."
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="buffer_before">Before (min)</Label>
            <Input
              id="buffer_before"
              type="number"
              min="0"
              value={service.buffer_before_minutes || 0}
              onChange={(e) =>
                onServiceChange({
                  ...service,
                  buffer_before_minutes: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buffer_after">After (min)</Label>
            <Input
              id="buffer_after"
              type="number"
              min="0"
              value={service.buffer_after_minutes || 0}
              onChange={(e) =>
                onServiceChange({
                  ...service,
                  buffer_after_minutes: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>
      </Section>
      </div>

          </div>
        </TabsContent>

        {/* STAFF TAB ===================================================== */}
        <TabsContent value="staff" className="mt-4">
          <Section
            title="Who can perform this service?"
            description="At least one staff member must be assigned. Patients only see this service when at least one eligible staff member is available."
          >
            {nhsServiceMode && (
              <div className="rounded-md border border-blue-300/60 bg-blue-50/60 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-100 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-700 dark:text-blue-300" />
                <span>
                  This is an NHS service. Only staff with an active NHS performer
                  registration can be assigned — others are shown but disabled.
                  Add a registration on the staff member's profile to enable them.
                </span>
              </div>
            )}

            {assignedNonEligible.length > 0 && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-100 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
                <span>
                  {assignedNonEligible.length} assigned staff{" "}
                  {assignedNonEligible.length === 1 ? "member doesn't" : "members don't"}{" "}
                  have an active NHS performer registration. Either add one for
                  them or unassign them before submitting NHS claims.
                </span>
              </div>
            )}

            <div className="border rounded-md divide-y max-h-[28rem] overflow-y-auto">
              {staff.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No active staff yet.</p>
              ) : (
                staff.map((staffMember) => {
                  const checked = selectedStaff.includes(staffMember.id);
                  const isNhsEligible = nhsEligibleSet.has(staffMember.id);
                  // Block toggling ON when service is NHS and this clinician
                  // isn't NHS-eligible. Already-checked rows can be unchecked.
                  const blocked = nhsServiceMode && !isNhsEligible && !checked;
                  const warn = nhsServiceMode && !isNhsEligible && checked;
                  return (
                    <label
                      key={staffMember.id}
                      className={cn(
                        "flex items-center gap-3 p-3 transition-colors",
                        blocked && "opacity-60 cursor-not-allowed",
                        !blocked && "cursor-pointer hover:bg-muted/40",
                        checked && !warn && "bg-primary/5",
                        warn && "bg-amber-50/40 dark:bg-amber-950/15",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={blocked}
                        onChange={(e) => handleStaffToggle(staffMember.id, e.target.checked)}
                        className="rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {staffMember.full_name ?? staffMember.email}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize flex items-center gap-2 flex-wrap">
                          <span>{staffMember.role.toLowerCase()}</span>
                          {nhsServiceMode && !isNhsEligible && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 px-1.5 py-0.5 rounded normal-case">
                              No NHS performer
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {noStaffSelected && staff.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Select at least one staff member before saving.
              </p>
            )}
          </Section>
        </TabsContent>

        {/* BOOKINGS TAB =================================================== */}
        {mode === "edit" && service.id && (
          <TabsContent value="bookings" className="mt-4">
            <ServiceBookingsList serviceId={service.id} />
          </TabsContent>
        )}

        {/* VISIBILITY TAB ================================================= */}
        <TabsContent value="visibility" className="mt-4">
          <Section
            title="Visibility & status"
            description="Where the service appears, and whether it's available at all."
          >
            <ToggleRow
              id="is_publicly_bookable"
              label="Publicly bookable"
              description="Show on the public booking page on the marketing site."
              checked={service.is_publicly_bookable ?? true}
              onChange={(checked) =>
                onServiceChange({ ...service, is_publicly_bookable: checked })
              }
            />
            <div className="border-t" />
            <ToggleRow
              id="active"
              label="Active"
              description="Inactive services are hidden everywhere — block new bookings without losing the record."
              checked={service.is_active ?? true}
              onChange={handleActiveToggle}
              disabled={checkingAppointments}
            />
          </Section>
        </TabsContent>
      </Tabs>

      {/* Action bar — outside the Tabs so it's reachable from any tab. */}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
            className="sm:flex-none sm:w-32"
          >
            Cancel
          </Button>
        )}
        <Button onClick={onSubmit} disabled={saving} className="flex-1 sm:flex-none sm:w-48 sm:ml-auto">
          {saving
            ? "Saving…"
            : mode === "create"
            ? "Create service"
            : "Save changes"}
        </Button>
      </div>

      <AlertDialog open={showDeactivationWarning} onOpenChange={setShowDeactivationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot Deactivate Service</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This service has{" "}
                  <strong>
                    {futureAppointments?.count || 0} future appointment
                    {futureAppointments?.count !== 1 ? "s" : ""}
                  </strong>{" "}
                  scheduled.
                </p>

                {futureAppointments?.nextAppointment && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Appointment Schedule:
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      • Next:{" "}
                      {format(new Date(futureAppointments.nextAppointment.starts_at), "PPP p")}
                    </p>
                    {futureAppointments.lastAppointment && futureAppointments.count > 1 && (
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        • Last:{" "}
                        {format(new Date(futureAppointments.lastAppointment.starts_at), "PPP p")}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-sm">
                  Please reschedule or cancel these appointments before deactivating this service.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDeactivationWarning(false);
                setFutureAppointments(null);
              }}
            >
              OK
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Card-style section used throughout the form. Matches the rest of the
// app's pattern (NHSPerformerSection, HoursAndClosures, etc.) — header
// with title + small description, then the field rows below.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-lg border p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// Two-line toggle row — label + helper text on the left, switch on the
// right. Used in the Visibility section so the "Publicly bookable" and
// "Active" toggles read consistently.
function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

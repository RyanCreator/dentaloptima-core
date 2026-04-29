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
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { Service } from "@/types/entities";

const TREATMENT_TYPES = [
  { value: "checkup", label: "Check-up" },
  { value: "hygienist", label: "Hygienist" },
  { value: "filling", label: "Filling" },
  { value: "crown", label: "Crown" },
  { value: "bridge", label: "Bridge" },
  { value: "extraction", label: "Extraction" },
  { value: "root_canal", label: "Root Canal" },
  { value: "whitening", label: "Whitening" },
  { value: "implant", label: "Implant" },
  { value: "orthodontic", label: "Orthodontic" },
  { value: "consultation", label: "Consultation" },
  { value: "xray", label: "X-Ray" },
  { value: "denture", label: "Denture" },
  { value: "veneer", label: "Veneer" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
];

interface StaffMember {
  id: string;
  full_name: string;
  active: boolean;
}

interface ServiceFormProps {
  service: Partial<Service>;
  staff: StaffMember[];
  selectedStaff: string[];
  onServiceChange: (service: Partial<Service>) => void;
  onStaffSelectionChange: (staffIds: string[]) => void;
  onSubmit: () => void;
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

  const handleStaffToggle = (staffId: string, checked: boolean) => {
    if (checked) {
      onStaffSelectionChange([...selectedStaff, staffId]);
    } else {
      onStaffSelectionChange(selectedStaff.filter((id) => id !== staffId));
    }
  };

  const checkFutureAppointments = async (serviceId: string) => {
    setCheckingAppointments(true);
    try {
      const now = new Date().toISOString();

      // Query for future appointments with this service
      const { data, error } = await supabase
        .from('appointment')
        .select('starts_at')
        .eq('service_id', serviceId)
        .eq('status', 'SCHEDULED')
        .gte('starts_at', now)
        .order('starts_at', { ascending: true });

      if (error) {
        console.error('Error checking future appointments:', error);
        return null;
      }

      if (data && data.length > 0) {
        return {
          count: data.length,
          nextAppointment: data[0],
          lastAppointment: data[data.length - 1],
        };
      }

      return { count: 0 };
    } finally {
      setCheckingAppointments(false);
    }
  };

  const handleActiveToggle = async (checked: boolean) => {
    // If trying to deactivate (checked = false) and this is an existing service
    if (!checked && mode === 'edit' && service.id) {
      const appointments = await checkFutureAppointments(service.id);

      if (appointments && appointments.count > 0) {
        // Show warning dialog
        setFutureAppointments(appointments);
        setShowDeactivationWarning(true);
        return; // Don't change the active state yet
      }
    }

    // No future appointments or activating service - proceed
    onServiceChange({ ...service, active: checked });
  };

  const presetColors = [
    "#EF4444", // Red
    "#F97316", // Orange
    "#F59E0B", // Amber
    "#EAB308", // Yellow
    "#84CC16", // Lime
    "#22C55E", // Green
    "#10B981", // Emerald
    "#14B8A6", // Teal
    "#06B6D4", // Cyan
    "#0EA5E9", // Sky
    "#3B82F6", // Blue
    "#6366F1", // Indigo
    "#8B5CF6", // Violet
    "#A855F7", // Purple
    "#D946EF", // Fuchsia
    "#EC4899", // Pink
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="service_name">Service Name *</Label>
        <Input
          id="service_name"
          value={service.name || ""}
          onChange={(e) =>
            onServiceChange({ ...service, name: e.target.value })
          }
          placeholder="e.g., General Checkup"
        />
      </div>

      <div className="space-y-2">
        <Label>Color Tag (optional)</Label>
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-8 gap-2 flex-1">
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onServiceChange({ ...service, colour_tag: color })}
                className={`w-8 h-8 rounded-md transition-all hover:scale-110 ${
                  service.colour_tag?.toLowerCase() === color.toLowerCase()
                    ? "ring-2 ring-offset-2 ring-primary"
                    : "hover:ring-2 hover:ring-offset-2 hover:ring-muted-foreground/30"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          {service.colour_tag && (
            <button
              type="button"
              onClick={() => onServiceChange({ ...service, colour_tag: null })}
              className="px-3 py-2 text-xs border rounded-md hover:bg-muted transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Custom colour"
            value={service.colour_tag ?? "#3B82F6"}
            onChange={(e) =>
              onServiceChange({ ...service, colour_tag: e.target.value.toUpperCase() })
            }
            className="h-8 w-10 rounded-md border cursor-pointer bg-transparent p-0"
          />
          <Input
            value={service.colour_tag ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") {
                onServiceChange({ ...service, colour_tag: null });
                return;
              }
              const withHash = raw.startsWith("#") ? raw : `#${raw}`;
              onServiceChange({ ...service, colour_tag: withHash.toUpperCase() });
            }}
            placeholder="#3B82F6"
            className="font-mono text-xs h-8 w-28"
            maxLength={7}
          />
          <p className="text-xs text-muted-foreground">
            Or pick a custom hex value
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="duration">Duration (minutes) *</Label>
        <Input
          id="duration"
          type="number"
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
          value={service.price || 0}
          onChange={(e) =>
            onServiceChange({
              ...service,
              price: parseFloat(e.target.value) || 0,
            })
          }
        />
      </div>

      {/* Dental classification */}
      <div className="space-y-3 border-t pt-3">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dental Classification</Label>

        <div className="space-y-2">
          <Label htmlFor="treatment_type">Treatment Type</Label>
          <SelectUI
            value={service.treatment_type || ""}
            onValueChange={(v) => onServiceChange({ ...service, treatment_type: v || null })}
          >
            <SelectTriggerUI id="treatment_type">
              <SelectValueUI placeholder="Select type..." />
            </SelectTriggerUI>
            <SelectContentUI>
              {TREATMENT_TYPES.map((t) => (
                <SelectItemUI key={t.value} value={t.value}>{t.label}</SelectItemUI>
              ))}
            </SelectContentUI>
          </SelectUI>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="is_nhs">NHS service</Label>
            <p className="text-xs text-muted-foreground">Subject to NHS band pricing</p>
          </div>
          <Switch
            id="is_nhs"
            checked={service.is_nhs ?? false}
            onCheckedChange={(checked) =>
              onServiceChange({ ...service, is_nhs: checked, nhs_band: checked ? (service.nhs_band || 1) : null })
            }
          />
        </div>

        {service.is_nhs && (
          <div className="space-y-2 pl-4">
            <Label htmlFor="nhs_band">NHS Band</Label>
            <SelectUI
              value={service.nhs_band?.toString() || "1"}
              onValueChange={(v) => onServiceChange({ ...service, nhs_band: parseInt(v) })}
            >
              <SelectTriggerUI id="nhs_band">
                <SelectValueUI />
              </SelectTriggerUI>
              <SelectContentUI>
                <SelectItemUI value="1">Band 1 — Examination, diagnosis, X-rays</SelectItemUI>
                <SelectItemUI value="2">Band 2 — Fillings, extractions, root canals</SelectItemUI>
                <SelectItemUI value="3">Band 3 — Crowns, bridges, dentures</SelectItemUI>
              </SelectContentUI>
            </SelectUI>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="recall_months">Recall interval (months)</Label>
          <Input
            id="recall_months"
            type="number"
            min="1"
            max="60"
            value={service.recall_months || ""}
            onChange={(e) =>
              onServiceChange({ ...service, recall_months: parseInt(e.target.value) || null })
            }
            placeholder="e.g. 6 for biannual check-ups"
          />
          <p className="text-xs text-muted-foreground">
            When an appointment for this service is completed, a recall will be auto-created for this many months later
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="buffer_before">Buffer Before (min)</Label>
          <Input
            id="buffer_before"
            type="number"
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
          <Label htmlFor="buffer_after">Buffer After (min)</Label>
          <Input
            id="buffer_after"
            type="number"
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

      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="all_staff">All staff can perform</Label>
          <Switch
            id="all_staff"
            checked={service.all_staff_can_perform ?? true}
            onCheckedChange={(checked) =>
              onServiceChange({ ...service, all_staff_can_perform: checked })
            }
          />
        </div>

        {!service.all_staff_can_perform && (
          <div className="space-y-2 pl-4">
            <Label>Assign Staff Members</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
              {staff.map((staffMember) => (
                <label
                  key={staffMember.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedStaff.includes(staffMember.id)}
                    onChange={(e) =>
                      handleStaffToggle(staffMember.id, e.target.checked)
                    }
                    className="rounded"
                  />
                  <span className="text-sm">{staffMember.full_name}</span>
                </label>
              ))}
            </div>
            {selectedStaff.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                ⚠️ Service will be automatically deactivated with no staff assigned
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="requires_room">Requires dedicated room</Label>
          <Switch
            id="requires_room"
            checked={service.requires_room ?? false}
            onCheckedChange={(checked) =>
              onServiceChange({ ...service, requires_room: checked })
            }
          />
        </div>

        {service.requires_room && (
          <div className="space-y-2 pl-4">
            <Label htmlFor="room_capacity">Room Capacity *</Label>
            <Input
              id="room_capacity"
              type="number"
              min="1"
              value={service.room_capacity || ""}
              onChange={(e) =>
                onServiceChange({
                  ...service,
                  room_capacity: parseInt(e.target.value) || null,
                })
              }
              placeholder="e.g., 3 for 3 dental chairs"
            />
            <p className="text-xs text-muted-foreground">
              Maximum concurrent bookings allowed for this service
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <Label htmlFor="active">Active</Label>
        <Switch
          id="active"
          checked={service.active ?? true}
          onCheckedChange={handleActiveToggle}
          disabled={checkingAppointments}
        />
      </div>

      <Button onClick={onSubmit} disabled={saving} className="w-full">
        {saving
          ? "Saving..."
          : mode === "create"
          ? "Create Service"
          : "Update Service"}
      </Button>

      {/* Deactivation Warning Dialog */}
      <AlertDialog open={showDeactivationWarning} onOpenChange={setShowDeactivationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot Deactivate Service</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This service has <strong>{futureAppointments?.count || 0} future appointment{futureAppointments?.count !== 1 ? 's' : ''}</strong> scheduled.
                </p>

                {futureAppointments?.nextAppointment && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Appointment Schedule:
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      • Next: {format(new Date(futureAppointments.nextAppointment.starts_at), 'PPP p')}
                    </p>
                    {futureAppointments.lastAppointment && futureAppointments.count > 1 && (
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        • Last: {format(new Date(futureAppointments.lastAppointment.starts_at), 'PPP p')}
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
            <AlertDialogCancel onClick={() => {
              setShowDeactivationWarning(false);
              setFutureAppointments(null);
            }}>
              OK
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

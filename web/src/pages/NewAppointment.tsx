import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { validateUKPhone, formatUKPhone } from "@/lib/phoneValidation";
import { useAvailableSlots } from "@/hooks/useAvailableSlots";
import { useStaff } from "@/hooks/useStaff";
import { useServices } from "@/hooks/useServices";
import { usePatients } from "@/hooks/usePatients";
import { usePractice } from "@/contexts/PracticeContext";
import { useNhsEligibleStaffIds } from "@/hooks/useNhsEligibleStaffIds";
// Aliased to avoid the shadow with the local createAppointment handler that
// owns form validation. The renamed helper is the DB-level record writer.
import { createAppointment as createAppointmentRecord } from "@/lib/createAppointment";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface NewAppointmentFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  prefilledStaffId?: string;
  prefilledDate?: Date;
  prefilledTime?: string;
  prefilledServiceId?: string;
}

export default function NewAppointmentForm({
  onSuccess,
  onCancel,
  prefilledStaffId,
  prefilledDate,
  prefilledTime,
  prefilledServiceId,
}: NewAppointmentFormProps) {
  const { patients } = usePatients();
  const { services } = useServices();
  const { staff } = useStaff();
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const { eligibleSet: nhsEligibleSet } = useNhsEligibleStaffIds();
  const [filteredServices, setFilteredServices] = useState<any[]>([]);
  const [patientType, setPatientType] = useState<"existing" | "new">("existing");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientPhoneError, setNewPatientPhoneError] = useState("");
  const [newPatientEmail, setNewPatientEmail] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [pendingAppointmentData, setPendingAppointmentData] = useState<any>(null);

  const { availableSlots, staffOnHoliday, reason: availabilityReason } = useAvailableSlots({
    staffId: selectedStaff,
    selectedDate,
    serviceId: selectedService,
    services,
  });

  // Set prefilled values when props change
  useEffect(() => {
    if (prefilledStaffId) setSelectedStaff(prefilledStaffId);
    if (prefilledDate) setSelectedDate(prefilledDate);
    if (prefilledTime) setSelectedTime(prefilledTime);
    if (prefilledServiceId) setSelectedService(prefilledServiceId);
  }, [prefilledStaffId, prefilledDate, prefilledTime, prefilledServiceId]);

  // Smart default: when picking an existing patient who has a preferred
  // dentist set, auto-fill the staff field — but only if the user hasn't
  // already chosen one (manual selections win). Skip if the form was
  // opened with a prefilled staff (clicked from a specific column).
  useEffect(() => {
    if (patientType !== "existing" || !selectedPatient) return;
    if (selectedStaff || prefilledStaffId) return;
    const patient = patients.find((p) => p.id === selectedPatient);
    const preferred = patient?.preferred_dentist_id;
    if (!preferred) return;
    // Only set if the preferred dentist is in the staff dropdown (still
    // active at this practice). Otherwise quietly skip.
    if (staff.some((s) => s.id === preferred)) {
      setSelectedStaff(preferred);
    }
  }, [selectedPatient, patientType, patients, staff, prefilledStaffId, selectedStaff]);

  useEffect(() => {
    filterServicesByStaff();
  }, [selectedStaff, services]);

  const filterServicesByStaff = async () => {
    if (!selectedStaff) {
      setFilteredServices(services);
      return;
    }

    const { data: staffServices } = await supabase
      .from("staff_service")
      .select("service_id")
      .eq("staff_id", selectedStaff);

    const assignedServiceIds = staffServices?.map((ss) => ss.service_id) || [];

    const filtered = services.filter(
      (service) =>
        service.all_staff_can_perform || assignedServiceIds.includes(service.id)
    );

    setFilteredServices(filtered);

    if (selectedService && !filtered.find((s) => s.id === selectedService)) {
      setSelectedService("");
    }
  };

  const createAppointment = async (forceCreate = false) => {
    // Validate based on patient type
    if (patientType === "existing" && !selectedPatient) {
      toast.error("Please select a patient");
      return;
    }
    
    if (patientType === "new") {
      if (!newPatientName || !newPatientPhone) {
        toast.error("Please fill in patient name and phone");
        return;
      }

      // Validate phone number
      const phoneValidation = validateUKPhone(newPatientPhone);
      if (!phoneValidation.isValid) {
        setNewPatientPhoneError(phoneValidation.error || "Invalid phone number");
        toast.error("Please enter a valid UK phone number");
        return;
      }
    }

    if (!selectedService || !selectedStaff || !selectedDate || !selectedTime) {
      toast.error("Please fill in all required fields");
      return;
    }

    // NHS gate — blocks creating an appointment that can't yield a
    // submittable FP17 claim. The Select disables non-eligible staff for
    // NHS services, but a stale local state could let a previous selection
    // slip through; this is the backstop.
    const serviceObj = services.find((s) => s.id === selectedService);
    if (serviceObj?.is_nhs && !nhsEligibleSet.has(selectedStaff)) {
      toast.error(
        "This is an NHS service. The selected clinician has no active NHS performer registration — pick another clinician or add a registration first.",
      );
      return;
    }

    setCreating(true);

    try {
      const [hours, minutes] = selectedTime.split(":");
      const startsAt = new Date(selectedDate);
      startsAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      logger.info("Creating appointment", {
        staff: selectedStaff,
        service: selectedService,
        startsAt: startsAt.toISOString(),
      });

      const result = await createAppointmentRecord({
        practiceId,
        staffId: selectedStaff,
        serviceId: selectedService,
        startsAt,
        notes: notes || undefined,
        ...(patientType === "new"
          ? {
              newPatient: {
                fullName: newPatientName,
                phone: newPatientPhone,
                email: newPatientEmail || undefined,
              },
            }
          : { patientId: selectedPatient }),
      });

      if (!result.success) {
        // Overlap is a soft error — surface it as a toast rather than a
        // throw so the user can adjust the time without re-entering anything.
        toast.error(result.error || "Failed to create appointment");
        setCreating(false);
        return;
      }

      logger.info("Appointment created successfully", {
        appointmentId: result.appointment?.id,
      });
      toast.success("Appointment created successfully");
      onSuccess();
    } catch (error) {
      logger.error("Create appointment error", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create appointment";
      toast.error(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={patientType} onValueChange={(v) => setPatientType(v as "existing" | "new")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="existing">Existing Patient</TabsTrigger>
          <TabsTrigger value="new">New Patient</TabsTrigger>
        </TabsList>

        <TabsContent value="existing" className="space-y-2 mt-4">
          <Label>Patient *</Label>
          <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={patientSearchOpen}
                className="w-full justify-between"
              >
                {selectedPatient
                  ? patients.find((patient) => patient.id === selectedPatient)?.full_name
                  : "Search patient by name..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Type to search patients..." />
                <CommandList>
                  <CommandEmpty>No patient found.</CommandEmpty>
                  <CommandGroup>
                    {patients.map((patient) => (
                      <CommandItem
                        key={patient.id}
                        value={`${patient.full_name} ${patient.phone}`}
                        onSelect={() => {
                          setSelectedPatient(patient.id);
                          setPatientSearchOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedPatient === patient.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col">
                          <span className="font-medium">{patient.full_name}</span>
                          <span className="text-xs text-muted-foreground">{patient.phone}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          {selectedPatient && (
            <div className="mt-2 p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="font-medium">Phone:</span>{" "}
                {patients.find((p) => p.id === selectedPatient)?.phone}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Full Name *</Label>
            <Input
              value={newPatientName}
              onChange={(e) => setNewPatientName(e.target.value)}
              placeholder="Enter patient name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-patient-phone">Phone Number *</Label>
            <Input
              id="new-patient-phone"
              value={newPatientPhone}
              onChange={(e) => {
                setNewPatientPhone(e.target.value);
                // Clear error when user starts typing
                if (newPatientPhoneError) setNewPatientPhoneError("");
              }}
              onBlur={(e) => {
                const phone = e.target.value.trim();
                if (phone) {
                  const validation = validateUKPhone(phone);
                  if (validation.isValid) {
                    // Auto-format phone number
                    const formatted = formatUKPhone(phone);
                    setNewPatientPhone(formatted);
                    setNewPatientPhoneError("");
                  } else {
                    setNewPatientPhoneError(validation.error || "Invalid phone number");
                  }
                }
              }}
              placeholder="e.g., 07123 456 789 or 020 1234 5678"
              aria-invalid={!!newPatientPhoneError}
              aria-describedby={newPatientPhoneError ? "phone-error" : undefined}
              className={newPatientPhoneError ? "border-destructive" : ""}
            />
            {newPatientPhoneError && (
              <p id="phone-error" className="text-xs text-destructive font-medium" role="alert">
                {newPatientPhoneError}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={newPatientEmail}
              onChange={(e) => setNewPatientEmail(e.target.value)}
              placeholder="Enter email (optional)"
            />
          </div>
        </TabsContent>
      </Tabs>

          <div className="space-y-2">
            <Label>Service *</Label>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {filteredServices.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} ({service.duration_minutes} mins)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            // NHS gating — when the picked service is NHS, only staff with an
            // active NHS performer registration can perform it. Non-eligible
            // staff stay visible in the dropdown but are disabled, with a tag
            // explaining why so the admin knows to add a registration rather
            // than thinking the clinician's gone missing.
            const selectedServiceObj = services.find((s) => s.id === selectedService);
            const nhsServiceMode = !!selectedServiceObj?.is_nhs;
            const selectedStaffNotEligible =
              nhsServiceMode && selectedStaff && !nhsEligibleSet.has(selectedStaff);
            return (
              <div className="space-y-2">
                <Label>Staff Member *</Label>
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((member) => {
                      const isNhsEligible = nhsEligibleSet.has(member.id);
                      const blocked = nhsServiceMode && !isNhsEligible;
                      return (
                        <SelectItem
                          key={member.id}
                          value={member.id}
                          disabled={blocked}
                        >
                          <span className="flex items-center gap-2">
                            <span>{member.full_name}</span>
                            {blocked && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded normal-case">
                                No NHS performer
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedStaffNotEligible && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The selected clinician has no active NHS performer
                    registration — this appointment can't produce a submittable
                    FP17 claim. Pick another clinician or add a performer
                    registration first.
                  </p>
                )}
              </div>
            );
          })()}

          <div className="space-y-2">
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </div>

          {staffOnHoliday && selectedStaff && selectedDate && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Selected staff member is on holiday on this date
              </p>
            </div>
          )}

          {/* Diagnostic empty-state — the hook tells us *why* there's no
              slots so we can render an actionable message instead of a
              dead-end "No available slots". Each branch points at the
              specific config the practice needs to fix. */}
          {availableSlots.length === 0 && selectedStaff && selectedDate && selectedService && !staffOnHoliday && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 space-y-1">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                {availabilityReason === "no-staff-schedule" && "This staff member has no working hours set for this day"}
                {availabilityReason === "practice-closed-weekday" && "The practice has no opening hours for this day of the week"}
                {availabilityReason === "practice-closure" && "The practice is closed on this date"}
                {availabilityReason === "fully-booked" && "All slots are taken on this date"}
                {(availabilityReason === "ok" || availabilityReason === "loading" || availabilityReason === "missing-inputs") &&
                  "No available slots for this date"}
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                {availabilityReason === "no-staff-schedule" &&
                  "Open the staff member's profile and add their weekly schedule, then come back."}
                {availabilityReason === "practice-closed-weekday" &&
                  "Set the practice's opening hours for this weekday under Settings → Hours, or pick another day."}
                {availabilityReason === "practice-closure" &&
                  "Pick another date, or remove the closure under Settings → Hours."}
                {availabilityReason === "fully-booked" &&
                  "You can still book at a specific time below — an overlap warning will appear."}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Time *</Label>
            {availableSlots.length > 0 ? (
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : selectedService ? (
              <p className="text-sm text-muted-foreground py-2">
                Loading available times...
              </p>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                Please select a service to see available times
              </p>
            )}

            {selectedTime && selectedService && selectedStaff && selectedDate && !availableSlots.includes(selectedTime) && (
              <div className="mt-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  This time isn’t in the schedule for the selected staff/service. You can still book it; an overlap warning will appear and you can confirm to proceed.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Add any notes about the appointment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

      <div className="flex gap-2 pt-4">
        <Button
          onClick={() => createAppointment()}
          disabled={creating || !selectedService || !selectedStaff || !selectedDate || !selectedTime || 
            (patientType === "existing" && !selectedPatient) ||
            (patientType === "new" && (!newPatientName || !newPatientPhone))}
          className="flex-1"
        >
          {creating ? "Creating..." : "Create Appointment"}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>

      <AlertDialog open={showOverlapWarning} onOpenChange={setShowOverlapWarning}>
        <AlertDialogContent aria-describedby="overlap-warning-desc">
          <AlertDialogHeader>
            <AlertDialogTitle>Appointment Overlap Warning</AlertDialogTitle>
            <AlertDialogDescription id="overlap-warning-desc">
              This appointment will overlap with an existing appointment or may not fit in the available gap. 
              The service duration and buffers may extend beyond the available time slot.
              <br /><br />
              Do you want to create this appointment anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowOverlapWarning(false);
              setPendingAppointmentData(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setShowOverlapWarning(false);
              await createAppointment(true);
            }}>
              Create Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

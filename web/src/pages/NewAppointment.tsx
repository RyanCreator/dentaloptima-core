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

  const { availableSlots, staffOnHoliday } = useAvailableSlots({
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

    setCreating(true);

    try {
      // Prepare appointment data
      const [hours, minutes] = selectedTime.split(":");
      const appointmentTime = new Date(selectedDate);
      appointmentTime.setHours(parseInt(hours), parseInt(minutes), 0);

      // Build request payload
      const payload: any = {
        staff_id: selectedStaff,
        service_id: selectedService,
        starts_at: appointmentTime.toISOString(),
        notes: notes || undefined,
        allow_overlap: forceCreate,
      };

      // Add patient data
      if (patientType === "new") {
        payload.new_patient = {
          full_name: newPatientName,
          phone: newPatientPhone,
          email: newPatientEmail || undefined,
        };
      } else {
        payload.patient_id = selectedPatient;
      }

      logger.info("Creating appointment via edge function", { payload });

      // Call secure edge function
      const { data, error } = await supabase.functions.invoke('create-appointment', {
        body: payload,
      });

      if (error) {
        logger.error("Create appointment error", error);
        
        // Handle overlap conflict
        if (error.message?.includes('overlaps') || error.message?.includes('409')) {
          // Get service for warning dialog
          const service = services.find((s) => s.id === selectedService);
          if (service) {
            setPendingAppointmentData({
              patientId: selectedPatient,
              service,
            });
            setShowOverlapWarning(true);
            setCreating(false);
            return;
          }
        }
        
        // Handle room capacity
        if (error.message?.includes('capacity') || error.message?.includes('Room')) {
          toast.error(error.message || "Room capacity exceeded");
          setCreating(false);
          return;
        }
        
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to create appointment");
      }

      logger.info("Appointment created successfully", { appointmentId: data.appointment?.id });
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

          <div className="space-y-2">
            <Label>Staff Member *</Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {availableSlots.length === 0 && selectedStaff && selectedDate && selectedService && !staffOnHoliday && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                No available slots for this date
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

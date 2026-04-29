import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAvailableSlots } from "@/hooks/useAvailableSlots";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: any[];
  staff: any[];
  patientId: string;
  requestId: string;
  onSuccess: () => void;
  prefilledData?: {
    staffId: string;
    date: Date;
    time: string;
    serviceId: string;
  } | null;
}

export function BookingDialog({
  open,
  onOpenChange,
  services,
  staff,
  patientId,
  requestId,
  onSuccess,
  prefilledData,
}: BookingDialogProps) {
  const [selectedService, setSelectedService] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [loading, setLoading] = useState(false);
  const { sendAppointmentConfirmedNotification } = useNotifications();

  // Apply prefilled data when dialog opens with prefilled values
  useEffect(() => {
    if (open && prefilledData) {
      setSelectedService(prefilledData.serviceId);
      setSelectedStaff(prefilledData.staffId);
      setSelectedDate(prefilledData.date);
      setSelectedTime(prefilledData.time);
    } else if (!open) {
      // Reset when dialog closes
      setSelectedService("");
      setSelectedStaff("");
      setSelectedDate(undefined);
      setSelectedTime("");
    }
  }, [open, prefilledData]);

  const { availableSlots, staffOnHoliday } = useAvailableSlots({
    staffId: selectedStaff,
    selectedDate,
    serviceId: selectedService,
    services,
  });

  const createAppointment = async () => {
    if (!selectedService || !selectedStaff || !selectedDate || !selectedTime) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      // Prepare appointment time
      const [hours, minutes] = selectedTime.split(":");
      const appointmentTime = new Date(selectedDate);
      appointmentTime.setHours(parseInt(hours), parseInt(minutes), 0);

      // Build request payload for edge function
      const payload = {
        patient_id: patientId,
        staff_id: selectedStaff,
        service_id: selectedService,
        starts_at: appointmentTime.toISOString(),
        allow_overlap: false, // No override for enquiry bookings
      };

      logger.info("Creating appointment from enquiry via edge function", { payload });

      // Call secure edge function with atomic booking logic
      const { data, error } = await supabase.functions.invoke('create-appointment', {
        body: payload,
      });

      if (error) {
        logger.error("Create appointment error from enquiry", error);

        // Handle overlap conflict
        if (error.message?.includes('overlaps') || error.message?.includes('409')) {
          toast.error("This time slot overlaps with an existing appointment. Please choose a different time.");
          setLoading(false);
          return;
        }

        // Handle room capacity
        if (error.message?.includes('capacity') || error.message?.includes('Room')) {
          toast.error(error.message || "Room capacity exceeded for this time slot");
          setLoading(false);
          return;
        }

        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to create appointment");
      }

      logger.info("Appointment created successfully from enquiry", { appointmentId: data.appointment?.id });

      // Update booking request status
      const { error: statusError } = await supabase
        .from("booking_request")
        .update({ status: "CONFIRMED" })
        .eq("id", requestId);

      if (statusError) {
        logger.error("Failed to update booking request status", statusError);
        toast.error("Failed to update status");
      } else {
        toast.success("Appointment booked successfully");

        // Send confirmation notification to patient
        if (data.appointment?.id) {
          await sendAppointmentConfirmedNotification(patientId, data.appointment.id);
        }

        onSuccess();
        onOpenChange(false);
      }
    } catch (error) {
      logger.error("Unexpected error creating appointment from enquiry", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create appointment";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Book Appointment</SheetTitle>
          <SheetDescription className="sr-only">
            Select service, staff member, date and time for the appointment
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Service *</Label>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
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
              <PopoverContent className="w-auto p-0" align="start">
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

          <div className="space-y-2">
            <Label>Time *</Label>
            {staffOnHoliday ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Staff member has time off on this date
              </p>
            ) : availableSlots.length > 0 ? (
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
            ) : selectedStaff && selectedDate ? (
              <p className="text-sm text-muted-foreground">No available slots</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select staff member and date to see available times
              </p>
            )}
          </div>

          <Button
            onClick={createAppointment}
            disabled={loading || !selectedService || !selectedStaff || !selectedDate || !selectedTime}
            className="w-full"
          >
            {loading ? "Booking..." : "Book Appointment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

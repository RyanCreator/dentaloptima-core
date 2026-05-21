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
import { usePractice } from "@/contexts/PracticeContext";
// Aliased to avoid the shadow with the local createAppointment handler.
import { createAppointment as createAppointmentRecord } from "@/lib/createAppointment";
import { ensurePatientForBookingRequest } from "@/lib/ensurePatientForBookingRequest";

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: any[];
  staff: any[];
  // Null when the enquiry came in via the public form — no patient row
  // exists yet. We auto-create one from the booking_request fields below.
  patientId: string | null;
  requestId: string;
  // Fallback contact details from the booking_request itself, used to
  // create a patient on the fly when patientId is null.
  patientFallback?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
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
  patientFallback,
  onSuccess,
  prefilledData,
}: BookingDialogProps) {
  const [selectedService, setSelectedService] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [loading, setLoading] = useState(false);
  const { sendAppointmentConfirmedNotification } = useNotifications();
  const tenant = usePractice();
  const practiceId = tenant.practice.id;

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
      // Public-form enquiries arrive with no patient_id — auto-create one
      // from the request fallback fields so the appointment FK resolves.
      const ensured = await ensurePatientForBookingRequest({
        practiceId,
        requestId,
        existingPatientId: patientId,
        fallback: patientFallback,
      });
      if (!ensured.ok) {
        toast.error(ensured.error);
        setLoading(false);
        return;
      }
      const resolvedPatientId = ensured.patientId;
      // Tell reception when we reused an existing patient row instead of
      // creating one — they need to know in case the match is wrong.
      if (ensured.matched && ensured.matchedName) {
        toast.message(
          `Linked to existing patient: ${ensured.matchedName}`,
          { description: `Matched by ${ensured.matchedBy}` },
        );
      }

      const [hours, minutes] = selectedTime.split(":");
      const startsAt = new Date(selectedDate);
      startsAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const result = await createAppointmentRecord({
        practiceId,
        patientId: resolvedPatientId,
        staffId: selectedStaff,
        serviceId: selectedService,
        startsAt,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to create appointment");
        setLoading(false);
        return;
      }

      logger.info("Appointment created from enquiry", {
        appointmentId: result.appointment?.id,
      });

      // Mirror the booking request status so the enquiry list shows it as
      // confirmed once we've successfully booked.
      const { error: statusError } = await supabase
        .from("booking_request")
        .update({ status: "CONFIRMED" })
        .eq("id", requestId);

      if (statusError) {
        logger.error("Failed to update booking request status", statusError);
        toast.error("Booked, but failed to update enquiry status");
      } else {
        toast.success("Appointment booked successfully");
        if (result.appointment?.id) {
          await sendAppointmentConfirmedNotification(resolvedPatientId, result.appointment.id);
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

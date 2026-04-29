import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { DetailSheet } from "@/components/DetailSheet";
import { FormField } from "@/components/FormField";
import { useRequireAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useAvailableSlots } from "@/hooks/useAvailableSlots";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { CalendarIcon, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

interface WaitingListEntry {
  id: string;
  preferred_times: string | null;
  priority: number;
  created_at: string;
  resolved_at: string | null;
  notes: string | null;
  service_id: string | null;
  patient: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
  };
  service?: {
    id: string;
    name: string;
    duration_minutes: number;
  } | null;
}

export default function WaitingListPage() {
  const { loading } = useRequireAuth();
  const { sendAppointmentConfirmedNotification } = useNotifications();
  const [entries, setEntries] = useState<WaitingListEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<WaitingListEntry | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editedPreferredTimes, setEditedPreferredTimes] = useState("");
  const [editedNotes, setEditedNotes] = useState("");
  const [editedPriority, setEditedPriority] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [staffOnHoliday, setStaffOnHoliday] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  useEffect(() => {
    if (!loading) {
      loadServices();
      loadStaff();
    }
  }, [loading]);

  // Reload when search or service filter changes
  useEffect(() => {
    if (!loading) {
      loadEntries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchTerm, serviceFilter]);

  // Real-time updates subscription
  useEffect(() => {
    if (loading) return;

    const channel = supabase
      .channel("waiting-list-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiting_list",
        },
        () => {
          // Reload waiting list when any change occurs
          loadEntries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchTerm, serviceFilter]);

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);

    try {
      let query = supabase
        .from("waiting_list")
        .select(`
          id,
          preferred_times,
          priority,
          created_at,
          resolved_at,
          notes,
          service_id,
          patient:patient_id (id, full_name, phone, email),
          service:service_id (id, name, duration_minutes)
        `)
        .is("resolved_at", null);

      // Apply service filter
      if (serviceFilter && serviceFilter !== "all") {
        query = query.eq("service_id", serviceFilter);
      }

      // Order by priority
      query = query
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });

      const { data, error } = await query;

      if (error) {
        logger.error("Error loading waiting list", error);
        toast.error("Failed to load waiting list");
        setEntries([]);
      } else if (data) {
        let filteredEntries = data as WaitingListEntry[];

        // Apply client-side search
        if (searchTerm.trim()) {
          const searchLower = searchTerm.toLowerCase();
          filteredEntries = filteredEntries.filter(entry =>
            entry.patient?.full_name?.toLowerCase().includes(searchLower) ||
            entry.patient?.phone?.includes(searchTerm) ||
            entry.preferred_times?.toLowerCase().includes(searchLower)
          );
        }

        setEntries(filteredEntries);
      }
    } catch (error) {
      logger.error("Unexpected error loading waiting list", error);
      toast.error("An unexpected error occurred");
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [searchTerm, serviceFilter]);

  const loadServices = async () => {
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");

    if (data) {
      setServices(data);
    }
  };

  const loadStaff = async () => {
    const { data } = await supabase
      .from("app_staff")
      .select("*")
      .eq("active", true)
      .is("deleted_at", null)
      .order("full_name");

    if (data) {
      setStaff(data);
    }
  };

  const openDetail = (entry: WaitingListEntry) => {
    setSelectedEntry(entry);
    setEditedPreferredTimes(entry.preferred_times || "");
    setEditedNotes(entry.notes || "");
    setEditedPriority(entry.priority);
    setIsSheetOpen(true);
  };

  const handleSave = async () => {
    if (!selectedEntry) return;

    setSaving(true);
    const { error } = await supabase
      .from("waiting_list")
      .update({
        preferred_times: editedPreferredTimes || null,
        notes: editedNotes || null,
        priority: editedPriority,
      })
      .eq("id", selectedEntry.id);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setIsSheetOpen(false);
      loadEntries();
    }
    setSaving(false);
  };

  // Use the proper availability hook instead of custom logic
  const { availableSlots: calculatedSlots, staffOnHoliday: isStaffOnHoliday } = useAvailableSlots({
    staffId: selectedStaff,
    selectedDate: selectedDate,
    serviceId: selectedService,
    services: services,
  });

  // Update local state when calculated slots change
  useEffect(() => {
    setAvailableSlots(calculatedSlots);
    setStaffOnHoliday(isStaffOnHoliday);
  }, [calculatedSlots, isStaffOnHoliday]);

  const handleStatusChange = async (status: "CONFIRMED" | "CANCELLED" | "REJECTED") => {
    if (!selectedEntry) return;

    if (status === "CONFIRMED") {
      // Open booking dialog and pre-fill service if available
      if (selectedEntry.service_id) {
        setSelectedService(selectedEntry.service_id);
      }
      setShowBookingDialog(true);
      return;
    }

    setSaving(true);
    
    // Find the booking_request associated with this patient. maybeSingle()
    // returns null rather than throwing if no row exists — the caller can
    // continue to update the waiting list even without a paired booking request.
    const { data: bookingRequest, error: bookingLookupError } = await supabase
      .from("booking_request")
      .select("id")
      .eq("patient_id", selectedEntry.patient.id)
      .eq("status", "WAITLIST")
      .maybeSingle();

    if (bookingLookupError) {
      toast.error("Failed to look up booking request");
      setSaving(false);
      return;
    }

    if (bookingRequest) {
      // Update the booking request status
      const { error: updateError } = await supabase
        .from("booking_request")
        .update({ status })
        .eq("id", bookingRequest.id);

      if (updateError) {
        toast.error("Failed to update status");
        setSaving(false);
        return;
      }
    }

    // Mark waiting list entry as resolved
    const { error } = await supabase
      .from("waiting_list")
      .update({
        resolved_at: new Date().toISOString(),
      })
      .eq("id", selectedEntry.id);

    if (error) {
      toast.error("Failed to update");
    } else {
      const message = status === "REJECTED" ? "Request rejected" : "Request cancelled";
      toast.success(message);
      setIsSheetOpen(false);
      loadEntries();
    }
    setSaving(false);
  };

  const createAppointment = async () => {
    if (!selectedService || !selectedStaff || !selectedDate || !selectedTime || !selectedEntry) {
      toast.error("Please fill in all fields");
      return;
    }

    setBookingLoading(true);

    try {
      // Prepare appointment time
      const [hours, minutes] = selectedTime.split(":");
      const appointmentTime = new Date(selectedDate);
      appointmentTime.setHours(parseInt(hours), parseInt(minutes), 0);

      // Build request payload for edge function
      const payload = {
        patient_id: selectedEntry.patient.id,
        staff_id: selectedStaff,
        service_id: selectedService,
        starts_at: appointmentTime.toISOString(),
        allow_overlap: false, // No override for waitlist bookings
      };

      logger.info("Creating appointment from waitlist via edge function", { payload });

      // Call secure edge function with atomic booking logic
      const { data, error } = await supabase.functions.invoke('create-appointment', {
        body: payload,
      });

      if (error) {
        logger.error("Create appointment error from waitlist", error);

        // Handle overlap conflict
        if (error.message?.includes('overlaps') || error.message?.includes('409')) {
          toast.error("This time slot overlaps with an existing appointment. Please choose a different time.");
          setBookingLoading(false);
          return;
        }

        // Handle room capacity
        if (error.message?.includes('capacity') || error.message?.includes('Room')) {
          toast.error(error.message || "Room capacity exceeded for this time slot");
          setBookingLoading(false);
          return;
        }

        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to create appointment");
      }

      logger.info("Appointment created successfully from waitlist", { appointmentId: data.appointment?.id });

      // Find and update booking request (optional — waitlist entry may exist
      // without a paired booking_request, don't fail if absent)
      const { data: bookingRequest } = await supabase
        .from("booking_request")
        .select("id")
        .eq("patient_id", selectedEntry.patient.id)
        .eq("status", "WAITLIST")
        .maybeSingle();

      if (bookingRequest) {
        await supabase
          .from("booking_request")
          .update({ status: "CONFIRMED" })
          .eq("id", bookingRequest.id);
      }

      // Mark waiting list entry as resolved
      const { error: waitlistError } = await supabase
        .from("waiting_list")
        .update({
          resolved_at: new Date().toISOString(),
        })
        .eq("id", selectedEntry.id);

      if (waitlistError) {
        logger.error("Failed to update waiting list", waitlistError);
        toast.error("Failed to update waiting list");
      } else {
        toast.success("Appointment booked successfully");

        // Send confirmation notification to patient
        if (data.appointment?.id) {
          await sendAppointmentConfirmedNotification(selectedEntry.patient.id, data.appointment.id);
        }

        setShowBookingDialog(false);
        setIsSheetOpen(false);
        loadEntries();
      }
    } catch (error) {
      logger.error("Unexpected error creating appointment from waitlist", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create appointment";
      toast.error(errorMessage);
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading || loadingEntries) {
    return (
      <Layout title="Waiting List">
        <div>Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Waiting List">
      <div className="space-y-4">
        {/* Search and Filter Bar */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by patient name, phone, or preferred times..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Service Filter */}
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {entries.length === 0 ? (
          <div className="bg-card rounded-lg border p-8 text-center">
            <div className="space-y-2">
              {searchTerm || serviceFilter !== "all" ? (
                <>
                  <Search className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="font-medium">No results found</p>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your {searchTerm && serviceFilter !== "all" ? "search and filter" : searchTerm ? "search terms" : "service filter"}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">No patients on the waiting list</p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-lg border overflow-hidden">
            {/* Header Row */}
            <div className="hidden md:grid md:grid-cols-[60px,1fr,180px,1fr,140px] gap-3 px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
              <div className="text-center">#</div>
              <div>Patient</div>
              <div>Service</div>
              <div>Preferred Times</div>
              <div className="text-right">Added</div>
            </div>

            {/* Data Rows */}
            <div className="divide-y">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => openDetail(entry)}
                  className="w-full grid grid-cols-[50px,1fr,auto] md:grid-cols-[60px,1fr,180px,1fr,140px] gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left items-center"
                >
                  {/* Priority */}
                  <div className="flex justify-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 text-primary font-medium text-sm">
                      {entry.priority}
                    </span>
                  </div>

                  {/* Patient Name */}
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{entry.patient?.full_name || "—"}</h3>
                    {/* Mobile: Show service below name */}
                    {entry.service && (
                      <p className="md:hidden text-sm text-primary truncate">
                        {entry.service.name}
                      </p>
                    )}
                  </div>

                  {/* Service (Desktop only - hidden on mobile) */}
                  <div className="hidden md:block min-w-0">
                    <p className="text-sm font-medium text-primary truncate">
                      {entry.service?.name || "—"}
                    </p>
                  </div>

                  {/* Preferred Times (Desktop only - hidden on mobile) */}
                  <div className="hidden md:block min-w-0">
                    <p className="text-sm text-muted-foreground truncate">
                      {entry.preferred_times || "—"}
                    </p>
                  </div>

                  {/* Date */}
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <DetailSheet
        trigger={<></>}
        title={selectedEntry?.patient?.full_name || "Waiting List Entry"}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
      >
        {selectedEntry && (
          <div className="space-y-6">
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[80px,1fr] gap-2">
                <span className="text-muted-foreground">Phone</span>
                <span className="truncate">{selectedEntry.patient?.phone}</span>
              </div>
              {selectedEntry.patient?.email && (
                <div className="grid grid-cols-[80px,1fr] gap-2">
                  <span className="text-muted-foreground">Email</span>
                  <span className="truncate">{selectedEntry.patient?.email}</span>
                </div>
              )}
              <div className="grid grid-cols-[80px,1fr] gap-2">
                <span className="text-muted-foreground">Service</span>
                <span className="truncate font-medium">
                  {selectedEntry.service?.name || "Any service"}
                </span>
              </div>
              <div className="grid grid-cols-[80px,1fr] gap-2">
                <span className="text-muted-foreground">Added</span>
                <span className="truncate">
                  {formatDistanceToNow(new Date(selectedEntry.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <FormField label="Priority" helpText="Lower number = higher priority (1 = highest)">
                <Input
                  type="number"
                  value={editedPriority}
                  onChange={(e) => setEditedPriority(parseInt(e.target.value) || 1)}
                  min="1"
                />
              </FormField>

              <FormField label="Preferred Times" helpText="e.g., Weekday mornings, Fridays after 2pm">
                <Textarea
                  value={editedPreferredTimes}
                  onChange={(e) => setEditedPreferredTimes(e.target.value)}
                  placeholder="Enter preferred appointment times..."
                  rows={3}
                />
              </FormField>

              <FormField label="Notes" helpText="Additional information about this patient">
                <Textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  placeholder="Enter notes..."
                  rows={4}
                />
              </FormField>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <p className="text-sm font-medium">Actions</p>

              {/* Primary Action */}
              <Button
                onClick={() => handleStatusChange("CONFIRMED")}
                disabled={saving}
                className="w-full"
              >
                Book Appointment
              </Button>

              {/* Secondary Actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleStatusChange("REJECTED")}
                  disabled={saving}
                  size="sm"
                  variant="destructive"
                >
                  Reject
                </Button>
                <Button
                  onClick={() => handleStatusChange("CANCELLED")}
                  disabled={saving}
                  size="sm"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </DetailSheet>

      <Sheet open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Book Appointment for {selectedEntry?.patient?.full_name}</SheetTitle>
            <SheetDescription className="sr-only">
              Select service, staff member, date and time for the appointment
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={selectedService} onValueChange={setSelectedService}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} ({service.duration_minutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Staff Member</Label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member" />
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
              <Label>Date</Label>
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
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Time</Label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    !selectedStaff || !selectedDate || !selectedService
                      ? "Select staff, date and service first"
                      : staffOnHoliday
                      ? "Staff member on holiday"
                      : availableSlots.length === 0
                      ? "No available slots"
                      : "Select a time"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={createAppointment}
                disabled={bookingLoading}
                className="flex-1"
              >
                {bookingLoading ? "Booking..." : "Confirm Booking"}
              </Button>
              <Button
                onClick={() => setShowBookingDialog(false)}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Layout>
  );
}

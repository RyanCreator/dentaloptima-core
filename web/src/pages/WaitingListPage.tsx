import { useEffect, useState, useCallback, useRef } from "react";
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
import { CalendarIcon, Search, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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
import { PageLoading } from "@/components/PageLoading";
import { usePractice } from "@/contexts/PracticeContext";
// Aliased to avoid the shadow with the local createAppointment handler.
import { createAppointment as createAppointmentRecord } from "@/lib/createAppointment";

// dentaloptima-core enum values for waiting_list.priority and
// waiting_list.preferred_time_of_day. Mirroring them in TS so we can render
// proper Selects rather than pretending priority is an integer.
type WaitlistPriority = "URGENT" | "HIGH" | "NORMAL" | "LOW";
type PreferredTimeOfDay = "MORNING" | "AFTERNOON" | "EVENING" | "ANY";

const PRIORITY_OPTIONS: { value: WaitlistPriority; label: string }[] = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "NORMAL", label: "Normal" },
  { value: "LOW", label: "Low" },
];

const TIME_OF_DAY_OPTIONS: { value: PreferredTimeOfDay; label: string }[] = [
  { value: "MORNING", label: "Morning" },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "EVENING", label: "Evening" },
  { value: "ANY", label: "Any time" },
];

const PRIORITY_BADGE: Record<WaitlistPriority, string> = {
  URGENT: "bg-red-100 text-red-700",
  HIGH: "bg-amber-100 text-amber-700",
  NORMAL: "bg-blue-100 text-blue-700",
  LOW: "bg-gray-100 text-gray-700",
};

interface WaitingListEntry {
  id: string;
  preferred_time_of_day: PreferredTimeOfDay | null;
  priority: WaitlistPriority;
  created_at: string;
  is_active: boolean;
  fulfilled_at: string | null;
  cancelled_at: string | null;
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
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [entries, setEntries] = useState<WaitingListEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  // First-load gate so search/filter changes don't flash the list
  // empty while the new query runs — stale rows stay visible.
  const hasLoadedOnce = useRef(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitingListEntry | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editedTimeOfDay, setEditedTimeOfDay] = useState<PreferredTimeOfDay>("ANY");
  const [editedNotes, setEditedNotes] = useState("");
  const [editedPriority, setEditedPriority] = useState<WaitlistPriority>("NORMAL");
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

  // Booking dialog state needs explicit cleanup whenever the dialog
  // closes. Without this, opening "Book Appointment" on entry A, closing
  // it, then opening on entry B inherits A's selectedStaff/date/time —
  // staff would book the wrong slot if they didn't notice the prefill.
  const closeBookingDialog = () => {
    setShowBookingDialog(false);
    setSelectedService("");
    setSelectedStaff("");
    setSelectedDate(undefined);
    setSelectedTime("");
    setAvailableSlots([]);
  };

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

  // Real-time updates subscription. Scoped to the current practice so we
  // don't trigger reloads when other tenants' waitlists change — RLS
  // would filter the payload anyway, but the callback still fires
  // without the filter, causing a wasted query on every cross-tenant
  // event.
  useEffect(() => {
    if (loading || !practiceId) return;

    const channel = supabase
      .channel(`waiting-list-changes-${practiceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiting_list",
          filter: `practice_id=eq.${practiceId}`,
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
    if (!hasLoadedOnce.current) setLoadingEntries(true);

    try {
      // waiting_list column changes from legacy:
      //   preferred_times → preferred_time_of_day (enum)
      //   resolved_at     → fulfilled_at / cancelled_at + is_active flag
      //   priority        → enum (URGENT/HIGH/NORMAL/LOW), not int
      let query = supabase
        .from("waiting_list")
        .select(`
          id,
          preferred_time_of_day,
          preferred_days_of_week,
          priority,
          created_at,
          fulfilled_at,
          cancelled_at,
          is_active,
          notes,
          service_id,
          patient:patient_id (id, full_name, phone, email),
          service:service_id (id, name, duration_minutes)
        `)
        .eq("is_active", true)
        .is("deleted_at", null);

      // Apply service filter
      if (serviceFilter && serviceFilter !== "all") {
        query = query.eq("service_id", serviceFilter);
      }

      // Order by priority. Postgres enums sort by their declaration order
      // (URGENT first, LOW last), which matches what we want.
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
            entry.preferred_time_of_day?.toLowerCase().includes(searchLower)
          );
        }

        setEntries(filteredEntries);
      }
    } catch (error) {
      logger.error("Unexpected error loading waiting list", error);
      toast.error("An unexpected error occurred");
      setEntries([]);
    } finally {
      hasLoadedOnce.current = true;
      setLoadingEntries(false);
    }
  }, [searchTerm, serviceFilter]);

  const loadServices = async () => {
    const { data } = await supabase
      .from("service")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name");

    if (data) {
      setServices(data);
    }
  };

  const loadStaff = async () => {
    const { data } = await supabase
      .from("practice_member")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name");

    if (data) {
      setStaff(data);
    }
  };

  const openDetail = (entry: WaitingListEntry) => {
    setSelectedEntry(entry);
    setEditedTimeOfDay(entry.preferred_time_of_day ?? "ANY");
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
        preferred_time_of_day: editedTimeOfDay,
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

    // Mark waiting list entry as no longer active. resolved_at is gone in
    // the new schema — we set is_active=false and stamp cancelled_at so the
    // history is preserved.
    const { error } = await supabase
      .from("waiting_list")
      .update({
        is_active: false,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: status === "REJECTED" ? "Rejected" : "Cancelled",
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
      const [hours, minutes] = selectedTime.split(":");
      const startsAt = new Date(selectedDate);
      startsAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const result = await createAppointmentRecord({
        practiceId,
        patientId: selectedEntry.patient.id,
        staffId: selectedStaff,
        serviceId: selectedService,
        startsAt,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to create appointment");
        setBookingLoading(false);
        return;
      }

      logger.info("Appointment created from waitlist", {
        appointmentId: result.appointment?.id,
      });

      // Find and update booking request (optional — waitlist entry may exist
      // without a paired booking_request, don't fail if absent)
      const { data: bookingRequest } = await supabase
        .from("booking_request")
        .select("id")
        .eq("patient_id", selectedEntry.patient.id)
        .eq("status", "WAITLIST")
        .maybeSingle();

      if (bookingRequest) {
        // Surface failures — without the error check, an RLS or
        // constraint reject would leave the booking_request stuck in
        // WAITLIST while the toast claimed success. Logged rather than
        // toasted because the appointment itself succeeded; the staff
        // member shouldn't be blocked from finishing their flow.
        const { error: brUpdateErr } = await supabase
          .from("booking_request")
          .update({ status: "CONFIRMED" })
          .eq("id", bookingRequest.id);
        if (brUpdateErr) {
          logger.error("Failed to update booking_request after waitlist booking", brUpdateErr);
        }
      }

      // Mark waiting list entry as fulfilled. is_active=false closes the
      // entry; fulfilled_appointment_id links back to the appointment that
      // satisfied the wait.
      const { error: waitlistError } = await supabase
        .from("waiting_list")
        .update({
          is_active: false,
          fulfilled_at: new Date().toISOString(),
          fulfilled_appointment_id: result.appointment?.id ?? null,
        })
        .eq("id", selectedEntry.id);

      if (waitlistError) {
        logger.error("Failed to update waiting list", waitlistError);
        toast.error("Failed to update waiting list");
      } else {
        toast.success("Appointment booked successfully");

        if (result.appointment?.id) {
          await sendAppointmentConfirmedNotification(
            selectedEntry.patient.id,
            result.appointment.id,
          );
        }

        closeBookingDialog();
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
        <PageLoading />
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
          searchTerm || serviceFilter !== "all" ? (
            <EmptyState
              icon={Search}
              title="No results found"
              body={`Try adjusting your ${
                searchTerm && serviceFilter !== "all"
                  ? "search and filter"
                  : searchTerm
                    ? "search terms"
                    : "service filter"
              }.`}
            />
          ) : (
            <EmptyState
              icon={ListChecks}
              title="No patients on the waiting list"
              body="Add patients to the waitlist from an enquiry or from a patient's profile when there's no immediate slot available."
            />
          )
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
                  {/* Priority badge */}
                  <div className="flex justify-center">
                    <span
                      className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-medium ${PRIORITY_BADGE[entry.priority]}`}
                    >
                      {entry.priority.toLowerCase()}
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

                  {/* Preferred time of day (Desktop only - hidden on mobile) */}
                  <div className="hidden md:block min-w-0">
                    <p className="text-sm text-muted-foreground truncate capitalize">
                      {entry.preferred_time_of_day
                        ? entry.preferred_time_of_day.toLowerCase()
                        : "—"}
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
              <FormField label="Priority" helpText="Drives the order the cancellation cron offers slots">
                <Select
                  value={editedPriority}
                  onValueChange={(v) => setEditedPriority(v as WaitlistPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Preferred time of day" helpText="When this patient prefers to be booked">
                <Select
                  value={editedTimeOfDay}
                  onValueChange={(v) => setEditedTimeOfDay(v as PreferredTimeOfDay)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OF_DAY_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      <Sheet
        open={showBookingDialog}
        onOpenChange={(open) => (open ? setShowBookingDialog(true) : closeBookingDialog())}
      >
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

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { Layout } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useRequireAuth } from "@/hooks/useAuth";
import { useStaff } from "@/hooks/useStaff";
import { useServices } from "@/hooks/useServices";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NotesSection } from "@/components/enquiry/NotesSection";
import { BookingDialog } from "@/components/enquiry/BookingDialog";
import { SmartAvailabilityFinder } from "@/components/enquiry/SmartAvailabilityFinder";
import { Calendar, Phone, Mail, User, Clock, ExternalLink } from "lucide-react";

export default function EnquiryDetail() {
  const { id } = useParams();
  const { loading, user } = useRequireAuth();
  const navigate = useNavigate();
  const { services } = useServices();
  const { staff } = useStaff();
  const { sendRequestRejectedNotification, sendWaitlistAddedNotification } = useNotifications();
  const [request, setRequest] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [showWaitlistDialog, setShowWaitlistDialog] = useState(false);
  const [reasonAction, setReasonAction] = useState<"REJECTED" | "CANCELLED">("REJECTED");
  const [reason, setReason] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [waitlistPreferredTimes, setWaitlistPreferredTimes] = useState("");
  const [waitlistNotes, setWaitlistNotes] = useState("");
  const [prefilledBooking, setPrefilledBooking] = useState<{
    staffId: string; date: Date; time: string; serviceId: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && id) {
      loadRequest();
      loadNotes();
      markAsViewed();
    }
  }, [loading, id]);

  const loadRequest = async () => {
    const { data, error } = await supabase
      .from("booking_request")
      .select("*, patient:patient_id (id, full_name, phone, email), assignee:assignee_id (full_name)")
      .eq("id", id)
      .single();
    if (!error && data) setRequest(data);
    setLoadingRequest(false);
  };

  const loadNotes = async () => {
    const { data } = await supabase
      .from("note")
      .select("*, staff:staff_id(full_name)")
      .eq("entity_type", "booking_request")
      .eq("entity_id", id)
      .order("created_at", { ascending: false });
    if (data) setNotes(data);
  };

  const markAsViewed = async () => {
    const { data: current } = await supabase
      .from("booking_request")
      .select("status, opened_at")
      .eq("id", id)
      .single();
    if (current?.status === "NEW" && !current.opened_at) {
      await supabase
        .from("booking_request")
        .update({ status: "VIEWED", opened_at: new Date().toISOString() })
        .eq("id", id);
      loadRequest();
    }
  };

  const updateStatus = async (
    status: "NEW" | "VIEWED" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "WAITLIST",
    statusReason?: string
  ) => {
    if (!request) return;
    const updateData: any = { status };
    if (status === "REJECTED" && statusReason) {
      updateData.rejection_reason = statusReason;
      updateData.reason = statusReason;
    } else if (statusReason) {
      updateData.reason = statusReason;
    }

    const { error } = await supabase.from("booking_request").update(updateData).eq("id", id);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success("Status updated");
      if (status === "REJECTED") await sendRequestRejectedNotification(request.patient?.id, id!, statusReason);
      else if (status === "WAITLIST") await sendWaitlistAddedNotification(request.patient?.id, id!);
      loadRequest(); // Stay on page, reload data
    }
  };

  const openReasonDialog = (action: "REJECTED" | "CANCELLED") => {
    setReasonAction(action);
    setReason("");
    setShowReasonDialog(true);
  };

  const submitWithReason = async () => {
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }
    await updateStatus(reasonAction, reason);
    setShowReasonDialog(false);
  };

  const addToWaitlist = async () => {
    if (!request || selectedServices.length === 0) { toast.error("Please select at least one service"); return; }
    try {
      await Promise.all(selectedServices.map((serviceId) =>
        supabase.from("waiting_list").insert({
          patient_id: request.patient_id,
          service_id: serviceId,
          priority: 0,
          preferred_times: waitlistPreferredTimes || null,
          notes: waitlistNotes || null,
        }).then(({ error }) => { if (error) throw error; })
      ));
      await updateStatus("WAITLIST");
      toast.success(`Added to waitlist for ${selectedServices.length} service(s)`);
      setShowWaitlistDialog(false);
    } catch (error: any) {
      if (error?.code === "23505") toast.error("Patient already on waitlist for one or more services");
      else toast.error("Failed to add to waitlist");
    }
  };

  const handleSlotSelected = (staffId: string, date: Date, time: string, serviceId: string) => {
    setPrefilledBooking({ staffId, date, time, serviceId });
    setShowBookingDialog(true);
  };

  if (loading || loadingRequest) {
    return (
      <Layout title="Enquiry">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!request) {
    return (
      <Layout title="Enquiry">
        <p className="text-muted-foreground py-12 text-center">Enquiry not found</p>
      </Layout>
    );
  }

  const isResolved = ["CONFIRMED", "REJECTED", "CANCELLED"].includes(request.status);
  const submittedAgo = formatDistanceToNow(new Date(request.created_at), { addSuffix: true });

  return (
    <Layout title="Enquiry" onBack={() => navigate("/enquiries")}>
      <div className="space-y-6">

        {/* ----------------------------------------------------------------- */}
        {/* Header: status + patient + actions — all in one clean card         */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-card rounded-lg border p-5">
          {/* Top row: status + time */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={request.status} />
              {request.assignee && (
                <span className="text-xs text-muted-foreground">
                  Assigned to {request.assignee.full_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span title={format(new Date(request.created_at), "PPPp")}>{submittedAgo}</span>
            </div>
          </div>

          {/* Patient info */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <User className="h-4 w-4 text-muted-foreground" />
                {request.patient ? (
                  <Link
                    to={`/patients/${request.patient.id}`}
                    className="font-semibold hover:underline flex items-center gap-1"
                  >
                    {request.patient.full_name}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                ) : (
                  <span className="font-semibold text-muted-foreground">
                    New patient (not yet registered)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {request.patient?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {request.patient.phone}
                  </span>
                )}
                {request.patient?.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {request.patient.email}
                  </span>
                )}
              </div>
              {request.requested_date && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Requested: {format(new Date(request.requested_date), "EEE d MMM yyyy")}
                </div>
              )}
            </div>
          </div>

          {/* Actions — right at the top, easy to reach */}
          {!isResolved && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
              <Button onClick={() => setShowBookingDialog(true)} size="sm">
                Book Appointment
              </Button>
              <Button onClick={() => setShowWaitlistDialog(true)} variant="secondary" size="sm" disabled={request.status === "WAITLIST"}>
                Add to Waitlist
              </Button>
              <div className="flex-1" />
              <Button onClick={() => openReasonDialog("REJECTED")} variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                Reject
              </Button>
              <Button onClick={() => openReasonDialog("CANCELLED")} variant="ghost" size="sm" className="text-muted-foreground">
                Cancel
              </Button>
            </div>
          )}

          {/* Rejection/cancellation reason if resolved */}
          {request.rejection_reason && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium text-muted-foreground">Reason</p>
              <p className="text-sm mt-0.5">{request.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Message — clean standalone card                                     */}
        {/* ----------------------------------------------------------------- */}
        {request.message && (
          <div className="bg-card rounded-lg border p-5">
            <h3 className="text-sm font-semibold mb-2">Patient Message</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {request.message}
            </p>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Bottom: Availability finder + Notes side by side                    */}
        {/* ----------------------------------------------------------------- */}
        <div className="grid md:grid-cols-2 gap-6">
          <SmartAvailabilityFinder
            services={services}
            staff={staff}
            onSlotSelected={handleSlotSelected}
          />

          <NotesSection
            notes={notes}
            entityType="booking_request"
            entityId={id!}
            userId={user?.id!}
            onNotesUpdated={loadNotes}
          />
        </div>
      </div>

      {/* Booking dialog */}
      <BookingDialog
        open={showBookingDialog}
        onOpenChange={(open) => { setShowBookingDialog(open); if (!open) setPrefilledBooking(null); }}
        services={services}
        staff={staff}
        patientId={request.patient_id}
        requestId={id!}
        onSuccess={() => loadRequest()}
        prefilledData={prefilledBooking}
      />

      {/* Waitlist sheet */}
      <Sheet open={showWaitlistDialog} onOpenChange={setShowWaitlistDialog}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add to Waiting List</SheetTitle>
            <SheetDescription>Select service(s) {request.patient?.full_name} is waiting for</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Services *</Label>
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {services.map((service) => (
                  <label key={service.id} className="flex items-center gap-2 p-2.5 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={selectedServices.includes(service.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedServices([...selectedServices, service.id]);
                        else setSelectedServices(selectedServices.filter((sid) => sid !== service.id));
                      }}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{service.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {service.duration_minutes} min &middot; £{service.price}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Preferred times</Label>
              <Textarea placeholder="e.g. Weekday mornings, Fridays after 2pm" value={waitlistPreferredTimes} onChange={(e) => setWaitlistPreferredTimes(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Additional information..." value={waitlistNotes} onChange={(e) => setWaitlistNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={addToWaitlist} className="w-full" disabled={selectedServices.length === 0}>
              Add to Waitlist ({selectedServices.length} selected)
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reason sheet */}
      <Sheet open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{reasonAction === "REJECTED" ? "Reject" : "Cancel"} Enquiry</SheetTitle>
            <SheetDescription className="sr-only">Provide a reason</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea placeholder="Enter reason..." value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
            </div>
            <Button onClick={submitWithReason} className="w-full" variant={reasonAction === "REJECTED" ? "destructive" : "default"}>
              {reasonAction === "REJECTED" ? "Reject Enquiry" : "Cancel Enquiry"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Layout>
  );
}

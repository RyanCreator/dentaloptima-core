import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { Layout } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/useAuth";
import { useStaff } from "@/hooks/useStaff";
import { useServices } from "@/hooks/useServices";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NotesSection } from "@/components/enquiry/NotesSection";
import { BookingDialog } from "@/components/enquiry/BookingDialog";
import { SmartAvailabilityFinder } from "@/components/enquiry/SmartAvailabilityFinder";
import { ensurePatientForBookingRequest } from "@/lib/ensurePatientForBookingRequest";
import { formatPrice } from "@/types/entities";
import {
  Phone,
  Mail,
  User,
  Clock,
  ExternalLink,
  Stethoscope,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  ListChecks,
  ChevronDown,
  Check,
  X as XIcon,
  Sun,
  Sunset,
  Moon,
  Calendar as CalendarIcon,
} from "lucide-react";

// dentaloptima-core enum values for waiting_list.
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

// Wizard models the reception workflow:
//   review  → decide what to do (find availability / waitlist / reject)
//   availability → SmartAvailabilityFinder + BookingDialog on slot pick
//   action  → inline waitlist or reject form
type WizardStep = "review" | "availability" | "action";
type ActionTab = "waitlist" | "reject";

// Statuses that still need handling. Anything else is treated as resolved
// and the page renders a read-only summary instead of the wizard.
const UNRESOLVED_STATUSES = ["NEW", "VIEWED"] as const;

// Time bands as the patient sees them on the booking form. We bucket the
// primary preferred_starts_at into the same bands so the rail can show
// a unified numbered list rather than mixing "specific time" and "band"
// rows.
type TimeBand = "Morning" | "Afternoon" | "Evening";

interface PreferredSlot {
  dateLabel: string;
  band: TimeBand | null;
  bandSubtitle?: string | null;
}

function hourToBand(hour: number): TimeBand {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

// "Morning (9am – 12pm)" → "Morning" + "9am – 12pm"
function splitBandLabel(raw: string): {
  band: TimeBand | null;
  subtitle: string | null;
} {
  const m = raw.match(/^(Morning|Afternoon|Evening)\s*(?:\(([^)]*)\))?\s*$/i);
  if (!m) return { band: null, subtitle: raw };
  const word = m[1];
  const bandTitle =
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  return {
    band: bandTitle as TimeBand,
    subtitle: m[2]?.trim() || null,
  };
}

// "Monday 11 May 2026" → "Mon 11 May" so the rail row stays scannable.
function shortenDateLabel(label: string): string {
  return label
    .replace(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/,
      (m) => m.slice(0, 3),
    )
    .replace(/\s+\d{4}$/, "");
}

// alternative_times is free-form text emitted by the booking form as one
// "Backup N: <date> · <time band>" line per backup. Parse it back into
// structured rows so we can render alongside the primary preference.
function parseAlternativeTimes(text: string | null | undefined): PreferredSlot[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line): PreferredSlot | null => {
      const m = line.match(/^Backup\s*\d+:\s*(.+?)\s*·\s*(.+)$/);
      if (!m) return null;
      const { band, subtitle } = splitBandLabel(m[2].trim());
      return {
        dateLabel: shortenDateLabel(m[1].trim()),
        band,
        bandSubtitle: subtitle,
      };
    })
    .filter((x): x is PreferredSlot => x !== null);
}

function bandIcon(band: TimeBand | null) {
  if (band === "Morning") return Sun;
  if (band === "Afternoon") return Sunset;
  if (band === "Evening") return Moon;
  return CalendarIcon;
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const { loading, user } = useRequireAuth();
  const navigate = useNavigate();
  const { services } = useServices();
  const { staff } = useStaff();
  const {
    sendRequestRejectedNotification,
    sendWaitlistAddedNotification,
  } = useNotifications();

  const [request, setRequest] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingRequest, setLoadingRequest] = useState(true);

  // Wizard state
  const [step, setStep] = useState<WizardStep>("review");
  const [actionTab, setActionTab] = useState<ActionTab>("waitlist");

  // Booking dialog (slot pick → confirm)
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [prefilledBooking, setPrefilledBooking] = useState<{
    staffId: string;
    date: Date;
    time: string;
    serviceId: string;
  } | null>(null);

  // Reject form
  const [reason, setReason] = useState("");

  // Waitlist form
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [waitlistPriority, setWaitlistPriority] =
    useState<WaitlistPriority>("NORMAL");
  const [waitlistTimeOfDay, setWaitlistTimeOfDay] =
    useState<PreferredTimeOfDay>("ANY");
  const [waitlistNotes, setWaitlistNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && id) {
      loadRequest();
      loadNotes();
      markAsViewed();
      // Reset wizard to start whenever the enquiry id changes (e.g. after
      // navigating to the next enquiry in the queue).
      setStep("review");
      setReason("");
      setSelectedServices([]);
      setWaitlistNotes("");
      setWaitlistPriority("NORMAL");
      setWaitlistTimeOfDay("ANY");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, id]);

  // Pre-select the patient's requested service for the waitlist form when
  // the enquiry has one — saves a click in the common case.
  useEffect(() => {
    if (request?.service_id) setSelectedServices([request.service_id]);
  }, [request?.service_id]);

  // Pre-fill waitlist time-of-day from the patient's preferred_starts_at hour.
  useEffect(() => {
    if (!request?.preferred_starts_at) return;
    const hour = new Date(request.preferred_starts_at).getHours();
    if (hour < 12) setWaitlistTimeOfDay("MORNING");
    else if (hour < 17) setWaitlistTimeOfDay("AFTERNOON");
    else setWaitlistTimeOfDay("EVENING");
  }, [request?.preferred_starts_at]);

  const loadRequest = async () => {
    setLoadingRequest(true);
    const { data, error } = await supabase
      .from("booking_request")
      .select(
        "*, patient:patient_id (id, full_name, phone, email), responded_by_staff:responded_by (full_name), viewed_by_staff:viewed_by (full_name)",
      )
      .eq("id", id)
      .single();
    if (!error && data) setRequest(data);
    setLoadingRequest(false);
  };

  const loadNotes = async () => {
    const { data } = await supabase
      .from("note")
      .select("*, author:author_id(full_name)")
      .eq("parent_type", "BOOKING_REQUEST")
      .eq("parent_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setNotes(data);
  };

  const markAsViewed = async () => {
    const { data: current } = await supabase
      .from("booking_request")
      .select("status, viewed_at")
      .eq("id", id)
      .single();
    if (current?.status === "NEW" && !current.viewed_at) {
      await supabase
        .from("booking_request")
        .update({ status: "VIEWED", viewed_at: new Date().toISOString() })
        .eq("id", id);
      loadRequest();
    }
  };

  // After any terminal action (book/waitlist/reject), jump to the next
  // unresolved enquiry so reception clears the queue without bouncing back
  // to the list. Falls through to /enquiries when the queue is empty.
  const goToNextOrList = async (toastMessage?: string) => {
    if (toastMessage) toast.success(toastMessage);
    const { data } = await supabase
      .from("booking_request")
      .select("id")
      .in("status", UNRESOLVED_STATUSES as unknown as string[])
      .neq("id", id!)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) navigate(`/enquiries/${data.id}`);
    else navigate("/enquiries");
  };

  const handleSlotSelected = (
    staffId: string,
    date: Date,
    time: string,
    serviceId: string,
  ) => {
    setPrefilledBooking({ staffId, date, time, serviceId });
    setShowBookingDialog(true);
  };

  const submitReject = async () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    if (!request) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("booking_request")
        .update({
          status: "REJECTED",
          rejection_reason: reason,
          reason: reason,
        })
        .eq("id", id!);
      if (error) throw error;
      await sendRequestRejectedNotification(request.patient?.id, id!, reason);
      await goToNextOrList("Enquiry rejected");
    } catch {
      toast.error("Failed to reject enquiry");
    } finally {
      setSubmitting(false);
    }
  };

  const submitWaitlist = async () => {
    if (!request || selectedServices.length === 0) {
      toast.error("Please select at least one service");
      return;
    }
    setSubmitting(true);
    try {
      // Public-form enquiries have no patient row yet — auto-create one
      // from the request fallback fields so waiting_list.patient_id can
      // resolve. Same flow as BookingDialog.
      const ensured = await ensurePatientForBookingRequest({
        practiceId: request.practice_id,
        requestId: id!,
        existingPatientId: request.patient_id,
        fallback: {
          first_name: request.first_name,
          last_name: request.last_name,
          email: request.email,
          phone: request.phone,
        },
      });
      if (!ensured.ok) {
        toast.error(ensured.error);
        setSubmitting(false);
        return;
      }
      const resolvedPatientId = ensured.patientId;
      if (ensured.matched && ensured.matchedName) {
        toast.message(
          `Linked to existing patient: ${ensured.matchedName}`,
          { description: `Matched by ${ensured.matchedBy}` },
        );
      }

      await Promise.all(
        selectedServices.map((serviceId) =>
          supabase
            .from("waiting_list")
            .insert({
              // RLS requires practice_id match the caller's practice;
              // omitting it returns 403.
              practice_id: request.practice_id,
              patient_id: resolvedPatientId,
              service_id: serviceId,
              priority: waitlistPriority,
              preferred_time_of_day: waitlistTimeOfDay,
              notes: waitlistNotes || null,
            })
            .then(({ error }) => {
              if (error) throw error;
            }),
        ),
      );
      await supabase
        .from("booking_request")
        .update({ status: "WAITLIST" })
        .eq("id", id!);
      await sendWaitlistAddedNotification(resolvedPatientId, id!);
      await goToNextOrList(
        `Added to waitlist for ${selectedServices.length} service(s)`,
      );
    } catch (error: any) {
      if (error?.code === "23505") {
        toast.error("Patient already on waitlist for one or more services");
      } else {
        toast.error("Failed to add to waitlist");
      }
    } finally {
      setSubmitting(false);
    }
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
        <p className="text-muted-foreground py-12 text-center">
          Enquiry not found
        </p>
      </Layout>
    );
  }

  const isResolved = !UNRESOLVED_STATUSES.includes(
    request.status as (typeof UNRESOLVED_STATUSES)[number],
  );
  const submittedAgo = formatDistanceToNow(new Date(request.created_at), {
    addSuffix: true,
  });

  const composedName = [request.first_name, request.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = request.patient?.full_name || composedName || null;
  const displayPhone = request.patient?.phone || request.phone || null;
  const displayEmail = request.patient?.email || request.email || null;
  const serviceName = request.service_id
    ? services.find((s) => s.id === request.service_id)?.name
    : null;

  // ─── Patient summary card (left rail content) ──────────────────────
  const patientSummary = (
    <div className="bg-card rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <StatusBadge status={request.status} />
        <span
          className="text-xs text-muted-foreground inline-flex items-center gap-1"
          title={format(new Date(request.created_at), "PPPp")}
        >
          <Clock className="h-3 w-3" />
          {submittedAgo}
        </span>
      </div>

      <div className="flex items-start gap-2">
        <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          {request.patient ? (
            <Link
              to={`/patients/${request.patient.id}`}
              className="font-semibold hover:underline inline-flex items-center gap-1 break-words"
            >
              {request.patient.full_name}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          ) : displayName ? (
            <div className="space-y-1">
              <div className="font-semibold break-words">{displayName}</div>
              <span className="inline-block text-[10px] font-medium uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200 px-1.5 py-0.5 rounded normal-case">
                New patient
              </span>
            </div>
          ) : (
            <span className="font-semibold text-muted-foreground">
              New patient
            </span>
          )}
        </div>
      </div>

      {request.is_emergency && (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200 px-2 py-1 rounded">
          <AlertTriangle className="h-3 w-3" />
          Emergency
        </div>
      )}

      <div className="space-y-1.5 text-sm">
        {displayPhone && (
          <a
            href={`tel:${displayPhone}`}
            className="flex items-center gap-2 text-foreground hover:underline"
          >
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {displayPhone}
          </a>
        )}
        {displayEmail && (
          <a
            href={`mailto:${displayEmail}`}
            className="flex items-center gap-2 text-foreground hover:underline break-all"
          >
            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {displayEmail}
          </a>
        )}
      </div>
    </div>
  );

  // ─── Form data card ────────────────────────────────────────────────
  // Build a single ranked list of preferred slots: primary first
  // (preferred_starts_at, anchored to its time band), then backups
  // parsed out of the free-form alternative_times field.
  const preferredSlots: PreferredSlot[] = [];
  if (request.preferred_starts_at) {
    const d = new Date(request.preferred_starts_at);
    const band = hourToBand(d.getHours());
    preferredSlots.push({
      dateLabel: format(d, "EEE d MMM"),
      band,
      bandSubtitle: null,
    });
  }
  preferredSlots.push(...parseAlternativeTimes(request.alternative_times));

  const hasFormData =
    request.service_id || preferredSlots.length > 0 || request.notes;

  const formDataCard = hasFormData ? (
    <div className="bg-card rounded-lg border p-4 space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        What they sent
      </h3>

      {serviceName && (
        <div className="flex items-start gap-2 text-sm">
          <Stethoscope className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Service
            </div>
            <div className="font-medium break-words">{serviceName}</div>
          </div>
        </div>
      )}

      {preferredSlots.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Preferred times
          </div>
          <ol className="space-y-1">
            {preferredSlots.map((slot, i) => {
              const Icon = bandIcon(slot.band);
              const isPrimary = i === 0;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
                    isPrimary
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                      isPrimary
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">
                    {slot.dateLabel}
                  </span>
                  {slot.band && (
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {slot.band}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {request.notes && (
        <div className="space-y-1 pt-2 border-t">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Their message
          </div>
          <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {request.notes}
          </p>
        </div>
      )}
    </div>
  ) : null;

  // ─── Internal notes (collapsible) ──────────────────────────────────
  const notesPanel = (
    <details className="group bg-card rounded-lg border">
      <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Internal notes
            {notes.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({notes.length})
              </span>
            )}
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 border-t pt-4">
        <NotesSection
          notes={notes}
          entityType="BOOKING_REQUEST"
          entityId={id!}
          userId={user?.id!}
          onNotesUpdated={loadNotes}
        />
      </div>
    </details>
  );

  // ─── Resolved view ─────────────────────────────────────────────────
  if (isResolved) {
    return (
      <Layout title="Enquiry" onBack={() => navigate("/enquiries")}>
        <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
          <aside className="space-y-4">
            {patientSummary}
            {formDataCard}
          </aside>

          <main className="space-y-6 min-w-0">
            <div className="bg-card rounded-lg border p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  {request.status === "CONFIRMED" ? (
                    <Check className="h-5 w-5 text-emerald-600" />
                  ) : request.status === "WAITLIST" ? (
                    <ListChecks className="h-5 w-5 text-amber-600" />
                  ) : (
                    <XIcon className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    {request.status === "CONFIRMED" && "Appointment booked"}
                    {request.status === "WAITLIST" && "Added to waitlist"}
                    {request.status === "REJECTED" && "Enquiry rejected"}
                    {request.status === "CANCELLED" && "Enquiry cancelled"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    No further action needed for this enquiry.
                  </p>
                </div>
              </div>

              {request.rejection_reason && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Reason
                  </p>
                  <p className="text-sm">{request.rejection_reason}</p>
                </div>
              )}

              <div className="mt-6 flex items-center gap-2">
                <Button onClick={() => goToNextOrList()}>
                  Next enquiry
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/enquiries")}
                >
                  Back to list
                </Button>
              </div>
            </div>

            {notesPanel}
          </main>
        </div>

        <BookingDialog
          open={showBookingDialog}
          onOpenChange={(open) => {
            setShowBookingDialog(open);
            if (!open) setPrefilledBooking(null);
          }}
          services={services}
          staff={staff}
          patientId={request.patient_id}
          requestId={id!}
          patientFallback={{
            first_name: request.first_name,
            last_name: request.last_name,
            email: request.email,
            phone: request.phone,
          }}
          onSuccess={() => goToNextOrList()}
          prefilledData={prefilledBooking}
        />
      </Layout>
    );
  }

  // ─── Wizard view ───────────────────────────────────────────────────
  return (
    <Layout title="Enquiry" onBack={() => navigate("/enquiries")}>
      <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Persistent left rail. Sticky on lg+ so it stays visible while
            the user moves through the steps on the right. */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {patientSummary}
          {formDataCard}
        </aside>

        <main className="space-y-6 min-w-0">
          {/* Breadcrumb showing where we are in the workflow. */}
          <WizardBreadcrumb step={step} onJump={setStep} />

          {step === "review" && (
            <ReviewStep
              displayName={displayName}
              hasPreferred={!!request.preferred_starts_at}
              onPickAvailability={() => setStep("availability")}
              onPickWaitlist={() => {
                setActionTab("waitlist");
                setStep("action");
              }}
              onPickReject={() => {
                setActionTab("reject");
                setStep("action");
              }}
            />
          )}

          {step === "availability" && (
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Find a slot</h2>
                  <p className="text-sm text-muted-foreground">
                    Pre-filled with the patient's preferences. Pick a slot
                    to book.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("review")}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
              </div>

              <SmartAvailabilityFinder
                services={services}
                staff={staff}
                onSlotSelected={handleSlotSelected}
                prefill={{
                  serviceId: request.service_id,
                  preferredAt: request.preferred_starts_at,
                }}
              />

              <div className="pt-4 border-t flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground mr-auto">
                  No suitable slot?
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActionTab("waitlist");
                    setStep("action");
                  }}
                >
                  Add to waitlist
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                  onClick={() => {
                    setActionTab("reject");
                    setStep("action");
                  }}
                >
                  Reject
                </Button>
              </div>
            </div>
          )}

          {step === "action" && (
            <div className="bg-card rounded-lg border p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Take action</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose what to do with this enquiry.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("review")}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
              </div>

              {/* Tab picker — visually distinct cards for the two actions. */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActionTab("waitlist")}
                  className={cn(
                    "p-3 rounded-md border text-left transition-colors",
                    actionTab === "waitlist"
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  <div className="font-medium text-sm">Add to waitlist</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Patient waits for an opening
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setActionTab("reject")}
                  className={cn(
                    "p-3 rounded-md border text-left transition-colors",
                    actionTab === "reject"
                      ? "border-red-500 bg-red-50 dark:border-red-700/60 dark:bg-red-950/20"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  <div className="font-medium text-sm">Reject enquiry</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Patient won't be booked
                  </div>
                </button>
              </div>

              {actionTab === "waitlist" && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Services *</Label>
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto border rounded-md p-1">
                      {services.map((service) => (
                        <label
                          key={service.id}
                          className="flex items-center gap-2 p-2.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded"
                            checked={selectedServices.includes(service.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedServices([
                                  ...selectedServices,
                                  service.id,
                                ]);
                              } else {
                                setSelectedServices(
                                  selectedServices.filter(
                                    (sid) => sid !== service.id,
                                  ),
                                );
                              }
                            }}
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium">
                              {service.name}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              {service.duration_minutes} min ·{" "}
                              {formatPrice(service.price_pence)}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Select
                        value={waitlistPriority}
                        onValueChange={(v) =>
                          setWaitlistPriority(v as WaitlistPriority)
                        }
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
                    </div>
                    <div className="space-y-1.5">
                      <Label>Preferred time</Label>
                      <Select
                        value={waitlistTimeOfDay}
                        onValueChange={(v) =>
                          setWaitlistTimeOfDay(v as PreferredTimeOfDay)
                        }
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
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      placeholder="Any additional context for the waitlist..."
                      value={waitlistNotes}
                      onChange={(e) => setWaitlistNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <Button
                    onClick={submitWaitlist}
                    disabled={submitting || selectedServices.length === 0}
                    className="w-full"
                  >
                    {submitting
                      ? "Adding..."
                      : `Add to waitlist (${selectedServices.length} service${selectedServices.length === 1 ? "" : "s"})`}
                  </Button>
                </div>
              )}

              {actionTab === "reject" && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Reason *</Label>
                    <Textarea
                      placeholder="Why are we rejecting this enquiry? The patient will see this."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <Button
                    onClick={submitReject}
                    disabled={submitting || !reason.trim()}
                    variant="destructive"
                    className="w-full"
                  >
                    {submitting ? "Rejecting..." : "Reject enquiry"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {notesPanel}
        </main>
      </div>

      <BookingDialog
        open={showBookingDialog}
        onOpenChange={(open) => {
          setShowBookingDialog(open);
          if (!open) setPrefilledBooking(null);
        }}
        services={services}
        staff={staff}
        patientId={request.patient_id}
        requestId={id!}
        patientFallback={{
          first_name: request.first_name,
          last_name: request.last_name,
          email: request.email,
          phone: request.phone,
        }}
        onSuccess={() => goToNextOrList()}
        prefilledData={prefilledBooking}
      />
    </Layout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function WizardBreadcrumb({
  step,
  onJump,
}: {
  step: WizardStep;
  onJump: (s: WizardStep) => void;
}) {
  const items: { id: WizardStep; label: string }[] = [
    { id: "review", label: "Decide" },
    { id: "availability", label: "Availability" },
    { id: "action", label: "Action" },
  ];
  const currentIndex = items.findIndex((i) => i.id === step);
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Workflow">
      {items.map((item, i) => {
        const isActive = item.id === step;
        const isPast = i < currentIndex;
        return (
          <div key={item.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => isPast && onJump(item.id)}
              disabled={!isPast}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors",
                isActive && "bg-primary/10 text-primary font-medium",
                isPast &&
                  "text-muted-foreground hover:text-foreground hover:bg-muted",
                !isActive && !isPast && "text-muted-foreground/60",
              )}
            >
              {item.label}
            </button>
            {i < items.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function ReviewStep({
  displayName,
  hasPreferred,
  onPickAvailability,
  onPickWaitlist,
  onPickReject,
}: {
  displayName: string | null;
  hasPreferred: boolean;
  onPickAvailability: () => void;
  onPickWaitlist: () => void;
  onPickReject: () => void;
}) {
  return (
    <div className="bg-card rounded-lg border p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          What would you like to do{displayName ? ` for ${displayName}` : ""}?
        </h2>
        <p className="text-sm text-muted-foreground">
          Their details are on the left. Pick the next action.
        </p>
      </div>

      <div className="grid gap-2.5">
        <button
          type="button"
          onClick={onPickAvailability}
          className="group flex items-center justify-between p-4 rounded-lg border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-colors text-left"
        >
          <div>
            <div className="font-medium text-foreground">Find a slot</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {hasPreferred
                ? "Check availability around their preferred time"
                : "Check availability and book"}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={onPickWaitlist}
          className="group flex items-center justify-between p-4 rounded-lg border hover:bg-muted/40 transition-colors text-left"
        >
          <div>
            <div className="font-medium">Add to waitlist</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              No slot fits, or save for an upcoming cancellation
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={onPickReject}
          className="group flex items-center justify-between p-4 rounded-lg border hover:bg-red-50 hover:border-red-200 dark:hover:bg-red-950/20 dark:hover:border-red-900/50 transition-colors text-left"
        >
          <div>
            <div className="font-medium text-red-600 dark:text-red-400">
              Reject enquiry
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Patient won't be booked
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-red-500 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}

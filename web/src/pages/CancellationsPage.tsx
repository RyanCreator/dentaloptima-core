import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Badge, getAppointmentBadgeVariant } from "@/components/Badge";
import { StatusBadge } from "@/components/StatusBadge";
import { useRequireAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { usePractice } from "@/contexts/PracticeContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Calendar as CalendarIcon, Loader2, XCircle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { PageLoading } from "@/components/PageLoading";

interface CancelledRequest {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
  patient: {
    full_name: string;
    phone: string;
  };
}

interface CancelledAppointment {
  id: string;
  status: string;
  starts_at: string;
  cancellation_reason: string | null;
  cancellation_notes: string | null;
  patient_id: string;
  patient: {
    full_name: string;
    phone: string;
  };
  staff: {
    full_name: string;
  };
  // Multi-service: appointment_service rows are joined in. The shape comes
  // from the embedded select below.
  services: Array<{
    service: { name: string } | null;
  }>;
}

type ViewTab = "appointments" | "requests";
type DateRange = "7days" | "30days" | "90days" | "all";

const PAGE_SIZE = 50;

export default function CancellationsPage() {
  const { loading } = useRequireAuth();
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const navigate = useNavigate();
  const [requests, setRequests] = useState<CancelledRequest[]>([]);
  const [appointments, setAppointments] = useState<CancelledAppointment[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>("appointments");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30days");

  // Separate pagination for appointments and requests
  const [appointmentsPage, setAppointmentsPage] = useState(0);
  const [requestsPage, setRequestsPage] = useState(0);
  const [appointmentsHasMore, setAppointmentsHasMore] = useState(true);
  const [requestsHasMore, setRequestsHasMore] = useState(true);
  const [appointmentsTotalCount, setAppointmentsTotalCount] = useState<number | null>(null);
  const [requestsTotalCount, setRequestsTotalCount] = useState<number | null>(null);

  // Debounce search term using custom hook
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Reset pagination when filters change
  useEffect(() => {
    if (!loading) {
      setAppointmentsPage(0);
      setRequestsPage(0);
      setAppointmentsHasMore(true);
      setRequestsHasMore(true);
      loadData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, dateRange, debouncedSearchTerm]);

  // Real-time updates subscriptions. Scoped per-practice so cross-tenant
  // events don't trigger wasteful reloads here. RLS would filter the
  // payload anyway, but the callback still fires on every event without
  // the filter — same pattern fix we did for WaitingListPage.
  //
  // Note: PostgREST can only AND filters at the subscription level, so the
  // appointment channel can't combine `status=eq.CANCELLED` AND
  // `practice_id=eq.X` in one filter string. We use practice_id (the
  // stronger isolation) and accept that non-cancellation events from
  // this practice will trigger a no-op reload — still strictly less
  // chatter than the old filter-by-status-only approach.
  useEffect(() => {
    if (loading || !practiceId) return;

    const appointmentsChannel = supabase
      .channel(`cancellations-appointments-${practiceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointment",
          filter: `practice_id=eq.${practiceId}`,
        },
        () => {
          setAppointmentsPage(0);
          setAppointments([]);
          setAppointmentsHasMore(true);
          loadData(true);
        }
      )
      .subscribe();

    const requestsChannel = supabase
      .channel(`cancellations-requests-${practiceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_request",
          filter: `practice_id=eq.${practiceId}`,
        },
        () => {
          setRequestsPage(0);
          setRequests([]);
          setRequestsHasMore(true);
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(appointmentsChannel);
      supabase.removeChannel(requestsChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, practiceId, dateRange, debouncedSearchTerm]);

  const getDateRangeFilter = () => {
    if (dateRange === "all") return null;

    const daysMap = {
      "7days": 7,
      "30days": 30,
      "90days": 90,
    };

    return subDays(new Date(), daysMap[dateRange]).toISOString();
  };

  const loadData = useCallback(async (resetList: boolean = false) => {
    const appointmentsPageToLoad = resetList ? 0 : appointmentsPage;
    const requestsPageToLoad = resetList ? 0 : requestsPage;

    if (resetList) {
      // First load - show full loading
      if (appointments.length === 0 && requests.length === 0) {
        setLoadingData(true);
      } else {
        // Searching - show subtle indicator, keep existing results
        setSearching(true);
      }
    } else {
      setLoadingMore(true);
    }

    try {
      const dateFilter = getDateRangeFilter();

      // Load cancelled booking requests
      let requestsQuery = supabase
        .from("booking_request")
        .select(`
          id,
          status,
          reason,
          created_at,
          updated_at,
          patient:patient_id (full_name, phone)
        `, { count: 'exact' })
        .in("status", ["CANCELLED", "REJECTED"]);

      if (dateFilter) {
        requestsQuery = requestsQuery.gte("updated_at", dateFilter);
      }

      // Apply server-side search for requests
      if (debouncedSearchTerm.trim()) {
        const searchPattern = `%${debouncedSearchTerm.trim()}%`;
        requestsQuery = requestsQuery.or(`patient.full_name.ilike.${searchPattern},patient.phone.ilike.${searchPattern},reason.ilike.${searchPattern}`);
      }

      // Apply pagination for requests
      const requestsStartRange = requestsPageToLoad * PAGE_SIZE;
      const requestsEndRange = requestsStartRange + PAGE_SIZE - 1;

      requestsQuery = requestsQuery
        .order("updated_at", { ascending: false })
        .range(requestsStartRange, requestsEndRange);

      const { data: requestsData, error: requestsError, count: requestsCount } = await requestsQuery;

      if (requestsError) {
        logger.error("Error loading cancelled requests", requestsError);
        toast.error("Failed to load cancelled requests");
      } else if (requestsData) {
        if (resetList) {
          setRequests(requestsData as unknown as CancelledRequest[]);
          setRequestsPage(0);
        } else {
          setRequests(prev => [...prev, ...requestsData as unknown as CancelledRequest[]]);
          setRequestsPage(requestsPageToLoad + 1);
        }

        setRequestsHasMore(requestsCount ? (resetList ? requestsData.length < requestsCount : true) : requestsData.length === PAGE_SIZE);

        if (requestsCount !== null) {
          setRequestsTotalCount(requestsCount);
        }
      }

      // Load cancelled appointments. The new schema has no `notes` column
      // (use `cancellation_notes` for cancellations + `treatment_summary`
      // for completed) and services come via the appointment_service join.
      let appointmentsQuery = supabase
        .from("appointment")
        .select(`
          id,
          status,
          starts_at,
          cancellation_reason,
          cancellation_notes,
          patient_id,
          patient:patient_id (full_name, phone),
          staff:staff_id (full_name),
          services:appointment_service (
            service:service_id (name)
          )
        `, { count: 'exact' })
        .is("deleted_at", null)
        .eq("status", "CANCELLED");

      if (dateFilter) {
        appointmentsQuery = appointmentsQuery.gte("starts_at", dateFilter);
      }

      // Apply server-side search for appointments. The new schema removed
      // the direct `notes` and `service.name` columns from `appointment` —
      // services come via `appointment_service`, which can't be ORed in a
      // top-level filter. So we limit server-side search to fields directly
      // on appointment + first-degree embeds.
      if (debouncedSearchTerm.trim()) {
        const searchPattern = `%${debouncedSearchTerm.trim()}%`;
        appointmentsQuery = appointmentsQuery.or(
          `patient.full_name.ilike.${searchPattern},patient.phone.ilike.${searchPattern},staff.full_name.ilike.${searchPattern},cancellation_notes.ilike.${searchPattern}`,
        );
      }

      // Apply pagination for appointments
      const appointmentsStartRange = appointmentsPageToLoad * PAGE_SIZE;
      const appointmentsEndRange = appointmentsStartRange + PAGE_SIZE - 1;

      appointmentsQuery = appointmentsQuery
        .order("starts_at", { ascending: false })
        .range(appointmentsStartRange, appointmentsEndRange);

      const { data: appointmentsData, error: appointmentsError, count: appointmentsCount } = await appointmentsQuery;

      if (appointmentsError) {
        logger.error("Error loading cancelled appointments", appointmentsError);
        toast.error("Failed to load cancelled appointments");
      } else if (appointmentsData) {
        if (resetList) {
          setAppointments(appointmentsData as unknown as CancelledAppointment[]);
          setAppointmentsPage(0);
        } else {
          setAppointments(prev => [...prev, ...appointmentsData as unknown as CancelledAppointment[]]);
          setAppointmentsPage(appointmentsPageToLoad + 1);
        }

        setAppointmentsHasMore(appointmentsCount ? (resetList ? appointmentsData.length < appointmentsCount : true) : appointmentsData.length === PAGE_SIZE);

        if (appointmentsCount !== null) {
          setAppointmentsTotalCount(appointmentsCount);
        }
      }
    } catch (error) {
      logger.error("Unexpected error loading cancellations", error);
      toast.error("An unexpected error occurred");
    } finally {
      setLoadingData(false);
      setLoadingMore(false);
      setSearching(false);
    }
  }, [appointmentsPage, requestsPage, dateRange, debouncedSearchTerm, appointments.length, requests.length]);

  const handleLoadMoreAppointments = () => {
    if (!loadingMore && appointmentsHasMore) {
      loadData(false);
    }
  };

  const handleLoadMoreRequests = () => {
    if (!loadingMore && requestsHasMore) {
      loadData(false);
    }
  };

  // Show searching indicator when typing
  const isSearching = searchTerm !== debouncedSearchTerm && searchTerm.trim() !== "";

  if (loading || loadingData) {
    return (
      <Layout title="Cancellations & Rejections">
        <PageLoading />
      </Layout>
    );
  }

  const currentData = activeTab === "appointments" ? appointments : requests;
  const totalCount = activeTab === "appointments" ? appointmentsTotalCount : requestsTotalCount;
  const hasMore = activeTab === "appointments" ? appointmentsHasMore : requestsHasMore;

  return (
    <Layout title="Cancellations & Rejections">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("appointments")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === "appointments"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Cancelled Appointments {appointmentsTotalCount !== null && `(${appointmentsTotalCount})`}
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === "requests"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Cancelled/Rejected Requests {requestsTotalCount !== null && `(${requestsTotalCount})`}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={
                activeTab === "appointments"
                  ? "Search by patient, staff, or notes..."
                  : "Search by patient, phone, or reason..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-20"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Typing...
              </span>
            )}
          </div>
          <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="30days">Last 30 days</SelectItem>
              <SelectItem value="90days">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        {totalCount !== null && totalCount > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {currentData.length} of {totalCount} {activeTab === "appointments" ? "appointment" : "request"}{totalCount === 1 ? '' : 's'}
          </div>
        )}

        {/* Content */}
        {currentData.length === 0 && !searching ? (
          searchTerm ? (
            <EmptyState
              icon={Search}
              title="No results found"
              body="Try adjusting your search terms or filters."
            />
          ) : (
            <EmptyState
              icon={XCircle}
              title={`No ${activeTab === "appointments" ? "cancelled appointments" : "cancelled or rejected requests"}`}
              body={
                dateRange !== "all"
                  ? "Nothing in this date range — try widening the window."
                  : activeTab === "appointments"
                    ? "Cancellations show up here when an appointment is cancelled from the calendar or patient page."
                    : "Rejected enquiries appear here so you can keep a record of declined requests."
              }
            />
          )
        ) : (
          <>
            <div className="divide-y bg-card rounded-lg border relative">
              {/* Subtle loading overlay - doesn't clear the list */}
              {searching && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] rounded-lg flex items-center justify-center z-10">
                  <div className="bg-card border rounded-lg px-4 py-2 shadow-lg flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">Searching...</span>
                  </div>
                </div>
              )}

              {activeTab === "appointments" ? (
                appointments.map((appointment) => (
                  <button
                    key={appointment.id}
                    onClick={() => navigate(`/patients/${appointment.patient_id}`)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate">
                          {appointment.patient?.full_name || "—"}
                        </h3>
                        <Badge variant={getAppointmentBadgeVariant(appointment.status)}>
                          {appointment.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(appointment.starts_at), "PPp")} • {appointment.staff?.full_name} •{" "}
                        {appointment.services
                          ?.map((s) => s.service?.name)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(appointment.starts_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                requests.map((request) => (
                  <button
                    key={request.id}
                    onClick={() => navigate(`/enquiries/${request.id}`)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate">
                          {request.patient?.full_name || "—"}
                        </h3>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {request.reason || "No reason provided"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(request.updated_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={activeTab === "appointments" ? handleLoadMoreAppointments : handleLoadMoreRequests}
                  disabled={loadingMore}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : totalCount !== null ? (
                    `Load More (${Math.min(PAGE_SIZE, totalCount - currentData.length)} more available)`
                  ) : (
                    `Load More`
                  )}
                </Button>
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && currentData.length > 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  All {activeTab === "appointments" ? "appointments" : "requests"} loaded ({currentData.length} total)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

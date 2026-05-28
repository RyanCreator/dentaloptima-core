import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { formatDistanceToNow, subDays } from "date-fns";
import { LoadingState } from "@/components/LoadingState";
import { ErrorMessage } from "@/components/ErrorMessage";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Inbox } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import type { BookingRequestStatus } from "@/lib/constants";

interface BookingRequest {
  id: string;
  status: BookingRequestStatus;
  created_at: string;
  // Direct fields on booking_request — populated for public-form
  // submissions where there's no existing patient record yet.
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  // Linked patient — populated when an existing patient submitted
  // (patient_id was set at insert time). Public-form submissions leave
  // this null until reception triages and links/creates a patient.
  patient: {
    full_name: string;
    phone: string;
  } | null;
  assignee: {
    full_name: string;
  } | null;
}

type FilterTab = "ALL" | "NEW" | "VIEWED";
type TimeFilter = "all" | "7days" | "30days" | "90days";

// Picks the best display name for a row. Existing patients link via
// patient.full_name; public-form submissions only have the first_name +
// last_name fields directly on booking_request. "—" is reserved for
// truly empty rows (shouldn't happen — the form requires both names).
function displayNameFor(r: { first_name: string | null; last_name: string | null; patient: { full_name: string } | null }): string {
  if (r.patient?.full_name) return r.patient.full_name;
  const composed = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return composed || "—";
}

const PAGE_SIZE = 50;

export default function Enquiries() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  // Default to "all" so older unresolved enquiries don't silently drop off
  // the list when reception hasn't triaged them within 30 days. The time
  // filter is more useful when browsing CLOSED history, not the active queue.
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Debounce search term using custom hook
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Reset pagination when filters change - NO MORE CLEARING THE LIST!
  useEffect(() => {
    if (!loading) {
      setCurrentPage(0);
      setHasMore(true);
      loadRequests(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filterTab, timeFilter, debouncedSearchTerm]);

  // Real-time updates subscription. useId gives this hook instance a
  // unique channel name so StrictMode double-mount and multiple tabs
  // can't collide on a static name (the supabase client otherwise hands
  // back the already-subscribed channel and `.on()` throws).
  const channelId = useId();
  useEffect(() => {
    if (loading) return;

    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        // Refetch in place — don't wipe the list first. Clearing the array
        // caused a brief blank list on every change (jumpy UX); now the
        // soft refetch swaps the contents only after new data arrives.
        setCurrentPage(0);
        setHasMore(true);
        loadRequests(true);
      }, 250);
    };

    const channel = supabase
      .channel(`enquiries-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_request",
          // No status filter — listen for all status changes so non-NEW/VIEWED
          // tabs (CONFIRMED, REJECTED, CANCELLED, WAITLIST, ALL) also stay
          // fresh in real time. The reload below applies the current tab's
          // server-side filter, so the visible list only updates when relevant.
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            scheduleRefetch();
          } else if (payload.eventType === "DELETE") {
            // Remove deleted record from list — no need to refetch.
            setRequests((prev) => prev.filter((r) => r.id !== payload.old.id));
          }
        },
      )
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filterTab, timeFilter, debouncedSearchTerm, channelId]);

  const loadRequests = useCallback(async (resetList: boolean = false) => {
    const pageToLoad = resetList ? 0 : currentPage;

    if (resetList) {
      // First load - show full loading
      if (requests.length === 0) {
        setLoadingRequests(true);
      } else {
        // Searching - show subtle indicator, keep existing results
        setSearching(true);
      }
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      // The new booking_request schema doesn't have an `assignee_id` column —
      // the legacy assignee concept is replaced by `responded_by` (the
      // member who responded). For now we just drop the embed; ownership/
      // assignment UI can come back when we adapt the assignment flow.
      let query = supabase
        .from("booking_request")
        .select(`
          id,
          status,
          created_at,
          first_name,
          last_name,
          email,
          phone,
          patient:patient_id (full_name, phone)
        `, { count: 'exact' })
        .is("deleted_at", null)
        .not("status", "in", "(WAITLIST,REJECTED,CANCELLED,CONFIRMED)");

      // Apply status filter based on selected tab
      if (filterTab === "NEW") {
        query = query.eq("status", "NEW");
      } else if (filterTab === "VIEWED") {
        query = query.eq("status", "VIEWED");
      }

      // Apply time filter
      if (timeFilter !== "all") {
        const daysMap = { "7days": 7, "30days": 30, "90days": 90 };
        const cutoffDate = subDays(new Date(), daysMap[timeFilter]);
        query = query.gte("created_at", cutoffDate.toISOString());
      }

      // Apply server-side search if search term exists. Search across
      // both the booking_request's own first_name/last_name/email/phone
      // (public-form submissions) and the linked patient's name/phone
      // (existing-patient submissions). PostgREST .or() takes a CSV of
      // filters so we list each field.
      if (debouncedSearchTerm.trim()) {
        const searchPattern = `%${debouncedSearchTerm.trim()}%`;
        query = query.or(
          [
            `first_name.ilike.${searchPattern}`,
            `last_name.ilike.${searchPattern}`,
            `email.ilike.${searchPattern}`,
            `phone.ilike.${searchPattern}`,
          ].join(","),
        );
      }

      // Apply pagination
      const startRange = pageToLoad * PAGE_SIZE;
      const endRange = startRange + PAGE_SIZE - 1;

      query = query
        .order("created_at", { ascending: false })
        .range(startRange, endRange);

      const { data, error: fetchError, count } = await query;

      if (fetchError) {
        logger.error("Error loading enquiries", fetchError);
        setError("Failed to load enquiries. Please try again.");
        toast.error("Failed to load enquiries");
      } else if (data) {
        const newRequests = data as BookingRequest[];

        if (resetList) {
          setRequests(newRequests);
          setCurrentPage(0);
        } else {
          setRequests(prev => [...prev, ...newRequests]);
          setCurrentPage(pageToLoad + 1);
        }

        // Check if there are more records to load - use functional approach
        setHasMore(count ? (resetList ? newRequests.length < count : true) : newRequests.length === PAGE_SIZE);

        // Store total count for display
        if (count !== null) {
          setTotalCount(count);
        }
      }
    } catch (err) {
      logger.error("Unexpected error loading enquiries", err);
      setError("An unexpected error occurred");
    } finally {
      setLoadingRequests(false);
      setLoadingMore(false);
      setSearching(false);
    }
  }, [currentPage, filterTab, timeFilter, debouncedSearchTerm, requests.length]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadRequests(false);
    }
  };

  if (loading || loadingRequests) {
    return (
      <Layout title="Enquiries">
        <LoadingState count={5} />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Enquiries">
        <ErrorMessage message={error} />
      </Layout>
    );
  }

  return (
    <Layout title="Enquiries">
      <div className="space-y-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setFilterTab("ALL")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterTab === "ALL"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterTab("NEW")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterTab === "NEW"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            New
          </button>
          <button
            onClick={() => setFilterTab("VIEWED")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterTab === "VIEWED"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Viewed
          </button>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by patient name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-20"
            />
            {searchTerm !== debouncedSearchTerm && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Typing...
              </span>
            )}
          </div>

          {/* Time Filter */}
          <Select value={timeFilter} onValueChange={(value: TimeFilter) => setTimeFilter(value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="30days">Last 30 days</SelectItem>
              <SelectItem value="90days">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results Counter */}
        {totalCount !== null && totalCount > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {requests.length} of {totalCount} enquir{totalCount === 1 ? 'y' : 'ies'}
          </div>
        )}

        {requests.length === 0 && !searching ? (
          searchTerm ? (
            <EmptyState
              icon={Search}
              title="No results found"
              body="Try adjusting your search terms."
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No active enquiries"
              body="New booking requests from your public site land here for review. Confirm them to create an appointment, or move them to the waiting list."
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

              {requests.map((request) => (
                <button
                  key={request.id}
                  onClick={() => navigate(`/enquiries/${request.id}`)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">
                        {displayNameFor(request)}
                      </h3>
                      <StatusBadge status={request.status} />
                    </div>
                    {/* Show contact info as the secondary line so the
                        operator can scan-and-call without opening the
                        record. Falls back to assignee for legacy rows
                        with linked patients. */}
                    {(request.phone || request.email) ? (
                      <p className="text-sm text-muted-foreground truncate">
                        {request.phone || request.email}
                      </p>
                    ) : request.assignee ? (
                      <p className="text-sm text-muted-foreground truncate">
                        {request.assignee.full_name}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(request.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={handleLoadMore}
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
                    `Load More (${Math.min(PAGE_SIZE, totalCount - requests.length)} more available)`
                  ) : (
                    `Load More`
                  )}
                </Button>
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && requests.length > 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  All enquiries loaded ({requests.length} total)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
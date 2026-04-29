import { useEffect, useState, useCallback } from "react";
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
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BookingRequestStatus } from "@/lib/constants";

interface BookingRequest {
  id: string;
  status: BookingRequestStatus;
  created_at: string;
  patient: {
    full_name: string;
    phone: string;
  };
  assignee: {
    full_name: string;
  } | null;
}

type FilterTab = "ALL" | "NEW" | "VIEWED";
type TimeFilter = "all" | "7days" | "30days" | "90days";

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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30days");
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

  // Real-time updates subscription - optimized to only reload on relevant changes
  useEffect(() => {
    if (loading) return;

    const channel = supabase
      .channel("enquiries-changes")
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
          // Only reload if the change affects our current filter
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Reload from the start to catch new/updated records
            setCurrentPage(0);
            setRequests([]);
            setHasMore(true);
            loadRequests(true);
          } else if (payload.eventType === 'DELETE') {
            // Remove deleted record from list
            setRequests(prev => prev.filter(r => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filterTab, timeFilter, debouncedSearchTerm]);

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
      let query = supabase
        .from("booking_request")
        .select(`
          id,
          status,
          created_at,
          patient:patient_id (full_name, phone),
          assignee:assignee_id (full_name)
        `, { count: 'exact' })
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

      // Apply server-side search if search term exists
      if (debouncedSearchTerm.trim()) {
        const searchPattern = `%${debouncedSearchTerm.trim()}%`;
        // Search in patient name or phone - need to use inner join for this
        query = query.or(`patient.full_name.ilike.${searchPattern},patient.phone.ilike.${searchPattern}`);
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
          <div className="bg-card rounded-lg border p-12">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                {searchTerm ? (
                  <Search className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {searchTerm ? "No results found" : "No active enquiries"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchTerm
                    ? "Try adjusting your search terms"
                    : "All enquiries have been processed"}
                </p>
              </div>
            </div>
          </div>
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
                        {request.patient?.full_name || "—"}
                      </h3>
                      <StatusBadge status={request.status} />
                    </div>
                    {request.assignee && (
                      <p className="text-sm text-muted-foreground truncate">
                        {request.assignee.full_name}
                      </p>
                    )}
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
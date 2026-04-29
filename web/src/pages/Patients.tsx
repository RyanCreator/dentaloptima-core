import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Plus, AlertTriangle, Heart } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { ErrorMessage } from "@/components/ErrorMessage";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { subMonths, differenceInYears, parseISO, format } from "date-fns";

interface Patient {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  nhs_number: string | null;
  no_show_count: number;
  is_pregnant: boolean | null;
  takes_anticoagulant: boolean | null;
  do_not_contact: boolean;
}

type ActivityFilter = "active" | "all";
type AlphabetFilter = "all" | string;

const PAGE_SIZE = 50;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function Patients() {
  const { loading: authLoading } = useRequireAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [alphabetFilter, setAlphabetFilter] = useState<AlphabetFilter>("all");
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Debounce search term using custom hook
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Reset pagination when filters change - NO MORE CLEARING THE LIST!
  useEffect(() => {
    if (!authLoading) {
      setCurrentPage(0);
      setHasMore(true);
      loadPatients(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, debouncedSearchTerm, activityFilter, alphabetFilter]);

  const loadPatients = useCallback(async (resetList: boolean = false) => {
    const pageToLoad = resetList ? 0 : currentPage;

    if (resetList) {
      // First load - show full loading
      if (patients.length === 0) {
        setLoading(true);
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
        .from("patient")
        .select("id, full_name, phone, email, date_of_birth, nhs_number, no_show_count, is_pregnant, takes_anticoagulant, do_not_contact", { count: 'exact' })
        .is("deleted_at", null);

      // Apply activity filter (patients with recent appointments)
      if (activityFilter === "active") {
        const sixMonthsAgo = subMonths(new Date(), 6);
        // Get patients who have appointments in the last 6 months
        const { data: activePatientIds } = await supabase
          .from("appointment")
          .select("patient_id")
          .gte("starts_at", sixMonthsAgo.toISOString())
          .not("patient_id", "is", null);

        if (activePatientIds && activePatientIds.length > 0) {
          const uniquePatientIds = [...new Set(activePatientIds.map(a => a.patient_id))];
          query = query.in("id", uniquePatientIds);
        } else {
          // No active patients found, return empty
          setPatients([]);
          setHasMore(false);
          setTotalCount(0);
          setLoading(false);
          setLoadingMore(false);
          return;
        }
      }

      // Apply alphabet filter
      if (alphabetFilter !== "all") {
        query = query.ilike("full_name", `${alphabetFilter}%`);
      }

      // Apply server-side search
      if (debouncedSearchTerm.trim()) {
        const searchPattern = `%${debouncedSearchTerm.trim()}%`;
        query = query.or(`full_name.ilike.${searchPattern},phone.ilike.${searchPattern},email.ilike.${searchPattern},nhs_number.ilike.${searchPattern}`);
      }

      // Apply pagination
      const startRange = pageToLoad * PAGE_SIZE;
      const endRange = startRange + PAGE_SIZE - 1;

      query = query
        .order("full_name")
        .range(startRange, endRange);

      const { data, error: fetchError, count } = await query;

      if (fetchError) {
        logger.error("Error loading patients", fetchError);
        setError("Failed to load patients");
        toast.error("Failed to load patients");
      } else if (data) {
        const newPatients = data as Patient[];

        if (resetList) {
          setPatients(newPatients);
          setCurrentPage(0);
        } else {
          // Use functional update to avoid dependency on patients
          setPatients(prev => [...prev, ...newPatients]);
          setCurrentPage(pageToLoad + 1);
        }

        // Check if there are more records - use functional update
        setHasMore(count ? (resetList ? newPatients.length < count : true) : newPatients.length === PAGE_SIZE);

        // Store total count
        if (count !== null) {
          setTotalCount(count);
        }
      }
    } catch (err) {
      logger.error("Unexpected error loading patients", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setSearching(false);
    }
  }, [currentPage, activityFilter, alphabetFilter, debouncedSearchTerm, patients.length]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadPatients(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout title="Patients">
        <LoadingState count={5} />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Patients">
        <ErrorMessage message={error} />
      </Layout>
    );
  }

  return (
    <Layout title="Patients">
      <div className="space-y-4">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, email or NHS number..."
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

          <Select value={activityFilter} onValueChange={(value: ActivityFilter) => setActivityFilter(value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Patients</SelectItem>
              <SelectItem value="active">Active (6 months)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alphabet Filter */}
        <div className="flex flex-wrap gap-1">
          <Button
            variant={alphabetFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setAlphabetFilter("all")}
            className="h-8 w-12"
          >
            All
          </Button>
          {ALPHABET.map((letter) => (
            <Button
              key={letter}
              variant={alphabetFilter === letter ? "default" : "outline"}
              size="sm"
              onClick={() => setAlphabetFilter(letter)}
              className="h-8 w-8 p-0"
            >
              {letter}
            </Button>
          ))}
        </div>

        {/* Results Counter */}
        {totalCount !== null && totalCount > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {patients.length} of {totalCount} patient{totalCount === 1 ? '' : 's'}
          </div>
        )}

        {/* Patient List */}
        {patients.length === 0 && !searching ? (
          <div className="bg-card rounded-lg border p-12">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No patients found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchTerm || alphabetFilter !== "all"
                    ? "Try adjusting your search or filters"
                    : "No patients in the system yet"}
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

              {patients.map((patient) => {
                const age = patient.date_of_birth
                  ? differenceInYears(new Date(), parseISO(patient.date_of_birth))
                  : null;

                return (
                  <button
                    key={patient.id}
                    onClick={() => navigate(`/patients/${patient.id}`)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium">{patient.full_name}</h3>
                        {patient.is_pregnant && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-medium">
                            <AlertTriangle className="h-3 w-3" />Pregnant
                          </span>
                        )}
                        {patient.takes_anticoagulant && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-800 rounded px-1.5 py-0.5 font-medium">
                            <Heart className="h-3 w-3" />Anticoagulant
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{patient.phone}</span>
                        {age !== null && (
                          <>
                            <span>&middot;</span>
                            <span>Age {age}</span>
                          </>
                        )}
                        {patient.nhs_number && (
                          <>
                            <span>&middot;</span>
                            <span>NHS {patient.nhs_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {patient.no_show_count >= 3 && (
                      <div className="shrink-0">
                        <span className="text-xs px-2 py-1 rounded-md bg-destructive/10 text-destructive font-medium">
                          {patient.no_show_count} no-shows
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
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
                    `Load More (${Math.min(PAGE_SIZE, totalCount - patients.length)} more available)`
                  ) : (
                    `Load More`
                  )}
                </Button>
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && patients.length > 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  All patients loaded ({patients.length} total)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
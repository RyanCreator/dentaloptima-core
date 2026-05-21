import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Plus, AlertTriangle, Heart, Upload, Users, Trash2, Lock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useSelection } from "@/hooks/useSelection";
import { BulkActionBar } from "@/components/BulkActionBar";
import { LoadingState } from "@/components/LoadingState";
import { ImportPatientsSheet } from "@/components/patient/ImportPatientsSheet";
import { useAuth } from "@/hooks/useAuth";
import { ErrorMessage } from "@/components/ErrorMessage";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { subMonths, differenceInYears, parseISO, format } from "date-fns";

interface Patient {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  // dob (date-of-birth) replaces legacy `date_of_birth`. The medical
  // flags + no-show count + do-not-contact fields are gone — they'll
  // be reintroduced via medical_alert + marketing_consent_* when those
  // surfaces are wired up.
  dob: string | null;
  nhs_number: string | null;
}

type ActivityFilter = "active" | "all";
type AlphabetFilter = "all" | string;

const PAGE_SIZE = 50;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function Patients() {
  const { loading: authLoading } = useRequireAuth();
  const auth = useAuth();
  const navigate = useNavigate();
  // CSV import is admin-side. Patient records carry PII / clinical weight,
  // and bulk inserts are usually a migration task driven by the practice
  // owner — we don't gate it server-side beyond the existing patient-table
  // RLS, but we hide the button from non-admins to avoid accidents.
  const callerRole = auth.member?.role;
  const canImport = callerRole === "OWNER" || callerRole === "ADMIN";
  const isAdmin = callerRole === "OWNER" || callerRole === "ADMIN";
  const [importOpen, setImportOpen] = useState(false);
  // Bulk actions are admin-only — patient data is sensitive enough that
  // soft-deleting / flipping legal holds shouldn't be available to
  // reception or clinicians. RLS still backs this server-side.
  const selection = useSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
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
      // Patient schema diverged from legacy:
      //   date_of_birth → dob
      //   no_show_count → gone (denormalised; reconstruct from appointments
      //                  if needed, or use medical_alert table)
      //   is_pregnant / takes_anticoagulant / do_not_contact → gone
      //                  (use medical_alert + marketing_consent_* instead)
      let query = supabase
        .from("patient")
        .select("id, full_name, phone, email, dob, nhs_number", { count: 'exact' })
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

  const bulkArchive = async () => {
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    if (!confirm(
      `Archive ${ids.length} patient${ids.length === 1 ? "" : "s"}? They'll be soft-deleted — clinical records stay for retention, but the patients won't show in the active list.`,
    )) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("patient")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    setBulkBusy(false);
    if (error) { toast.error(`Bulk archive failed: ${error.message}`); return; }
    toast.success(`Archived ${ids.length} patient${ids.length === 1 ? "" : "s"}`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: undoErr } = await supabase
            .from("patient")
            .update({ deleted_at: null })
            .in("id", ids);
          if (undoErr) { toast.error("Couldn't undo"); return; }
          toast.success("Restored");
          void loadPatients(true);
        },
      },
    });
    selection.clear();
    void loadPatients(true);
  };

  const bulkLegalHold = async (apply: boolean) => {
    const ids = Array.from(selection.selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("patient")
      .update({
        legal_hold: apply,
        legal_hold_reason: apply ? "Applied in bulk from patients list" : null,
      })
      .in("id", ids);
    setBulkBusy(false);
    if (error) { toast.error(`Bulk action failed: ${error.message}`); return; }
    toast.success(
      apply
        ? `Applied legal hold to ${ids.length} patient${ids.length === 1 ? "" : "s"}`
        : `Cleared legal hold from ${ids.length} patient${ids.length === 1 ? "" : "s"}`,
    );
    selection.clear();
    void loadPatients(true);
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

          {canImport && (
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="w-full sm:w-auto"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload CSV
            </Button>
          )}
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
          searchTerm || alphabetFilter !== "all" ? (
            <EmptyState
              icon={Search}
              title="No patients match"
              body="Try a different name, email, or alphabet letter — or clear the filters."
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No patients yet"
              body="Patients are created automatically when you book an appointment from an enquiry, or you can bulk-import an existing list from CSV."
              action={canImport ? {
                label: "Upload CSV",
                onClick: () => setImportOpen(true),
                icon: Upload,
              } : undefined}
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

              {/* Admin-only "select all visible" — partial selection
                  shows the box as unchecked so the click is deterministic
                  ("now everything is selected"). */}
              {isAdmin && patients.length > 0 && (
                <div className="flex items-center gap-3 p-2 px-4 bg-muted/20 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    aria-label="Select all visible patients"
                    checked={patients.length > 0 && patients.every((p) => selection.isSelected(p.id))}
                    onChange={(e) => {
                      selection.setAll(e.target.checked ? patients.map((p) => p.id) : []);
                    }}
                  />
                  <span>Select all visible</span>
                </div>
              )}

              {patients.map((patient) => {
                const age = patient.dob
                  ? differenceInYears(new Date(), parseISO(patient.dob))
                  : null;

                return (
                  <div
                    key={patient.id}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                  >
                    {isAdmin && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded shrink-0"
                        aria-label={`Select ${patient.full_name}`}
                        checked={selection.isSelected(patient.id)}
                        // Stop propagation so the click doesn't trigger
                        // the row navigate handler.
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => selection.toggle(patient.id)}
                      />
                    )}
                    <button
                      onClick={() => navigate(`/patients/${patient.id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium">{patient.full_name}</h3>
                        {/* Pregnant / anticoagulant pills will return when
                            we wire medical_alert into the patient list. */}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{patient.phone ?? "—"}</span>
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
                    </button>
                  </div>
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

      {canImport && (
        <ImportPatientsSheet
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => {
            // Force a refresh of the list after import.
            setCurrentPage(0);
            setHasMore(true);
            void loadPatients(true);
          }}
        />
      )}

      {isAdmin && (
        <BulkActionBar
          count={selection.count}
          noun={selection.count === 1 ? "patient" : "patients"}
          busy={bulkBusy}
          onClear={selection.clear}
          actions={[
            { key: "hold-on",  label: "Apply legal hold", icon: Lock, variant: "outline",  onClick: () => bulkLegalHold(true) },
            { key: "hold-off", label: "Clear hold",       icon: Lock, variant: "ghost",    onClick: () => bulkLegalHold(false) },
            { key: "archive",  label: "Archive",          icon: Trash2, variant: "destructive", onClick: bulkArchive },
          ]}
        />
      )}
    </Layout>
  );
}
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth, useRequireAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Badge } from "@/components/Badge";
import { ChevronRight, Search, UserPlus, BadgeCheck, Clock, UserCog } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageLoading } from "@/components/PageLoading";
import { InviteStaffSheet } from "@/components/InviteStaffSheet";
import { useNhsPerformerRequests } from "@/hooks/useNhsPerformerRequests";
import { format } from "date-fns";

// Adapted to dentaloptima-core's `practice_member` table.
//   - active                → is_active
//   - colour_tag            → color_hex
//   - staff_type (free text) → role (enum: OWNER/ADMIN/DENTIST/HYGIENIST/NURSE/RECEPTIONIST)
interface StaffMember {
  id: string;
  full_name: string | null;
  is_active: boolean;
  available_for_booking: boolean;
  color_hex: string | null;
  role: string | null;
  gdc_number: string | null;
  specialism: string | null;
}

type FilterTab = "all" | "available" | "unavailable";

export default function StaffManagement() {
  const { loading } = useRequireAuth();
  const auth = useAuth();
  const tenant = usePractice();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>("available");
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const seatLimit = tenant.practice.staff_seat_limit;
  const activeCount = staff.length; // loadStaff already filters to deleted_at IS NULL
  const seatsFull = seatLimit !== null && activeCount >= seatLimit;
  const callerRole = auth.member?.role;
  const canInvite = callerRole === "OWNER" || callerRole === "ADMIN";
  // Admin-only — clinicians don't see the queue (they only have their own
  // request to track, which surfaces on their profile).
  const { requests: pendingRequests, loading: pendingLoading } = useNhsPerformerRequests();
  const showPendingTab = canInvite;

  useEffect(() => {
    if (!loading) {
      loadStaff();
    }
  }, [loading]);

  useRealtimeSubscription({
    channelName: "staff-changes",
    table: "practice_member",
    event: "*",
    onEvent: () => loadStaff(),
    enabled: !loading,
  });

  const loadStaff = async () => {
    const { data: staffData, error } = await supabase
      .from("practice_member")
      .select("id, full_name, is_active, available_for_booking, color_hex, role, gdc_number, specialism")
      .is("deleted_at", null)
      .order("full_name");

    if (!error && staffData) {
      setStaff(staffData as StaffMember[]);
    }
    setLoadingStaff(false);
  };

  const tabFilteredStaff = useMemo(() => {
    if (filterTab === "all") return staff;
    if (filterTab === "available") return staff.filter((s) => s.available_for_booking);
    if (filterTab === "unavailable") return staff.filter((s) => !s.available_for_booking);
    return staff;
  }, [staff, filterTab]);

  const filteredStaff = useMemo(() => {
    if (!searchTerm.trim()) return tabFilteredStaff;

    const searchLower = searchTerm.toLowerCase().trim();
    return tabFilteredStaff.filter((member) => {
      const fullName = member.full_name?.toLowerCase() || "";
      return fullName.includes(searchLower);
    });
  }, [tabFilteredStaff, searchTerm]);

  if (loading || loadingStaff) {
    return (
      <Layout title="Staff Management">
        <PageLoading />
      </Layout>
    );
  }

  const availableCount = staff.filter((s) => s.available_for_booking).length;
  const unavailableCount = staff.filter((s) => !s.available_for_booking).length;

  return (
    <Layout title="Staff Management">
      <div className="space-y-4">
        {/* Seats + invite */}
        {canInvite && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              {seatLimit === null ? (
                <>{activeCount} active · unlimited seats</>
              ) : (
                <span className={seatsFull ? "text-amber-700 font-medium" : undefined}>
                  {activeCount} / {seatLimit} seats used
                  {seatsFull && " — contact Dentaloptima to add more"}
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => setInviteOpen(true)}
              disabled={seatsFull}
              title={seatsFull ? `Seat limit (${seatLimit}) reached` : undefined}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Invite staff
            </Button>
          </div>
        )}

        {showPendingTab ? (
          <Tabs defaultValue="staff" className="space-y-4">
            <TabsList>
              <TabsTrigger value="staff">Staff</TabsTrigger>
              <TabsTrigger value="pending" className="gap-1.5">
                Pending requests
                {pendingRequests.length > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-semibold text-white bg-amber-500 rounded-full">
                    {pendingRequests.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="staff" className="space-y-4 mt-2">
              <StaffListView
                staff={staff}
                filterTab={filterTab}
                setFilterTab={setFilterTab}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                tabFilteredStaff={tabFilteredStaff}
                filteredStaff={filteredStaff}
                availableCount={availableCount}
                unavailableCount={unavailableCount}
                navigate={navigate}
              />
            </TabsContent>
            <TabsContent value="pending" className="mt-2">
              <PendingRequestsList
                requests={pendingRequests}
                loading={pendingLoading}
                onPick={(r) => navigate(`/staff/${r.staff_id}`)}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <StaffListView
            staff={staff}
            filterTab={filterTab}
            setFilterTab={setFilterTab}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            tabFilteredStaff={tabFilteredStaff}
            filteredStaff={filteredStaff}
            availableCount={availableCount}
            unavailableCount={unavailableCount}
            navigate={navigate}
          />
        )}
      </div>

      {(callerRole === "OWNER" || callerRole === "ADMIN") && (
        <InviteStaffSheet
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          practiceId={tenant.practice.id}
          practiceName={tenant.practice.name}
          callerRole={callerRole}
          onInvited={loadStaff}
        />
      )}
    </Layout>
  );
}

// Staff list view extracted so the Pending-requests tab can sit beside it
// without duplicating the filter/search/render block.
function StaffListView({
  staff,
  filterTab,
  setFilterTab,
  searchTerm,
  setSearchTerm,
  tabFilteredStaff,
  filteredStaff,
  availableCount,
  unavailableCount,
  navigate,
}: {
  staff: StaffMember[];
  filterTab: FilterTab;
  setFilterTab: (t: FilterTab) => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  tabFilteredStaff: StaffMember[];
  filteredStaff: StaffMember[];
  availableCount: number;
  unavailableCount: number;
  navigate: (path: string) => void;
}) {
  return (
    <div className="space-y-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterTab === "all"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({staff.length})
          </button>
          <button
            onClick={() => setFilterTab("available")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterTab === "available"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Available ({availableCount})
          </button>
          <button
            onClick={() => setFilterTab("unavailable")}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              filterTab === "unavailable"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Unavailable ({unavailableCount})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground">
          {filteredStaff.length} of {tabFilteredStaff.length} staff member{tabFilteredStaff.length !== 1 ? "s" : ""}
          {filteredStaff.length !== tabFilteredStaff.length && " shown"}
        </p>

        {/* Content */}
        {filteredStaff.length === 0 ? (
          searchTerm ? (
            <EmptyState
              icon={Search}
              title="No results found"
              body="Try adjusting your search terms."
            />
          ) : (
            <EmptyState
              icon={UserCog}
              title={`No ${filterTab !== "all" ? filterTab + " " : ""}staff members`}
              body={
                filterTab !== "all"
                  ? "Try selecting a different filter."
                  : "Use 'Invite staff' to add your team — owners, dentists, hygienists, nurses, reception."
              }
            />
          )
        ) : (
          <div className="divide-y bg-card rounded-lg border">
            {filteredStaff.map((member) => (
              <button
                key={member.id}
                onClick={() => navigate(`/staff/${member.id}`)}
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {member.color_hex && (
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: member.color_hex }}
                      title={`Color: ${member.color_hex}`}
                    />
                  )}

                  <h3 className="font-medium truncate min-w-[150px]">{member.full_name ?? "—"}</h3>

                  <span className="text-sm text-muted-foreground truncate flex-1 capitalize">
                    {member.role ? member.role.toLowerCase() : ""}
                    {member.specialism ? ` · ${member.specialism}` : ""}
                  </span>

                  <Badge variant={member.available_for_booking ? "confirmed" : "cancelled"} className="shrink-0">
                    {member.available_for_booking ? "Available" : "Unavailable"}
                  </Badge>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

function PendingRequestsList({
  requests,
  loading,
  onPick,
}: {
  requests: ReturnType<typeof useNhsPerformerRequests>["requests"];
  loading: boolean;
  onPick: (r: ReturnType<typeof useNhsPerformerRequests>["requests"][number]) => void;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading requests…</p>;
  }
  if (requests.length === 0) {
    return (
      <div className="bg-card rounded-lg border p-12 text-center">
        <BadgeCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="font-medium">No pending requests</p>
        <p className="text-sm text-muted-foreground">
          Clinicians can request NHS performer setup from their own profile.
        </p>
      </div>
    );
  }
  return (
    <div className="divide-y bg-card rounded-lg border">
      {requests.map((r) => (
        <button
          key={r.id}
          onClick={() => onPick(r)}
          className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <BadgeCheck className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{r.staff_name ?? "Unnamed staff"}</p>
              <p className="text-xs text-muted-foreground truncate">{r.staff_email ?? ""}</p>
            </div>
            <span className="text-xs text-muted-foreground ml-auto shrink-0 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(r.created_at), "d MMM HH:mm")}
            </span>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}

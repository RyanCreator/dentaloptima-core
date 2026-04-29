import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Badge } from "@/components/Badge";
import { ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface StaffMember {
  id: string;
  full_name: string;
  active: boolean;
  available_for_booking: boolean;
  colour_tag: string | null;
  role: string | null;
}

type FilterTab = "all" | "available" | "unavailable";

export default function StaffManagement() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>("available");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!loading) {
      loadStaff();
    }
  }, [loading]);

  // Real-time updates subscription
  useRealtimeSubscription({
    channelName: "staff-changes",
    table: "app_staff",
    event: "*",
    onEvent: () => loadStaff(),
    enabled: !loading,
  });

  const loadStaff = async () => {
    const { data: staffData, error } = await supabase
      .from("app_staff")
      .select("id, full_name, active, available_for_booking, colour_tag, role, staff_type, gdc_number")
      .is("deleted_at", null)
      .order("full_name");

    if (!error && staffData) {
      setStaff(staffData);
    }
    setLoadingStaff(false);
  };

  // Filter staff by tab
  const tabFilteredStaff = useMemo(() => {
    if (filterTab === "all") return staff;
    if (filterTab === "available") return staff.filter((s) => s.available_for_booking);
    if (filterTab === "unavailable") return staff.filter((s) => !s.available_for_booking);
    return staff;
  }, [staff, filterTab]);

  // Filter by search term
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
        <div>Loading...</div>
      </Layout>
    );
  }

  const availableCount = staff.filter((s) => s.available_for_booking).length;
  const unavailableCount = staff.filter((s) => !s.available_for_booking).length;

  return (
    <Layout title="Staff Management">
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
          <div className="bg-card rounded-lg border p-12 text-center">
            <div className="space-y-2">
              {searchTerm ? (
                <>
                  <Search className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="font-medium">No results found</p>
                  <p className="text-sm text-muted-foreground">Try adjusting your search terms</p>
                </>
              ) : (
                <>
                  <p className="font-medium">No {filterTab !== "all" && filterTab} staff members</p>
                  <p className="text-sm text-muted-foreground">
                    {filterTab !== "all" && "Try selecting a different filter"}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y bg-card rounded-lg border">
            {filteredStaff.map((member) => (
              <button
                key={member.id}
                onClick={() => navigate(`/staff/${member.id}`)}
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Color Tag Indicator */}
                  {member.colour_tag && (
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: member.colour_tag }}
                      title={`Color: ${member.colour_tag}`}
                    />
                  )}

                  {/* Name */}
                  <h3 className="font-medium truncate min-w-[150px]">{member.full_name}</h3>

                  {/* Role & Type */}
                  <span className="text-sm text-muted-foreground truncate flex-1">
                    {[member.role, member.staff_type && `(${member.staff_type})`].filter(Boolean).join(" ") || ""}
                  </span>

                  {/* Badge */}
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
    </Layout>
  );
}
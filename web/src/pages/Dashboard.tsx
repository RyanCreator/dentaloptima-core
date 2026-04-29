import { useEffect, useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { InfoCard } from "@/components/InfoCard";
import { DashboardWarnings } from "@/components/DashboardWarnings";
import { useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { format, startOfDay, endOfDay } from "date-fns";
import { formatTime } from "@/lib/timeUtils";
import { Calendar, Clock, AlertCircle, CreditCard, Inbox, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { findNextSlotsForService } from "@/lib/availabilityEngine";
import type { AvailableSlot, Service, StaffAvailabilityData } from "@/types/availability";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
}

interface StaffWithSlots {
  staff: StaffMember;
  slots: AvailableSlot[];
}

interface DashboardStats {
  todayAppointments: number;
  nextAppointmentTime: string | null;
  newEnquiries: number;
  overdueRecalls: number;
  outstandingBalance: number;
  outstandingCount: number;
}

// ---------------------------------------------------------------------------
// Stat card — compact KPI display
// ---------------------------------------------------------------------------
function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  onClick,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`bg-card rounded-lg border p-4 text-left transition-colors ${
        onClick ? "hover:bg-muted/50 cursor-pointer" : ""
      } ${highlight ? "border-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground/60 mt-0.5" />
      </div>
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();

  // Stats
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    nextAppointmentTime: null,
    newEnquiries: 0,
    overdueRecalls: 0,
    outstandingBalance: 0,
    outstandingCount: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Availability finder
  const [staffWithSlots, setStaffWithSlots] = useState<StaffWithSlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>("all");
  const [qualifiedStaff, setQualifiedStaff] = useState<StaffMember[]>([]);

  // -------------------------------------------------------------------------
  // Load stats on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!loading) {
      loadStats();
      loadServices();
    }
  }, [loading]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();

      const [todayAptsRes, newEnquiriesRes, overdueRecallsRes, outstandingRes] =
        await Promise.all([
          supabase
            .from("appointment")
            .select("starts_at")
            .eq("status", "SCHEDULED")
            .gte("starts_at", todayStart)
            .lte("starts_at", todayEnd)
            .order("starts_at"),
          supabase
            .from("booking_request")
            .select("id", { count: "exact", head: true })
            .eq("status", "NEW"),
          supabase
            .from("recall")
            .select("id", { count: "exact", head: true })
            .eq("status", "ACTIVE")
            .lt("due_date", format(now, "yyyy-MM-dd")),
          supabase
            .from("billing_item")
            .select("amount, amount_paid")
            .in("payment_status", ["UNPAID", "PARTIALLY_PAID"]),
        ]);

      const todayApts = todayAptsRes.data || [];
      const nextApt = todayApts.find(
        (a) => new Date(a.starts_at) > now
      );

      const outstanding = outstandingRes.data || [];
      const balance = outstanding.reduce(
        (sum, item) => sum + (Number(item.amount) - Number(item.amount_paid)),
        0
      );

      setStats({
        todayAppointments: todayApts.length,
        nextAppointmentTime: nextApt
          ? format(new Date(nextApt.starts_at), "HH:mm")
          : null,
        newEnquiries: newEnquiriesRes.count ?? 0,
        overdueRecalls: overdueRecallsRes.count ?? 0,
        outstandingBalance: balance,
        outstandingCount: outstanding.length,
      });
    } catch (error) {
      logger.error("Error loading dashboard stats", error);
    } finally {
      setStatsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Load services
  // -------------------------------------------------------------------------
  const loadServices = async () => {
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");

    if (data) {
      setServices(data);
    }
  };

  // -------------------------------------------------------------------------
  // Qualified staff loader
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (selectedServiceId) {
      loadQualifiedStaff(selectedServiceId);
    } else {
      setQualifiedStaff([]);
      setStaffWithSlots([]);
    }
  }, [selectedServiceId]);

  const loadQualifiedStaff = async (serviceId: string) => {
    try {
      const selectedService = services.find((s) => s.id === serviceId);
      if (!selectedService) return;

      let staff: StaffMember[] = [];

      if (selectedService.all_staff_can_perform) {
        const { data, error } = await supabase
          .from("app_staff")
          .select("id, full_name, email")
          .eq("available_for_booking", true)
          .is("deleted_at", null)
          .order("full_name");
        if (error) { logger.error("Error loading staff", error); return; }
        staff = data || [];
      } else {
        const { data: links, error: linkErr } = await supabase
          .from("staff_service")
          .select("staff_id")
          .eq("service_id", serviceId);
        if (linkErr) { logger.error("Error loading staff-service", linkErr); return; }

        const ids = links?.map((l) => l.staff_id) || [];
        if (ids.length === 0) { setQualifiedStaff([]); setStaffWithSlots([]); return; }

        const { data, error } = await supabase
          .from("app_staff")
          .select("id, full_name, email")
          .in("id", ids)
          .eq("available_for_booking", true)
          .is("deleted_at", null)
          .order("full_name");
        if (error) { logger.error("Error loading staff", error); return; }
        staff = data || [];
      }

      setQualifiedStaff(staff);
    } catch (error) {
      logger.error("Error in loadQualifiedStaff", error);
    }
  };

  // -------------------------------------------------------------------------
  // Availability slot calculator
  // -------------------------------------------------------------------------
  const loadAvailableSlots = async () => {
    if (!selectedServiceId) return;
    setLoadingSlots(true);

    try {
      const selectedService = services.find((s) => s.id === selectedServiceId);
      if (!selectedService) { setLoadingSlots(false); return; }

      const staffIds = qualifiedStaff.map((s) => s.id);
      if (staffIds.length === 0) { setStaffWithSlots([]); setLoadingSlots(false); return; }

      const now = new Date();
      const fourWeeks = new Date();
      fourWeeks.setDate(fourWeeks.getDate() + 28);

      const [schedulesRes, breaksRes, timeOffRes, appointmentsRes, hoursRes, closuresRes, blockedRes] =
        await Promise.all([
          supabase.from("staff_availability").select("*").in("staff_id", staffIds).order("weekday"),
          supabase.from("staff_breaks").select("*").in("staff_id", staffIds),
          supabase.from("staff_time_off").select("starts_at, ends_at, staff_id").in("staff_id", staffIds)
            .lte("starts_at", fourWeeks.toISOString()).gte("ends_at", now.toISOString()),
          supabase.from("appointment").select("starts_at, ends_at, staff_id, service_id").in("staff_id", staffIds)
            .eq("status", "SCHEDULED").gte("starts_at", now.toISOString()).lte("starts_at", fourWeeks.toISOString()).order("starts_at"),
          supabase.from("practice_hours").select("weekday, start_time, end_time").order("weekday"),
          supabase.from("practice_closures").select("starts_at, ends_at, reason")
            .gte("ends_at", now.toISOString()).lte("starts_at", fourWeeks.toISOString()),
          supabase.from("blocked_time").select("starts_at, ends_at, staff_id").in("staff_id", staffIds)
            .gte("ends_at", now.toISOString()).lte("starts_at", fourWeeks.toISOString()),
        ]);

      // Group by staff_id
      const group = (arr: any[] | null) => {
        const map: Record<string, any[]> = {};
        arr?.forEach((r) => { const k = r.staff_id; if (!map[k]) map[k] = []; map[k].push(r); });
        return map;
      };

      const schedMap = group(schedulesRes.data);
      const breakMap = group(breaksRes.data);
      const offMap = group(timeOffRes.data);
      const aptMap = group(appointmentsRes.data);
      const btMap = group(blockedRes.data);

      const results = qualifiedStaff.map((staff) => {
        const data: StaffAvailabilityData = {
          schedules: schedMap[staff.id] || [],
          breaks: breakMap[staff.id] || [],
          timeOff: offMap[staff.id] || [],
          blockedTime: btMap[staff.id] || [],
          appointments: aptMap[staff.id] || [],
          practiceHours: hoursRes.data || [],
          practiceClosures: closuresRes.data || [],
        };
        return {
          staff,
          slots: data.schedules.length > 0 ? findNextSlotsForService(data, selectedService, 28, 3) : [],
        };
      });

      setStaffWithSlots(results);
    } catch (error) {
      logger.error("Error loading available slots", error);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (selectedServiceId && qualifiedStaff.length > 0) {
      loadAvailableSlots();
    }
  }, [qualifiedStaff, selectedServiceId]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleSlotClick = (staffId: string, slot: AvailableSlot) => {
    navigate("/calendar", {
      state: {
        openNewAppointment: true,
        prefilledStaffId: staffId,
        prefilledDate: slot.date,
        prefilledTime: slot.time,
        prefilledServiceId: selectedServiceId,
      },
    });
  };

  const handleServiceChange = (value: string) => {
    setSelectedServiceId(value);
    setSelectedStaffFilter("all");
  };

  const filteredStaffWithSlots = useMemo(() => {
    if (selectedStaffFilter === "all") return staffWithSlots;
    return staffWithSlots.filter((item) => item.staff.id === selectedStaffFilter);
  }, [staffWithSlots, selectedStaffFilter]);

  const selectedService = services.find((s) => s.id === selectedServiceId);

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard">
      <div className="space-y-6">

        {/* ----------------------------------------------------------------- */}
        {/* Summary cards                                                      */}
        {/* ----------------------------------------------------------------- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Calendar}
            label="Today"
            value={statsLoading ? "..." : stats.todayAppointments}
            subtitle={
              stats.nextAppointmentTime
                ? `Next at ${formatTime(stats.nextAppointmentTime)}`
                : stats.todayAppointments === 0
                ? "No appointments"
                : "All completed"
            }
            onClick={() => navigate("/calendar")}
          />

          <StatCard
            icon={Inbox}
            label="New Enquiries"
            value={statsLoading ? "..." : stats.newEnquiries}
            subtitle={stats.newEnquiries === 1 ? "Awaiting review" : stats.newEnquiries > 0 ? "Awaiting review" : undefined}
            onClick={() => navigate("/enquiries")}
            highlight={stats.newEnquiries > 0}
          />

          <StatCard
            icon={RotateCcw}
            label="Overdue Recalls"
            value={statsLoading ? "..." : stats.overdueRecalls}
            subtitle={stats.overdueRecalls > 0 ? "Patients due for follow-up" : undefined}
            highlight={stats.overdueRecalls > 0}
          />

          <StatCard
            icon={CreditCard}
            label="Outstanding"
            value={
              statsLoading
                ? "..."
                : stats.outstandingBalance > 0
                ? `£${stats.outstandingBalance.toFixed(2)}`
                : "£0"
            }
            subtitle={
              stats.outstandingCount > 0
                ? `${stats.outstandingCount} unpaid item${stats.outstandingCount !== 1 ? "s" : ""}`
                : undefined
            }
          />
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Warnings (only renders when there are issues)                      */}
        {/* ----------------------------------------------------------------- */}
        <DashboardWarnings />

        {/* ----------------------------------------------------------------- */}
        {/* Availability finder                                                */}
        {/* ----------------------------------------------------------------- */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Find Available Slots</h2>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Select value={selectedServiceId} onValueChange={handleServiceChange}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Select a service..." />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedServiceId && qualifiedStaff.length > 0 && (
              <>
                <Select value={selectedStaffFilter} onValueChange={setSelectedStaffFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {selectedService?.all_staff_can_perform ? "All Available Staff" : "All Qualified Staff"}
                    </SelectItem>
                    {qualifiedStaff.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={loadAvailableSlots}
                  variant="ghost"
                  size="sm"
                  disabled={loadingSlots}
                >
                  {loadingSlots ? "Loading..." : "Refresh"}
                </Button>
              </>
            )}
          </div>

          {/* Service info line */}
          {selectedService && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">{selectedService.name}</span>
              {" "}&middot; {selectedService.duration_minutes} min
              {selectedService.price > 0 && <> &middot; £{Number(selectedService.price).toFixed(2)}</>}
              {selectedService.is_nhs && (
                <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                  NHS
                </span>
              )}
              {qualifiedStaff.length > 0 && (
                <> &middot; {qualifiedStaff.length} staff</>
              )}
            </p>
          )}
        </div>

        {/* Loading */}
        {loadingSlots && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Calculating availability...</p>
            </div>
          </div>
        )}

        {/* Empty: no service selected */}
        {!selectedServiceId && !loadingSlots && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground">Select a service to find availability</p>
            <p className="text-sm mt-1">Choose from the dropdown above to see the next open slots</p>
          </div>
        )}

        {/* Empty: no staff */}
        {selectedServiceId && !loadingSlots && qualifiedStaff.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground">No staff available</p>
            <p className="text-sm mt-1">
              {selectedService?.all_staff_can_perform
                ? "No staff members are currently available for booking"
                : `No staff are qualified to perform ${selectedService?.name}. Assign staff in Settings.`}
            </p>
          </div>
        )}

        {/* Results grid */}
        {!loadingSlots && selectedServiceId && qualifiedStaff.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredStaffWithSlots.map(({ staff, slots }) => (
              <InfoCard key={staff.id}>
                <div className="space-y-3">
                  <h3 className="font-semibold">{staff.full_name}</h3>

                  {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No slots in the next 4 weeks</p>
                  ) : (
                    <div className="space-y-1.5">
                      {slots.map((slot, i) => (
                        <button
                          key={i}
                          onClick={() => handleSlotClick(staff.id, slot)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40 hover:bg-muted transition-colors text-sm"
                        >
                          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{format(slot.date, "EEE, d MMM")}</span>
                          <span className="text-muted-foreground">at {formatTime(slot.time)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </InfoCard>
            ))}
          </div>
        )}

        {/* Filtered empty */}
        {!loadingSlots && filteredStaffWithSlots.length === 0 && staffWithSlots.length > 0 && (
          <p className="text-muted-foreground text-center py-8 text-sm">
            No slots available for the selected staff member
          </p>
        )}
      </div>
    </Layout>
  );
}

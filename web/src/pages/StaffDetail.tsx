import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useStaffSchedule } from "@/hooks/useStaffSchedule";
import { useStaffTimeOff } from "@/hooks/useStaffTimeOff";
import { WeeklySchedule } from "@/components/staff/WeeklySchedule";
import { TimeOffManager } from "@/components/staff/TimeOffManager";
import { Badge } from "@/components/Badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock, Pencil, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  available_for_booking: boolean;
  colour_tag: string | null;
  created_at: string;
  user_id: string | null;
  gdc_number: string | null;
  specialism: string | null;
  staff_type: string | null;
}

export default function StaffDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { loading, user } = useRequireAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [isTogglingBookingStatus, setIsTogglingBookingStatus] = useState(false);
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [editedRole, setEditedRole] = useState("");
  const [editedGdc, setEditedGdc] = useState("");
  const [editedSpecialism, setEditedSpecialism] = useState("");
  const [editedStaffType, setEditedStaffType] = useState("");

  const { schedule, loading: scheduleLoading, updateScheduleDay } = useStaffSchedule(id);
  const { timeOff, loading: timeOffLoading, addTimeOff, deleteTimeOff, reloadTimeOff } = useStaffTimeOff(id);

  useEffect(() => {
    if (!loading && id) {
      loadStaff();
    }
  }, [loading, id]);

  // Real-time updates subscription
  useEffect(() => {
    if (loading || !id) return;

    const channel = supabase
      .channel(`staff-${id}-changes`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "app_staff",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          // Update local state directly from payload to prevent reload during toggle
          if (payload.new && typeof payload.new === 'object') {
            setStaff(prev => prev ? { ...prev, ...payload.new as Partial<StaffMember> } : null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loading, id]);

  const loadStaff = async () => {
    const { data, error } = await supabase.from("app_staff").select("*").eq("id", id).single();

    if (!error && data) {
      setStaff(data);
    }
    setLoadingStaff(false);
  };

  const toggleBookingAvailability = async (newBookingState: boolean) => {
    if (!staff) return;

    setIsTogglingBookingStatus(true);
    try {
      const { error } = await supabase
        .from("app_staff")
        .update({ available_for_booking: newBookingState })
        .eq("id", staff.id);

      if (error) throw error;

      // Optimistically update local state for immediate UI feedback
      setStaff(prev => prev ? { ...prev, available_for_booking: newBookingState } : null);

      toast({
        title: "Booking status updated",
        description: `Staff member is now ${newBookingState ? "available" : "unavailable"} for booking`,
      });
    } catch (error) {
      logger.error("Error updating booking availability", error);
      toast({
        title: "Error",
        description: "Failed to update booking availability",
        variant: "destructive",
      });
      // Reload staff data on error to revert optimistic update
      loadStaff();
    } finally {
      setIsTogglingBookingStatus(false);
    }
  };

  const startEditingRole = () => {
    setEditedRole(staff?.role || "");
    setEditedGdc(staff?.gdc_number || "");
    setEditedSpecialism(staff?.specialism || "");
    setEditedStaffType(staff?.staff_type || "");
    setIsEditingRole(true);
  };

  const cancelEditingRole = () => {
    setIsEditingRole(false);
    setEditedRole("");
  };

  const saveRole = async () => {
    if (!staff) return;

    try {
      const { error } = await supabase
        .from("app_staff")
        .update({
          role: editedRole.trim() || null,
          gdc_number: editedGdc.trim() || null,
          specialism: editedSpecialism.trim() || null,
          staff_type: editedStaffType || null,
        })
        .eq("id", staff.id);

      if (error) throw error;

      setStaff(prev => prev ? {
        ...prev,
        role: editedRole.trim() || null,
        gdc_number: editedGdc.trim() || null,
        specialism: editedSpecialism.trim() || null,
        staff_type: editedStaffType || null,
      } : null);

      toast({
        title: "Details updated",
        description: "Staff details have been updated successfully",
      });

      setIsEditingRole(false);
      setEditedRole("");
    } catch (error) {
      logger.error("Error updating staff details", error);
      toast({
        title: "Error",
        description: "Failed to update staff details",
        variant: "destructive",
      });
      loadStaff();
    }
  };

  const calculateWeeklyHours = () => {
    if (!schedule) return 0;

    return schedule.reduce((total, day) => {
      if (!day.is_working) return total;

      const startMinutes = timeToMinutes(day.start_time);
      const endMinutes = timeToMinutes(day.end_time);
      let dayMinutes = endMinutes - startMinutes;

      // Subtract all break times
      if (day.breaks && day.breaks.length > 0) {
        day.breaks.forEach(breakTime => {
          const breakStart = timeToMinutes(breakTime.start_time);
          const breakEnd = timeToMinutes(breakTime.end_time);
          dayMinutes -= (breakEnd - breakStart);
        });
      }

      return total + dayMinutes;
    }, 0);
  };

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const formatHours = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading || loadingStaff || scheduleLoading || timeOffLoading) {
    return (
      <Layout title="Staff Details">
        <div>Loading...</div>
      </Layout>
    );
  }

  if (!staff) {
    return (
      <Layout title="Staff Details">
        <div>Staff member not found</div>
      </Layout>
    );
  }

  const weeklyMinutes = calculateWeeklyHours();
  const workingDays = schedule.filter((day) => day.is_working).length;

  return (
    <Layout title={staff.full_name} onBack={() => navigate("/staff")}>
      <div className="space-y-6">
        {/* Staff Status & Info Card */}
        <div className="bg-card rounded-lg border p-6 space-y-4">
          {/* Header with Color Tag, Badge, and Toggle */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b">
            <div className="flex items-center gap-3 flex-1">
              {staff.colour_tag && (
                <div
                  className="w-6 h-6 rounded-full shrink-0"
                  style={{ backgroundColor: staff.colour_tag }}
                  title={`Color: ${staff.colour_tag}`}
                />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold">{staff.full_name}</h2>
                  <Badge variant={staff.available_for_booking ? "confirmed" : "cancelled"}>
                    {staff.available_for_booking ? "Available" : "Unavailable"}
                  </Badge>
                </div>
                {isEditingRole ? (
                  <div className="mt-2 space-y-2 bg-muted/30 rounded-md p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="text"
                        value={editedRole}
                        onChange={(e) => setEditedRole(e.target.value)}
                        placeholder="Job title (e.g. Principal Dentist)"
                        className="text-sm h-8"
                        autoFocus
                      />
                      <select
                        value={editedStaffType}
                        onChange={(e) => setEditedStaffType(e.target.value)}
                        className="text-sm h-8 rounded-md border bg-background px-2"
                      >
                        <option value="">Staff type...</option>
                        <option value="dentist">Dentist</option>
                        <option value="hygienist">Hygienist</option>
                        <option value="therapist">Therapist</option>
                        <option value="nurse">Nurse</option>
                        <option value="receptionist">Receptionist</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="text"
                        value={editedGdc}
                        onChange={(e) => setEditedGdc(e.target.value)}
                        placeholder="GDC number"
                        className="text-sm h-8"
                      />
                      <Input
                        type="text"
                        value={editedSpecialism}
                        onChange={(e) => setEditedSpecialism(e.target.value)}
                        placeholder="Specialism (e.g. Orthodontics)"
                        className="text-sm h-8"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveRole} className="h-7 text-xs">Save</Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditingRole} className="h-7 text-xs">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {staff.role || "No role assigned"}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={startEditingRole}
                      className="h-6 w-6 p-0"
                      title="Edit staff details"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="booking-toggle" className="text-sm">
                {staff.available_for_booking ? "Available" : "Unavailable"}
              </Label>
              <Switch
                id="booking-toggle"
                checked={staff.available_for_booking}
                onCheckedChange={toggleBookingAvailability}
                disabled={isTogglingBookingStatus}
              />
            </div>
          </div>

          {/* Contact & Clinical Info */}
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[100px,1fr] gap-2">
              <span className="text-muted-foreground">Email</span>
              <span className="truncate">{staff.email}</span>
            </div>
            {staff.phone && (
              <div className="grid grid-cols-[100px,1fr] gap-2">
                <span className="text-muted-foreground">Phone</span>
                <span className="truncate">{staff.phone}</span>
              </div>
            )}
            {staff.staff_type && (
              <div className="grid grid-cols-[100px,1fr] gap-2">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{staff.staff_type}</span>
              </div>
            )}
            {staff.gdc_number && (
              <div className="grid grid-cols-[100px,1fr] gap-2">
                <span className="text-muted-foreground">GDC</span>
                <span>{staff.gdc_number}</span>
              </div>
            )}
            {staff.specialism && (
              <div className="grid grid-cols-[100px,1fr] gap-2">
                <span className="text-muted-foreground">Specialism</span>
                <span>{staff.specialism}</span>
              </div>
            )}
          </div>

          {/* Weekly Schedule Summary */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Weekly Hours</span>
              </div>
              <span className="text-lg font-semibold">{formatHours(weeklyMinutes)}</span>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">Working Days</span>
              </div>
              <span className="text-lg font-semibold">{workingDays} / 7</span>
            </div>
          </div>
        </div>

        <WeeklySchedule schedule={schedule} onUpdateDay={updateScheduleDay} />

        <TimeOffManager
          timeOff={timeOff}
          staffId={id}
          onAddTimeOff={addTimeOff}
          onDeleteTimeOff={deleteTimeOff}
          reloadTimeOff={reloadTimeOff}
        />
      </div>
    </Layout>
  );
}

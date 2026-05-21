import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth, useRequireAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useStaffSchedule } from "@/hooks/useStaffSchedule";
import { useStaffTimeOff } from "@/hooks/useStaffTimeOff";
import { WeeklySchedule } from "@/components/staff/WeeklySchedule";
import { TimeOffManager } from "@/components/staff/TimeOffManager";
import { NHSPerformerSection } from "@/components/staff/NHSPerformerSection";
import { StaffServicesSection } from "@/components/staff/StaffServicesSection";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Mail, Phone } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PageLoading } from "@/components/PageLoading";
import { cn } from "@/lib/utils";

// Adapted to dentaloptima-core's `practice_member` table.
//   - `role` is now an enum: OWNER/ADMIN/DENTIST/HYGIENIST/NURSE/RECEPTIONIST.
//     RLS + a server-side trigger enforce that only admins can change roles
//     and that the last OWNER can't be demoted, so we just surface the
//     friendly form and let the DB reject illegal edits.
//   - `colour_tag` → `color_hex`. Added in migration 0027.
//   - Legacy `staff_type` is gone (was duplicating `role`).
const ROLE_OPTIONS = ["OWNER", "ADMIN", "DENTIST", "HYGIENIST", "NURSE", "RECEPTIONIST"] as const;
type Role = (typeof ROLE_OPTIONS)[number];

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  available_for_booking: boolean;
  color_hex: string | null;
  created_at: string;
  user_id: string | null;
  gdc_number: string | null;
  specialism: string | null;
}

export default function StaffDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { loading } = useRequireAuth();
  const auth = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  // Edit gate. Practice_member RLS now blocks any non-admin update server-side
  // (migration 0039); we hide the controls so non-admins don't see buttons
  // that would just toast an error.
  const callerRole = auth.member?.role;
  const isAdmin = callerRole === "OWNER" || callerRole === "ADMIN";
  const isOwnProfile = auth.member?.id === id;
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [isTogglingBookingStatus, setIsTogglingBookingStatus] = useState(false);
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [editedRole, setEditedRole] = useState<Role>("RECEPTIONIST");
  const [editedGdc, setEditedGdc] = useState("");
  const [editedSpecialism, setEditedSpecialism] = useState("");

  const { schedule, loading: scheduleLoading, updateScheduleDay } = useStaffSchedule(id);
  const { timeOff, loading: timeOffLoading, addTimeOff, deleteTimeOff, reloadTimeOff } = useStaffTimeOff(id);

  useEffect(() => {
    if (!loading && id) {
      loadStaff();
    }
  }, [loading, id]);

  useEffect(() => {
    if (loading || !id) return;

    const channel = supabase
      .channel(`staff-${id}-changes`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "practice_member",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            setStaff((prev) => (prev ? { ...prev, ...(payload.new as Partial<StaffMember>) } : null));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loading, id]);

  const loadStaff = async () => {
    const { data, error } = await supabase
      .from("practice_member")
      .select(
        "id, full_name, email, phone, role, is_active, available_for_booking, color_hex, created_at, user_id, gdc_number, specialism",
      )
      .eq("id", id)
      .single();

    if (!error && data) {
      setStaff(data as StaffMember);
    }
    setLoadingStaff(false);
  };

  const toggleBookingAvailability = async (newBookingState: boolean) => {
    if (!staff) return;

    setIsTogglingBookingStatus(true);
    try {
      const { error } = await supabase
        .from("practice_member")
        .update({ available_for_booking: newBookingState })
        .eq("id", staff.id);

      if (error) throw error;

      setStaff((prev) => (prev ? { ...prev, available_for_booking: newBookingState } : null));

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
      loadStaff();
    } finally {
      setIsTogglingBookingStatus(false);
    }
  };

  const startEditingRole = () => {
    setEditedRole(staff?.role || "RECEPTIONIST");
    setEditedGdc(staff?.gdc_number || "");
    setEditedSpecialism(staff?.specialism || "");
    setIsEditingRole(true);
  };

  const cancelEditingRole = () => {
    setIsEditingRole(false);
  };

  const saveRole = async () => {
    if (!staff) return;

    try {
      const { error } = await supabase
        .from("practice_member")
        .update({
          role: editedRole,
          gdc_number: editedGdc.trim() || null,
          specialism: editedSpecialism.trim() || null,
        })
        .eq("id", staff.id);

      if (error) throw error;

      setStaff((prev) =>
        prev
          ? {
              ...prev,
              role: editedRole,
              gdc_number: editedGdc.trim() || null,
              specialism: editedSpecialism.trim() || null,
            }
          : null,
      );

      toast({
        title: "Details updated",
        description: "Staff details have been updated successfully",
      });

      setIsEditingRole(false);
    } catch (error) {
      logger.error("Error updating staff details", error);
      toast({
        title: "Error",
        description:
          "Failed to update staff details. Role changes require admin permissions.",
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

      if (day.breaks && day.breaks.length > 0) {
        day.breaks.forEach((breakTime) => {
          const breakStart = timeToMinutes(breakTime.start_time);
          const breakEnd = timeToMinutes(breakTime.end_time);
          dayMinutes -= breakEnd - breakStart;
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
        <PageLoading />
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
    <Layout title={staff.full_name ?? "Staff member"} onBack={() => navigate("/staff")}>
      <div className="space-y-4">
        {/* Permanent header — same shape as the patient detail page so the
            two pages feel consistent. Avatar uses the staff's color_hex
            so they're instantly recognisable from the calendar's stripe. */}
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="grid md:grid-cols-[1fr_auto] gap-6 p-5">
            {/* LEFT: identity + contact */}
            <div className="flex gap-4 min-w-0">
              <div
                className="shrink-0 h-14 w-14 rounded-full flex items-center justify-center text-lg font-semibold text-white"
                style={{ backgroundColor: staff.color_hex || "hsl(var(--muted-foreground))" }}
                title={staff.color_hex ? `Calendar colour: ${staff.color_hex}` : undefined}
              >
                {getInitials(staff.full_name ?? "?")}
              </div>
              <div className="min-w-0 space-y-1.5">
                <div>
                  <h2 className="text-2xl font-semibold leading-tight">
                    {staff.full_name ?? "—"}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {staff.role && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded capitalize">
                        {staff.role.toLowerCase()}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        staff.available_for_booking
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                      )}
                    >
                      {staff.available_for_booking ? "Bookable" : "Off-rota"}
                    </span>
                    {!staff.is_active && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200 px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-0.5 text-sm">
                  <a
                    href={`mailto:${staff.email}`}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 w-fit truncate"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{staff.email}</span>
                  </a>
                  {staff.phone && (
                    <a
                      href={`tel:${staff.phone}`}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 w-fit"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" /> {staff.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: stats panel + booking toggle + edit. Toggle stays
                a switch (it's a frequent action) but moves to the action
                cluster so it doesn't compete with identity. */}
            <div className="flex flex-col items-end gap-3 md:min-w-[260px]">
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="booking-toggle"
                      checked={staff.available_for_booking}
                      onCheckedChange={toggleBookingAvailability}
                      disabled={isTogglingBookingStatus}
                    />
                    <Label htmlFor="booking-toggle" className="text-xs text-muted-foreground">
                      Bookable
                    </Label>
                  </div>
                )}
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={startEditingRole}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                )}
              </div>
              <div className="w-full md:w-[260px] divide-y divide-border/50">
                <div className="pb-1.5">
                  <Fact label="Weekly hours" value={formatHours(weeklyMinutes)} />
                </div>
                <div className="py-1.5">
                  <Fact label="Working days" value={`${workingDays} / 7`} />
                </div>
                <div className="py-1.5">
                  <Fact label="GDC no." value={staff.gdc_number} />
                </div>
                <div className="pt-1.5">
                  <Fact label="Specialism" value={staff.specialism} />
                </div>
              </div>
            </div>
          </div>

          {/* Inline edit panel — stays in place when toggled so the user
              keeps context. Slides in below the header zones. */}
          {isEditingRole && (
            <div className="border-t bg-muted/20 px-5 py-4 space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={editedRole} onValueChange={(v) => setEditedRole(v as Role)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r.charAt(0) + r.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">GDC number</Label>
                  <Input
                    type="text"
                    value={editedGdc}
                    onChange={(e) => setEditedGdc(e.target.value)}
                    placeholder="GDC number"
                    className="text-sm h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Specialism</Label>
                  <Input
                    type="text"
                    value={editedSpecialism}
                    onChange={(e) => setEditedSpecialism(e.target.value)}
                    placeholder="e.g. Orthodontics"
                    className="text-sm h-8"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={cancelEditingRole}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveRole}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tabs — Schedule is the most-touched, so it's default. */}
        <Tabs defaultValue="schedule">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="time-off">Time off</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="nhs">NHS performer</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-4">
            <WeeklySchedule schedule={schedule} onUpdateDay={updateScheduleDay} />
          </TabsContent>

          <TabsContent value="time-off" className="mt-4">
            <TimeOffManager
              timeOff={timeOff}
              staffId={id}
              onAddTimeOff={addTimeOff}
              onDeleteTimeOff={deleteTimeOff}
              reloadTimeOff={reloadTimeOff}
            />
          </TabsContent>

          <TabsContent value="services" className="mt-4">
            {id && <StaffServicesSection staffId={id} isAdmin={isAdmin} />}
          </TabsContent>

          <TabsContent value="nhs" className="mt-4">
            {id && (
              <NHSPerformerSection
                staffId={id}
                isAdmin={isAdmin}
                isOwnProfile={isOwnProfile}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// Right-aligned key/value pair used in the staff header's stats panel.
// Same shape as the version on PatientDetail so the two pages match.
function Fact({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", !value && "text-muted-foreground/60")}>
        {value || "—"}
      </span>
    </div>
  );
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

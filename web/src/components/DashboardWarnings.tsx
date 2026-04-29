import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { InfoCard } from "@/components/InfoCard";
import { AlertTriangle, Calendar, Users, Clock, Home, Bell } from "lucide-react";
import { format, parseISO, isAfter, isBefore, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface Warning {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  link?: string;
  appointmentId?: string;
  appointmentDate?: string;
}

interface DashboardWarningsProps {
  onLoadingChange?: (loading: boolean) => void;
}

export const DashboardWarnings = ({ onLoadingChange }: DashboardWarningsProps) => {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);
  const navigate = useNavigate();

  // Auto-load warnings on mount
  useEffect(() => {
    checkForWarnings();
  }, []);

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const checkForWarnings = async () => {
    setLoading(true);
    setHasChecked(true);
    const allWarnings: Warning[] = [];

    try {
      const now = new Date().toISOString();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAhead = new Date();
      thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

      // BULK LOAD ALL DATA IN PARALLEL - Single round trip to database
      const [
        appointmentsRes,
        staffListRes,
        staffAvailabilityRes,
        staffBreaksRes,
        timeOffRes,
        servicesRes,
        patientsRes,
        waitlistRes,
      ] = await Promise.all([
        // Next 30 days of scheduled appointments with relations (optimized query)
        supabase
          .from("appointment")
          .select("*, staff:app_staff(full_name), patient:patient(full_name)")
          .eq("status", "SCHEDULED")
          .gte("starts_at", now)
          .lte("starts_at", thirtyDaysAhead.toISOString())
          .order("starts_at"),
        // All active staff
        supabase
          .from("app_staff")
          .select("id, full_name")
          .eq("active", true)
          .is("deleted_at", null),
        // All staff availability
        supabase
          .from("staff_availability")
          .select("*"),
        // All staff breaks
        supabase
          .from("staff_breaks")
          .select("*"),
        // Time off in next 30 days (optimized query)
        supabase
          .from("staff_time_off")
          .select("*, staff:app_staff(full_name, id)")
          .gte("ends_at", now)
          .lte("starts_at", thirtyDaysAhead.toISOString()),
        // All services with room requirements
        supabase
          .from("services")
          .select("*")
          .eq("requires_room", true)
          .not("room_capacity", "is", null),
        // All patients with high no-shows or missing contact
        supabase
          .from("patient")
          .select("id, full_name, phone, email, no_show_count")
          .is("deleted_at", null),
        // Stale waiting list entries
        supabase
          .from("waiting_list")
          .select("*, patient:patient(full_name)")
          .is("resolved_at", null)
          .lt("created_at", thirtyDaysAgo.toISOString()),
      ]);

      const appointments = appointmentsRes.data || [];
      const staffList = staffListRes.data || [];
      const timeOffList = timeOffRes.data || [];
      const services = servicesRes.data || [];
      const patients = patientsRes.data || [];
      const waitlist = waitlistRes.data || [];

      // Group data by staff_id for O(1) lookups
      const availabilityByStaff: Record<string, any[]> = {};
      const breaksByStaff: Record<string, any[]> = {};
      const appointmentsByStaff: Record<string, any[]> = {};

      staffAvailabilityRes.data?.forEach((av) => {
        if (!availabilityByStaff[av.staff_id]) availabilityByStaff[av.staff_id] = [];
        availabilityByStaff[av.staff_id].push(av);
      });

      staffBreaksRes.data?.forEach((brk) => {
        if (!breaksByStaff[brk.staff_id]) breaksByStaff[brk.staff_id] = [];
        breaksByStaff[brk.staff_id].push(brk);
      });

      appointments.forEach((apt) => {
        if (apt.staff_id) {
          if (!appointmentsByStaff[apt.staff_id]) appointmentsByStaff[apt.staff_id] = [];
          appointmentsByStaff[apt.staff_id].push(apt);
        }
      });

      // 1. Check for overlapping appointments
      Object.entries(appointmentsByStaff).forEach(([staffId, staffApts]) => {
        for (let i = 0; i < staffApts.length - 1; i++) {
          const apt1 = staffApts[i];
          const apt2 = staffApts[i + 1];

          const apt1End = parseISO(apt1.ends_at);
          const apt2Start = parseISO(apt2.starts_at);

          if (isAfter(apt1End, apt2Start) || apt1End.getTime() === apt2Start.getTime()) {
            allWarnings.push({
              id: `overlap-${apt1.id}-${apt2.id}`,
              type: "overlap",
              title: "Overlapping Appointments",
              description: `${apt1.staff?.full_name} has overlapping appointments on ${format(parseISO(apt1.starts_at), "MMM d")}`,
              severity: "high",
              link: "/calendar",
              appointmentId: apt1.id,
              appointmentDate: apt1.starts_at,
            });
          }
        }
      });

      // 2. Check for staff on holiday with appointments
      timeOffList.forEach((timeOff) => {
        const conflictingApts = appointmentsByStaff[timeOff.staff_id]?.filter((apt) => {
          const aptStart = parseISO(apt.starts_at);
          const toStart = parseISO(timeOff.starts_at);
          const toEnd = parseISO(timeOff.ends_at);
          return (
            (isAfter(aptStart, toStart) || aptStart.getTime() === toStart.getTime()) &&
            (isBefore(aptStart, toEnd) || aptStart.getTime() === toEnd.getTime())
          );
        }) || [];

        if (conflictingApts.length > 0) {
          allWarnings.push({
            id: `timeoff-${timeOff.id}`,
            type: "timeoff",
            title: "Holiday Conflict",
            description: `${timeOff.staff?.full_name} has ${conflictingApts.length} appointment(s) during scheduled time off`,
            severity: "high",
            link: `/staff/${timeOff.staff_id}`,
          });
        }
      });

      // 3. Check for high no-show patients
      patients
        .filter((p) => p.no_show_count >= 3)
        .forEach((patient) => {
          allWarnings.push({
            id: `noshow-${patient.id}`,
            type: "noshow",
            title: "High No-Show Patient",
            description: `${patient.full_name} has ${patient.no_show_count} no-shows`,
            severity: "medium",
            link: `/patients/${patient.id}`,
          });
        });

      // 4. Check for appointments without service
      appointments
        .filter((apt) => !apt.service_id)
        .forEach((apt) => {
          allWarnings.push({
            id: `noservice-${apt.id}`,
            type: "noservice",
            title: "Missing Service",
            description: `Appointment for ${apt.patient?.full_name} on ${format(parseISO(apt.starts_at), "MMM d")} has no service assigned`,
            severity: "medium",
            link: "/calendar",
            appointmentId: apt.id,
            appointmentDate: apt.starts_at,
          });
        });

      // 5. Check for appointments outside staff hours
      staffList.forEach((staff) => {
        const staffAvailability = availabilityByStaff[staff.id] || [];
        const staffApts = (appointmentsByStaff[staff.id] || []).slice(0, 50); // Limit to 50 per staff

        staffApts.forEach((apt) => {
          const aptStart = parseISO(apt.starts_at);
          const weekday = aptStart.getDay() === 0 ? 7 : aptStart.getDay();

          const daySchedule = staffAvailability.find((av) => av.weekday === weekday);

          if (!daySchedule) {
            allWarnings.push({
              id: `outsidehours-${apt.id}`,
              type: "outsidehours",
              title: "Appointment Outside Staff Hours",
              description: `${staff.full_name} has an appointment on ${format(aptStart, "MMM d")} but no availability set`,
              severity: "medium",
              link: `/staff/${staff.id}`,
            });
          } else {
            const [startHour, startMin] = daySchedule.start_time.split(":").map(Number);
            const [endHour, endMin] = daySchedule.end_time.split(":").map(Number);
            const aptHour = aptStart.getHours();
            const aptMin = aptStart.getMinutes();
            const aptTimeInMin = aptHour * 60 + aptMin;
            const scheduleStart = startHour * 60 + startMin;
            const scheduleEnd = endHour * 60 + endMin;

            if (aptTimeInMin < scheduleStart || aptTimeInMin >= scheduleEnd) {
              allWarnings.push({
                id: `outsidehours-${apt.id}`,
                type: "outsidehours",
                title: "Appointment Outside Staff Hours",
                description: `${staff.full_name} appointment at ${format(aptStart, "HH:mm")} is outside working hours`,
                severity: "medium",
                link: `/staff/${staff.id}`,
              });
            }
          }
        });
      });

      // 6. Check for room capacity exceeded
      services.forEach((service) => {
        const serviceApts = appointments.filter((apt) => apt.service_id === service.id);

        // Group by overlapping time slots
        const timeSlots = new Map<string, typeof serviceApts>();

        serviceApts.forEach((apt) => {
          const start = parseISO(apt.starts_at);
          const end = parseISO(apt.ends_at);

          serviceApts.forEach((otherApt) => {
            if (apt.id === otherApt.id) return;

            const otherStart = parseISO(otherApt.starts_at);
            const otherEnd = parseISO(otherApt.ends_at);

            // Check if they overlap
            if (
              (isAfter(start, otherStart) || start.getTime() === otherStart.getTime()) &&
              isBefore(start, otherEnd)
            ) {
              const key = `${service.id}-${start.toISOString()}`;
              if (!timeSlots.has(key)) {
                timeSlots.set(key, []);
              }
              timeSlots.get(key)?.push(apt);
            }
          });
        });

        timeSlots.forEach((apts, key) => {
          if (apts.length >= service.room_capacity!) {
            const firstApt = apts[0];
            allWarnings.push({
              id: `capacity-${key}`,
              type: "capacity",
              title: "Room Capacity Exceeded",
              description: `${service.name} has ${apts.length} bookings but only ${service.room_capacity} room(s) on ${format(parseISO(firstApt.starts_at), "MMM d")}`,
              severity: "high",
              link: "/calendar",
              appointmentId: firstApt.id,
              appointmentDate: firstApt.starts_at,
            });
          }
        });
      });

      // 7. Check for stale waiting list entries
      waitlist.forEach((entry) => {
        const daysOld = differenceInDays(new Date(), parseISO(entry.created_at));
        allWarnings.push({
          id: `stale-${entry.id}`,
          type: "stale",
          title: "Stale Waiting List Entry",
          description: `${entry.patient?.full_name} has been on waiting list for ${daysOld} days`,
          severity: "low",
          link: "/waiting-list",
        });
      });

      // 8. Check for appointments during break times
      staffList.forEach((staff) => {
        const staffBreaks = breaksByStaff[staff.id] || [];
        const staffApts = (appointmentsByStaff[staff.id] || []).slice(0, 50); // Limit to 50 per staff

        staffApts.forEach((apt) => {
          const aptStart = parseISO(apt.starts_at);
          const aptEnd = parseISO(apt.ends_at);
          const weekday = aptStart.getDay() === 0 ? 7 : aptStart.getDay();

          const dayBreaks = staffBreaks.filter((b) => b.weekday === weekday);

          dayBreaks.forEach((breakTime) => {
            const [breakStartHour, breakStartMin] = breakTime.start_time.split(":").map(Number);
            const [breakEndHour, breakEndMin] = breakTime.end_time.split(":").map(Number);

            const aptStartTime = aptStart.getHours() * 60 + aptStart.getMinutes();
            const aptEndTime = aptEnd.getHours() * 60 + aptEnd.getMinutes();
            const breakStartTime = breakStartHour * 60 + breakStartMin;
            const breakEndTime = breakEndHour * 60 + breakEndMin;

            // Check if appointment overlaps with break
            if (
              (aptStartTime >= breakStartTime && aptStartTime < breakEndTime) ||
              (aptEndTime > breakStartTime && aptEndTime <= breakEndTime) ||
              (aptStartTime <= breakStartTime && aptEndTime >= breakEndTime)
            ) {
              allWarnings.push({
                id: `break-${apt.id}`,
                type: "break",
                title: "Appointment During Break",
                description: `${staff.full_name} has an appointment during their break on ${format(aptStart, "MMM d")} at ${format(aptStart, "HH:mm")}`,
                severity: "medium",
                link: "/calendar",
                appointmentId: apt.id,
                appointmentDate: apt.starts_at,
              });
            }
          });
        });
      });

      // 9. Check for missing patient contact info
      const patientsWithNoContact = patients.filter((p) => !p.phone && !p.email);

      patientsWithNoContact.forEach((patient) => {
        allWarnings.push({
          id: `contact-${patient.id}`,
          type: "contact",
          title: "Missing Contact Info",
          description: `${patient.full_name} has no phone or email`,
          severity: "low",
          link: `/patients/${patient.id}`,
        });
      });

      setWarnings(allWarnings);
    } catch (error) {
      logger.error("Error checking warnings", error);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "overlap":
      case "timeoff":
        return Calendar;
      case "noshow":
      case "contact":
        return Users;
      case "outsidehours":
      case "break":
        return Clock;
      case "capacity":
        return Home;
      default:
        return AlertTriangle;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "text-red-500";
      case "medium":
        return "text-yellow-500";
      case "low":
        return "text-blue-500";
      default:
        return "text-muted-foreground";
    }
  };

  const handleWarningClick = (warning: Warning) => {
    if (warning.link) {
      if (warning.appointmentDate) {
        // For appointment-related warnings, navigate to calendar day view
        navigate(warning.link, {
          state: {
            appointmentDate: warning.appointmentDate,
            appointmentId: warning.appointmentId,
          },
        });
      } else {
        // For other warnings (staff, patients), just navigate to the link
        navigate(warning.link);
      }
    }
  };

  // Don't show anything if loading or no warnings (parent handles skeleton)
  if (loading || warnings.length === 0) {
    return null;
  }

  // Group warnings by type
  const groupedWarnings = warnings.reduce((acc, warning) => {
    if (!acc[warning.type]) {
      acc[warning.type] = [];
    }
    acc[warning.type].push(warning);
    return acc;
  }, {} as Record<string, Warning[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Warnings & Conflicts</h2>
        <Button onClick={checkForWarnings} variant="ghost" size="sm">
          Recheck
        </Button>
      </div>
      <div className="grid gap-4">
        {Object.entries(groupedWarnings).map(([type, typeWarnings]) => {
          const Icon = getIcon(type);
          const highestSeverity = typeWarnings.reduce((max, w) => {
            const severities = { high: 3, medium: 2, low: 1 };
            return severities[w.severity as keyof typeof severities] >
              severities[max as keyof typeof severities]
              ? w.severity
              : max;
          }, "low");

          return (
            <InfoCard key={type}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${getSeverityColor(highestSeverity)}`} />
                    <h3 className="font-semibold">{typeWarnings[0].title}</h3>
                    <span className="bg-muted text-sm px-2 py-0.5 rounded-full">
                      {typeWarnings.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {typeWarnings.slice(0, 5).map((warning) => (
                    <button
                      key={warning.id}
                      onClick={() => handleWarningClick(warning)}
                      className="w-full flex items-start justify-between gap-2 p-3 bg-muted/50 rounded-md hover:bg-muted transition-colors text-left"
                    >
                      <p className="text-sm flex-1">{warning.description}</p>
                    </button>
                  ))}
                  {typeWarnings.length > 5 && (
                    <p className="text-sm text-muted-foreground text-center pt-2">
                      +{typeWarnings.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            </InfoCard>
          );
        })}
      </div>
    </div>
  );
};

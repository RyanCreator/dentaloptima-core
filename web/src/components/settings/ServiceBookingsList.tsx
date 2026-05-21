import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Calendar, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { PageLoading } from "@/components/PageLoading";

// Read-only list of upcoming appointments using a given service. Used by
// the Bookings tab on ServiceDetail so an operator can see the impact
// before they edit / deactivate / re-price a service.
//
// "Upcoming" = SCHEDULED status and starts_at >= now. Cancelled / past
// appointments aren't relevant — operators looking at this tab care about
// what's about to happen, not history. We cap at 200 rows to keep the
// fetch cheap; if a service has more than that we surface a "showing 200"
// note rather than paginating (rare in practice).

interface BookingRow {
  appointment_id: string;
  starts_at: string;
  status: string;
  staff_name: string | null;
  patient_id: string | null;
  patient_name: string | null;
}

interface ServiceBookingsListProps {
  serviceId: string;
}

export function ServiceBookingsList({ serviceId }: ServiceBookingsListProps) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const nowIso = new Date().toISOString();
      // Walk via appointment_service since one appointment can carry
      // multiple services; the join row is what scopes us to this service.
      const { data, error } = await supabase
        .from("appointment_service")
        .select(
          "appointment:appointment_id (id, starts_at, status, staff:staff_id (full_name), patient:patient_id (id, first_name, last_name))",
        )
        .eq("service_id", serviceId)
        .limit(201);

      if (cancelled) return;
      if (error) {
        logger.error("Failed to load service bookings", error);
        setLoading(false);
        return;
      }

      const mapped: BookingRow[] = ((data ?? []) as any[])
        .map((row) => row.appointment)
        .filter((a: any) => a && a.status === "SCHEDULED" && a.starts_at >= nowIso)
        .map((a: any) => ({
          appointment_id: a.id,
          starts_at: a.starts_at,
          status: a.status,
          staff_name: a.staff?.full_name ?? null,
          patient_id: a.patient?.id ?? null,
          patient_name: a.patient
            ? `${a.patient.first_name ?? ""} ${a.patient.last_name ?? ""}`.trim() || null
            : null,
        }))
        .sort((x: BookingRow, y: BookingRow) => x.starts_at.localeCompare(y.starts_at));

      setTruncated(mapped.length >= 200);
      setRows(mapped.slice(0, 200));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  if (loading) {
    return <PageLoading variant="inline" label="Loading bookings…" />;
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card rounded-lg border p-8 text-center">
        <Calendar className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
        <p className="font-medium">No upcoming bookings</p>
        <p className="text-sm text-muted-foreground mt-1">
          Once this service is booked, future appointments using it will
          appear here so you can see the impact of any edits.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">When</th>
              <th className="text-left font-medium px-4 py-2.5">Patient</th>
              <th className="text-left font-medium px-4 py-2.5">Clinician</th>
              <th className="text-left font-medium px-4 py-2.5 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.appointment_id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2.5 tabular-nums">
                  {format(new Date(r.starts_at), "EEE d MMM HH:mm")}
                </td>
                <td className="px-4 py-2.5">
                  {r.patient_id ? (
                    <Link
                      to={`/patients/${r.patient_id}`}
                      className="text-primary hover:underline truncate inline-flex items-center gap-1"
                    >
                      {r.patient_name ?? "Unnamed"}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {r.staff_name ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    to={`/calendar?appointment=${r.appointment_id}`}
                    className="inline-flex items-center text-muted-foreground hover:text-foreground"
                    title="Open in calendar"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <div className="px-4 py-2.5 bg-muted/20 text-xs text-muted-foreground border-t">
          Showing the next 200 bookings. Older or further-future ones aren't displayed.
        </div>
      )}
    </div>
  );
}

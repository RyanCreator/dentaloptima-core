import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Hooks for the clinician → admin "please set me up as an NHS performer"
// queue (migration 0039). Two surfaces:
//   - useNhsPendingRequestCount() — for the sidebar badge.
//   - useNhsPerformerRequests() — full list for the Pending tab on Staff.
//
// RLS scopes everything to current_practice_id() automatically. INSERT is
// open to the staff member raising the request OR an admin acting on
// behalf; UPDATE/cancel is admin-only. The auto-resolve trigger flips
// status from PENDING to COMPLETED when the matching nhs_performer row
// is created — admins don't need to remember to mark requests done.

export interface NhsPerformerRequest {
  id: string;
  practice_id: string;
  staff_id: string;
  requested_by: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  // Joined name fields for the list view; null for queries that don't embed.
  staff_name?: string | null;
  staff_email?: string | null;
}

// Fast count just for the sidebar badge.
export function useNhsPendingRequestCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { count: c } = await supabase
      .from("nhs_performer_request")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING");
    setCount(c ?? 0);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`nhs-request-count-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nhs_performer_request" },
        () => refresh(),
      )
      // Auto-resolve fires on nhs_performer insert, which flips a request
      // to COMPLETED. Watch that table too so the badge clears live.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "nhs_performer" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { count, refresh };
}

// Full pending list for the Staff > Pending tab. Joins practice_member to
// surface the requester's name/email so the list is scannable.
export function useNhsPerformerRequests() {
  const [requests, setRequests] = useState<NhsPerformerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("nhs_performer_request")
      .select(
        "id, practice_id, staff_id, requested_by, status, notes, created_at, resolved_at, resolved_by, staff:practice_member!nhs_performer_request_staff_id_fkey(full_name, email)",
      )
      .eq("status", "PENDING")
      .order("created_at", { ascending: true });

    const flattened: NhsPerformerRequest[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      practice_id: r.practice_id,
      staff_id: r.staff_id,
      requested_by: r.requested_by,
      status: r.status,
      notes: r.notes,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      resolved_by: r.resolved_by,
      staff_name: r.staff?.full_name ?? null,
      staff_email: r.staff?.email ?? null,
    }));
    setRequests(flattened);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel(`nhs-requests-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nhs_performer_request" },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { requests, loading, reload };
}

// Returns the most recent request for a given staff member. Used by the
// "Request NHS performer setup" button on a clinician's own profile so
// we can show "Pending — awaiting practice admin" instead of letting them
// re-press and hit the unique-pending constraint.
export function useLatestRequestForStaff(staffId: string | null) {
  const [latest, setLatest] = useState<NhsPerformerRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!staffId) {
      setLatest(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("nhs_performer_request")
      .select("*")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest((data as NhsPerformerRequest) ?? null);
    setLoading(false);
  }, [staffId]);

  useEffect(() => {
    reload();
    if (!staffId) return;
    const channel = supabase
      .channel(`nhs-request-staff-${staffId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nhs_performer_request",
          filter: `staff_id=eq.${staffId}`,
        },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffId, reload]);

  return { latest, loading, reload };
}

// Caller passes the staff_member.id (= our own practice_member row when
// self-requesting) and a practice_id from PracticeContext.
export async function createNhsPerformerRequest(
  practiceId: string,
  staffId: string,
  requestedByMemberId: string,
  notes?: string,
) {
  const { error } = await supabase.from("nhs_performer_request").insert({
    practice_id: practiceId,
    staff_id: staffId,
    requested_by: requestedByMemberId,
    notes: notes?.trim() || null,
  });
  if (error) {
    // Unique pending constraint — surface as "already pending" instead of a
    // raw 23505 to the UI.
    if (error.code === "23505") {
      throw new Error("A pending NHS performer request already exists for this clinician.");
    }
    throw error;
  }
}

export async function cancelNhsPerformerRequest(requestId: string) {
  const { error } = await supabase
    .from("nhs_performer_request")
    .update({ status: "CANCELLED", resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw error;
}

import { useEffect, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { usePractice } from "@/contexts/PracticeContext";

// Schema in dentaloptima-core (migration 0008): blocked_time has
// `block_type` (enum) + `title` (free text). The legacy `reason` column
// is gone — `reason` was free text + status, but the new schema separates
// the kind of block (TRAINING / ADMIN / PERSONAL / OTHER) from a label.
//
// We keep a `reason` getter on the interface for back-compat with lifted
// UI code that reads it; the underlying field is `title`.
export interface BlockedTimeEntry {
  id: string;
  practice_id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  block_type: string;
  title: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBlockedTimeParams {
  staff_id: string;
  starts_at: string;
  ends_at: string;
  block_type?: string; // defaults to "OTHER" if not provided
  /** Short label shown on the blocked-time chip in the calendar. NOT NULL
   *  in the schema; falls back to "Blocked time" if the caller doesn't
   *  supply one so the insert always satisfies the constraint. */
  title?: string;
  /** Free-text label from the legacy "reason" field. Accepted as an alias
   *  for `title` so older call sites that still pass `reason` work. */
  reason?: string;
  notes?: string;
}

/**
 * Hook for managing blocked time periods
 */
export function useBlockedTime(staffId?: string) {
  const queryClient = useQueryClient();
  const tenant = usePractice();
  const practiceId = tenant.practice.id;

  // Fetch blocked time entries
  const { data: blockedTimeEntries = [], isLoading } = useQuery({
    queryKey: ["blocked-time", staffId],
    queryFn: async () => {
      let query = supabase
        .from("blocked_time")
        .select("*")
        .order("starts_at", { ascending: true });

      if (staffId) {
        query = query.eq("staff_id", staffId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error("Error fetching blocked time", error);
        throw error;
      }

      return (data || []) as BlockedTimeEntry[];
    },
    enabled: true,
  });

  // Create blocked time
  const createBlockedTime = useMutation({
    mutationFn: async (params: CreateBlockedTimeParams) => {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();

      // Look up the practice_member ID from the auth user ID. The new
      // schema's audit columns reference practice_member.id rather than
      // the legacy app_staff.id.
      let createdByMemberId = null;
      if (user?.id) {
        const { data: memberData } = await supabase
          .from("practice_member")
          .select("id")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .maybeSingle();

        createdByMemberId = memberData?.id || null;
      }

      const { data, error } = await supabase
        .from("blocked_time")
        .insert({
          practice_id: practiceId,
          staff_id: params.staff_id,
          starts_at: params.starts_at,
          ends_at: params.ends_at,
          block_type: params.block_type ?? "OTHER",
          // title is NOT NULL — fall back to the legacy `reason` alias or a
          // sensible default so the insert always passes the constraint.
          title: params.title ?? params.reason ?? "Blocked time",
          notes: params.notes ?? null,
          created_by: createdByMemberId,
        })
        .select()
        .single();

      if (error) {
        logger.error("Error creating blocked time", error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      toast.success("Time blocked successfully");
      queryClient.invalidateQueries({ queryKey: ["blocked-time"] });
      // Also invalidate availability queries since blocked time affects slots
      queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onError: (error: any) => {
      logger.error("Failed to create blocked time", error);
      console.error("Blocked time creation error:", error);

      if (error.message?.includes("overlaps")) {
        toast.error("This time period overlaps with an existing block");
      } else if (error.message?.includes("violates check constraint")) {
        toast.error("Invalid time range: end time must be after start time");
      } else {
        toast.error(`Failed to block time: ${error.message || 'Unknown error'}`);
      }
    },
  });

  // Update blocked time
  const updateBlockedTime = useMutation({
    mutationFn: async ({ id, ...params }: Partial<BlockedTimeEntry> & { id: string }) => {
      const { data, error } = await supabase
        .from("blocked_time")
        .update(params)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        logger.error("Error updating blocked time", error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      toast.success("Blocked time updated");
      queryClient.invalidateQueries({ queryKey: ["blocked-time"] });
      queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onError: (error: any) => {
      logger.error("Failed to update blocked time", error);
      toast.error("Failed to update blocked time");
    },
  });

  // Delete blocked time
  const deleteBlockedTime = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blocked_time")
        .delete()
        .eq("id", id);

      if (error) {
        logger.error("Error deleting blocked time", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Blocked time removed");
      queryClient.invalidateQueries({ queryKey: ["blocked-time"] });
      queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onError: (error: any) => {
      logger.error("Failed to delete blocked time", error);
      toast.error("Failed to remove blocked time");
    },
  });

  // Unique channel id per hook instance — useBlockedTime is called from
  // both Calendar.tsx and BlockedTimeChip, plus StrictMode double-mounts
  // every effect. Reusing the same channel name across instances triggers
  // supabase's "cannot add `postgres_changes` callbacks ... after
  // subscribe()" because the second call gets back the already-subscribed
  // channel and tries to attach a new listener to it.
  const channelId = useId();

  // Realtime: invalidate the cache when any blocked_time row changes for
  // the current practice. Catches a colleague creating/removing blocks
  // while this calendar is open. Practice scoping is on the client because
  // RLS already restricts visibility, but rows from other tenants still
  // arrive on the channel — invalidate either way; the refetch is cheap.
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["blocked-time"] });
        queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      }, 300);
    };
    const channel = supabase
      .channel(`calendar-blocked-time-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocked_time" },
        scheduleInvalidate,
      )
      .subscribe();
    return () => {
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, channelId]);

  return {
    blockedTimeEntries,
    isLoading,
    createBlockedTime: createBlockedTime.mutate,
    updateBlockedTime: updateBlockedTime.mutate,
    deleteBlockedTime: deleteBlockedTime.mutate,
    isCreating: createBlockedTime.isPending,
    isUpdating: updateBlockedTime.isPending,
    isDeleting: deleteBlockedTime.isPending,
  };
}

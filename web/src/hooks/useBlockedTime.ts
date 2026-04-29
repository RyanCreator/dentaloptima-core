import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface BlockedTimeEntry {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBlockedTimeParams {
  staff_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  notes?: string;
}

/**
 * Hook for managing blocked time periods
 */
export function useBlockedTime(staffId?: string) {
  const queryClient = useQueryClient();

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

      // Look up the staff member ID from the auth user ID
      let createdByStaffId = null;
      if (user?.id) {
        const { data: staffData } = await supabase
          .from("app_staff")
          .select("id")
          .eq("user_id", user.id)
          .single();

        createdByStaffId = staffData?.id || null;
      }

      const { data, error } = await supabase
        .from("blocked_time")
        .insert({
          ...params,
          created_by: createdByStaffId,
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

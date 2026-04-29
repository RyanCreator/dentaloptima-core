import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook to get count of NEW enquiries (not yet opened)
 * Updates in real-time with subscriptions
 */
export function useNewEnquiriesCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const fetchCount = async () => {
    const { count: newCount, error } = await supabase
      .from("booking_request")
      .select("*", { count: "exact", head: true })
      .eq("status", "NEW");

    if (!error && newCount !== null) {
      setCount(newCount);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCount();

    // Subscribe to changes in booking_request table
    const channel = supabase
      .channel("new-enquiries-count")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_request",
        },
        () => {
          // Refetch count when any booking_request changes
          fetchCount();
          // Also invalidate enquiries query so lists update
          queryClient.invalidateQueries({ queryKey: ["enquiries"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { count, loading };
}

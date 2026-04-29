import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { Staff } from "@/types/entities";

export function useStaff(bookableOnly: boolean = true) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = async () => {
    setLoading(true);
    setError(null);

    // Only select commonly used fields in list views and dropdowns
    // Email, phone, and user_id are loaded separately on staff detail pages
    let query = supabase
      .from("app_staff")
      .select("id, full_name, active, available_for_booking, colour_tag")
      .is("deleted_at", null)
      .order("full_name");

    if (bookableOnly) {
      query = query.eq("available_for_booking", true);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      logger.error("Error loading staff", fetchError);
      setError("Failed to load staff");
      toast.error("Failed to load staff");
    } else if (data) {
      setStaff(data as Staff[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadStaff();
  }, [bookableOnly]);

  return { staff, loading, error, reload: loadStaff };
}

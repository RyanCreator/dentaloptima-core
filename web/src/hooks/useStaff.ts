import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { Staff } from "@/types/entities";

// Lists practice members (the booking app's "staff"). Reads from the new
// `practice_member` table — not the legacy `app_staff`. Columns map:
//   active            → is_active
//   colour_tag        → color_hex
//   staff_type        → role (now an enum: OWNER/ADMIN/DENTIST/...)
//
// RLS scopes results to the caller's practice via current_practice_id().
export function useStaff(bookableOnly: boolean = true) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("practice_member")
      .select("id, user_id, practice_id, role, full_name, email, phone, gdc_number, specialism, is_active, available_for_booking, color_hex")
      .is("deleted_at", null)
      .eq("is_active", true)
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

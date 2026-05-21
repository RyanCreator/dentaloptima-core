import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { Service } from "@/types/entities";

// Lists services. Reads from the new `service` table (singular) — not
// the legacy `services`. Columns map:
//   active              → is_active
//   colour_tag          → color_hex
//   price (decimal £)   → price_pence (integer)
//
// Legacy `all_staff_can_perform` / `requires_room` / `room_capacity` no
// longer exist — staff↔service assignment is via the `staff_service` join
// table now, and rooms aren't modelled.
export function useServices(activeOnly: boolean = true) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServices = async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("service")
      .select(
        "id, practice_id, name, description, treatment_type, duration_minutes, buffer_before_minutes, buffer_after_minutes, price_pence, is_nhs, nhs_band, recall_months, color_hex, display_order, is_publicly_bookable, is_active",
      )
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      logger.error("Error loading services", fetchError);
      setError("Failed to load services");
      toast.error("Failed to load services");
    } else if (data) {
      setServices(data as Service[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadServices();
  }, [activeOnly]);

  return { services, loading, error, reload: loadServices };
}

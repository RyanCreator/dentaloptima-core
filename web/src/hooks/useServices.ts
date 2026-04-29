import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { Service } from "@/types/entities";

export function useServices(activeOnly: boolean = true) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServices = async () => {
    setLoading(true);
    setError(null);

    // Select fields needed for availability calculations and display
    // Excludes: created_at (not used), price/colour_tag (loaded on detail page)
    let query = supabase
      .from("services")
      .select("id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, active, all_staff_can_perform, requires_room, room_capacity, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (activeOnly) {
      query = query.eq("active", true);
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

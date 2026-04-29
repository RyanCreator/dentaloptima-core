import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { Patient } from "@/types/entities";

export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatients = async () => {
    setLoading(true);
    setError(null);

    // Only select fields used in list views (id, full_name, phone, no_show_count)
    // Email and notes are loaded separately on patient detail page
    const { data, error: fetchError } = await supabase
      .from("patient")
      .select("id, full_name, phone, no_show_count")
      .is("deleted_at", null)
      .order("full_name");

    if (fetchError) {
      logger.error("Error loading patients", fetchError);
      setError("Failed to load patients");
      toast.error("Failed to load patients");
    } else if (data) {
      setPatients(data as Patient[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadPatients();
  }, []);

  return { patients, loading, error, reload: loadPatients };
}

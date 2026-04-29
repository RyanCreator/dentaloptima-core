import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface PracticeClosure {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export function usePracticeClosures() {
  const [closures, setClosures] = useState<PracticeClosure[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClosures = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("practice_closures")
      .select("*")
      .order("starts_at", { ascending: false });

    if (error) {
      logger.error("Error loading practice closures", error);
      toast.error("Failed to load practice closures");
    } else if (data) {
      setClosures(data);
    }
    setLoading(false);
  };

  const addClosure = async (
    startsAt: string,
    endsAt: string,
    reason?: string
  ) => {
    const { error } = await supabase
      .from("practice_closures")
      .insert({
        starts_at: startsAt,
        ends_at: endsAt,
        reason: reason || null,
      });

    if (error) {
      logger.error("Error adding practice closure", error);
      toast.error("Failed to add practice closure");
      return false;
    }

    toast.success("Practice closure added");
    await loadClosures();
    return true;
  };

  const deleteClosure = async (id: string) => {
    const { error } = await supabase
      .from("practice_closures")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Error deleting practice closure", error);
      toast.error("Failed to delete practice closure");
      return false;
    }

    toast.success("Practice closure deleted");
    await loadClosures();
    return true;
  };

  useEffect(() => {
    loadClosures();
  }, []);

  return { closures, loading, addClosure, deleteClosure, reload: loadClosures };
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface PracticeHours {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export function usePracticeHours() {
  const [hours, setHours] = useState<PracticeHours[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHours = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("practice_hours")
      .select("*")
      .order("weekday");

    if (error) {
      logger.error("Error loading practice hours", error);
      toast.error("Failed to load practice hours");
    } else if (data) {
      setHours(data);
    }
    setLoading(false);
  };

  const addHours = async (weekday: number, startTime: string, endTime: string) => {
    const { error } = await supabase
      .from("practice_hours")
      .insert({
        weekday,
        start_time: startTime,
        end_time: endTime,
      });

    if (error) {
      logger.error("Error adding practice hours", error);
      toast.error("Failed to add practice hours");
      return false;
    }

    toast.success("Practice hours added");
    await loadHours();
    return true;
  };

  const deleteHours = async (id: string) => {
    const { error } = await supabase
      .from("practice_hours")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Error deleting practice hours", error);
      toast.error("Failed to delete practice hours");
      return false;
    }

    toast.success("Practice hours deleted");
    await loadHours();
    return true;
  };

  useEffect(() => {
    loadHours();
  }, []);

  return { hours, loading, addHours, deleteHours, reload: loadHours };
}

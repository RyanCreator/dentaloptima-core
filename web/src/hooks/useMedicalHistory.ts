import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface MedicalHistoryEntry {
  id: string;
  patient_id: string;
  entry_type: "condition" | "medication" | "allergy" | "procedure" | "event";
  title: string;
  details: string | null;
  severity: "low" | "medium" | "high" | "critical" | null;
  is_active: boolean;
  onset_date: string | null;
  resolved_date: string | null;
  recorded_at: string;
  recorded_by_staff_id: string | null;
  created_at: string;
  staff?: { full_name: string } | null;
}

export function useMedicalHistory(patientId: string | undefined) {
  const [entries, setEntries] = useState<MedicalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("medical_history_entry")
      .select("*, staff:recorded_by_staff_id(full_name)")
      .eq("patient_id", patientId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error loading medical history", error);
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const addEntry = async (entry: {
    entry_type: string;
    title: string;
    details?: string;
    severity?: string;
    onset_date?: string;
  }) => {
    if (!patientId) return false;

    const { data: staffData } = await supabase
      .from("app_staff")
      .select("id")
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    const { error } = await supabase.from("medical_history_entry").insert({
      patient_id: patientId,
      entry_type: entry.entry_type,
      title: entry.title,
      details: entry.details || null,
      severity: entry.severity || null,
      onset_date: entry.onset_date || null,
      recorded_by_staff_id: staffData?.id || null,
    });

    if (error) {
      toast.error("Failed to add medical history entry");
      return false;
    }
    toast.success("Medical history updated");
    await load();
    return true;
  };

  const toggleActive = async (entryId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("medical_history_entry")
      .update({
        is_active: isActive,
        resolved_date: isActive ? null : new Date().toISOString().split("T")[0],
      })
      .eq("id", entryId);

    if (error) {
      toast.error("Failed to update entry");
    } else {
      await load();
    }
  };

  return { entries, loading, addEntry, toggleActive, reload: load };
}

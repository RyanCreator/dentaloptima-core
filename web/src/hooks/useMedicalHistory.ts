import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

// Adapted to dentaloptima-core's `medical_history_entry` table.
//   - recorded_by_staff_id → created_by (filled by the audit trigger)
//   - details → notes
//   - entry_type enum values are now uppercase: CONDITION, MEDICATION,
//     ALLERGY, PROCEDURE, EVENT
//   - severity enum values uppercase: LOW, MEDIUM, HIGH, CRITICAL
export type MedicalHistoryEntryType =
  | "CONDITION"
  | "MEDICATION"
  | "ALLERGY"
  | "PROCEDURE"
  | "EVENT";

export type MedicalSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface MedicalHistoryEntry {
  id: string;
  patient_id: string;
  entry_type: MedicalHistoryEntryType;
  description: string;
  notes: string | null;
  severity: MedicalSeverity | null;
  is_active: boolean;
  onset_date: string | null;
  resolved_date: string | null;
  recorded_at: string;
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
      .select("*, staff:created_by(full_name)")
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error loading medical history", error);
    } else {
      setEntries((data as MedicalHistoryEntry[]) ?? []);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const addEntry = async (entry: {
    entry_type: MedicalHistoryEntryType;
    description: string;
    notes?: string;
    severity?: MedicalSeverity;
    onset_date?: string;
  }) => {
    if (!patientId) return false;

    // created_by is filled by app_private.fn_set_audit_columns trigger.
    const { error } = await supabase.from("medical_history_entry").insert({
      patient_id: patientId,
      entry_type: entry.entry_type,
      description: entry.description,
      notes: entry.notes || null,
      severity: entry.severity || null,
      onset_date: entry.onset_date || null,
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

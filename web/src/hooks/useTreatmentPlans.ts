import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface TreatmentPlanItem {
  id: string;
  treatment_plan_id: string;
  service_id: string | null;
  sequence: number;
  tooth_numbers: number[] | null;
  status: string;
  estimated_price: number | null;
  actual_price: number | null;
  appointment_id: string | null;
  notes: string | null;
  service?: { name: string; duration_minutes: number } | null;
}

export interface TreatmentPlan {
  id: string;
  patient_id: string;
  title: string;
  status: string;
  created_at: string;
  created_by_staff_id: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  estimated_total: number | null;
  actual_total: number | null;
  notes: string | null;
  acceptance_sent_at?: string | null;
  accepted_via?: string | null;
  declined_at?: string | null;
  declined_reason?: string | null;
  staff?: { full_name: string } | null;
  items?: TreatmentPlanItem[];
}

export function useTreatmentPlans(patientId: string | undefined) {
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("treatment_plan")
      .select(`
        *,
        staff:created_by_staff_id(full_name),
        items:treatment_plan_item(*, service:service_id(name, duration_minutes))
      `)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error loading treatment plans", error);
    } else {
      setPlans(data || []);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const createPlan = async (title: string, notes?: string) => {
    if (!patientId) return null;

    const { data: staffData } = await supabase
      .from("app_staff")
      .select("id")
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    const { data, error } = await supabase
      .from("treatment_plan")
      .insert({
        patient_id: patientId,
        title,
        notes: notes || null,
        created_by_staff_id: staffData?.id || null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create treatment plan");
      return null;
    }
    toast.success("Treatment plan created");
    await load();
    return data;
  };

  const updatePlanStatus = async (planId: string, status: string) => {
    const updates: Record<string, any> = { status };
    if (status === "ACCEPTED") updates.accepted_at = new Date().toISOString();
    if (status === "COMPLETED") updates.completed_at = new Date().toISOString();

    const { error } = await supabase
      .from("treatment_plan")
      .update(updates)
      .eq("id", planId);

    if (error) {
      toast.error("Failed to update plan status");
    } else {
      toast.success(`Plan marked as ${status.toLowerCase()}`);
      await load();
    }
  };

  const addItem = async (planId: string, item: {
    service_id?: string;
    sequence?: number;
    tooth_numbers?: number[];
    estimated_price?: number;
    notes?: string;
  }) => {
    const { error } = await supabase
      .from("treatment_plan_item")
      .insert({
        treatment_plan_id: planId,
        service_id: item.service_id || null,
        sequence: item.sequence || 0,
        tooth_numbers: item.tooth_numbers || null,
        estimated_price: item.estimated_price || null,
        notes: item.notes || null,
      });

    if (error) {
      toast.error("Failed to add item");
    } else {
      await load();
    }
  };

  const updateItemStatus = async (itemId: string, status: string) => {
    const { error } = await supabase
      .from("treatment_plan_item")
      .update({ status })
      .eq("id", itemId);

    if (error) {
      toast.error("Failed to update item");
    } else {
      await load();
    }
  };

  const removeItem = async (itemId: string) => {
    const { error } = await supabase
      .from("treatment_plan_item")
      .delete()
      .eq("id", itemId);

    if (error) {
      toast.error("Failed to remove item");
    } else {
      await load();
    }
  };

  return { plans, loading, createPlan, updatePlanStatus, addItem, updateItemStatus, removeItem, reload: load };
}

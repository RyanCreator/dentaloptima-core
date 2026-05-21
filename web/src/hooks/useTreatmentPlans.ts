import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

// Adapted to dentaloptima-core's `treatment_plan` + `treatment_plan_item`
// tables. Key differences from the legacy hook:
//   - The proposing dentist lives on `proposed_by` (NOT NULL). The audit
//     trigger fills `created_by` separately for the row that physically
//     inserted the record (could be a receptionist on a dentist's behalf).
//   - Pricing is in pence integers, not float pounds. Items snapshot
//     `price_pence_snapshot` + `duration_minutes_snapshot` from the service
//     at the time they're added — later service price changes don't drift
//     historical plans.
//   - Item status enum: PROPOSED, SCHEDULED, COMPLETED, CANCELLED. Plans
//     have their own enum: DRAFT, PROPOSED, ACCEPTED, IN_PROGRESS,
//     COMPLETED, DECLINED, EXPIRED.
//   - Tooth numbers use FDI notation (11–48 adult, 51–85 deciduous). The DB
//     has a CHECK constraint via app_private.fn_is_valid_tooth_array, so
//     bad values are rejected at the row level.

export type TreatmentPlanStatus =
  | "DRAFT"
  | "PROPOSED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DECLINED"
  | "EXPIRED";

export type TreatmentPlanItemStatus =
  | "PROPOSED"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

export interface TreatmentPlanItem {
  id: string;
  treatment_plan_id: string;
  service_id: string;
  tooth_numbers: number[] | null;
  surface: string | null;
  sequence: number;
  status: TreatmentPlanItemStatus;
  scheduled_appointment_id: string | null;
  completed_appointment_id: string | null;
  completed_at: string | null;
  price_pence_snapshot: number | null;
  duration_minutes_snapshot: number | null;
  notes: string | null;
  service?: { name: string; duration_minutes: number } | null;
}

export interface TreatmentPlan {
  id: string;
  practice_id: string;
  patient_id: string;
  title: string;
  description: string | null;
  status: TreatmentPlanStatus;
  proposed_by: string;
  proposed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  completed_at: string | null;
  expires_at: string | null;
  total_estimated_pence: number | null;
  created_at: string;
  proposer?: { full_name: string | null } | null;
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
      .select(
        `id, practice_id, patient_id, title, description, status,
         proposed_by, proposed_at, accepted_at, declined_at, declined_reason,
         completed_at, expires_at, total_estimated_pence, created_at,
         proposer:proposed_by (full_name),
         items:treatment_plan_item (
           id, treatment_plan_id, service_id, tooth_numbers, surface,
           sequence, status, scheduled_appointment_id, completed_appointment_id,
           completed_at, price_pence_snapshot, duration_minutes_snapshot, notes,
           service:service_id (name, duration_minutes)
         )`,
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error loading treatment plans", error);
      toast.error("Failed to load treatment plans");
    } else {
      setPlans((data as unknown as TreatmentPlan[]) ?? []);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  // Plan create. proposed_by must be a real practice_member.id; the caller
  // hands one in (typically the logged-in user's member id from useAuth).
  const createPlan = async (params: {
    practiceId: string;
    title: string;
    description?: string;
    proposedBy: string;
  }) => {
    if (!patientId) return null;

    const { data, error } = await supabase
      .from("treatment_plan")
      .insert({
        practice_id: params.practiceId,
        patient_id: patientId,
        proposed_by: params.proposedBy,
        title: params.title,
        description: params.description || null,
        status: "DRAFT",
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

  const updatePlanStatus = async (
    planId: string,
    status: TreatmentPlanStatus,
    declinedReason?: string,
  ) => {
    const updates: Record<string, any> = { status };
    if (status === "PROPOSED" && !plans.find((p) => p.id === planId)?.proposed_at) {
      updates.proposed_at = new Date().toISOString();
    }
    if (status === "ACCEPTED") updates.accepted_at = new Date().toISOString();
    if (status === "DECLINED") {
      updates.declined_at = new Date().toISOString();
      updates.declined_reason = declinedReason || null;
    }
    if (status === "COMPLETED") updates.completed_at = new Date().toISOString();

    const { error } = await supabase
      .from("treatment_plan")
      .update(updates)
      .eq("id", planId);

    if (error) {
      toast.error("Failed to update plan status");
    } else {
      toast.success(`Plan marked as ${status.toLowerCase().replace("_", " ")}`);
      await load();
    }
  };

  const addItem = async (
    planId: string,
    item: {
      practiceId: string;
      service: { id: string; price_pence: number | null; duration_minutes: number };
      tooth_numbers?: number[];
      surface?: string;
      notes?: string;
      sequence?: number;
    },
  ) => {
    const { error } = await supabase.from("treatment_plan_item").insert({
      practice_id: item.practiceId,
      treatment_plan_id: planId,
      service_id: item.service.id,
      sequence: item.sequence ?? 0,
      tooth_numbers: item.tooth_numbers && item.tooth_numbers.length > 0 ? item.tooth_numbers : null,
      surface: item.surface || null,
      notes: item.notes || null,
      // Snapshot pricing + duration so future service edits don't change
      // historical plans.
      price_pence_snapshot: item.service.price_pence,
      duration_minutes_snapshot: item.service.duration_minutes,
    });

    if (error) {
      // Most useful failure mode: invalid FDI tooth number. The DB CHECK
      // constraint surfaces a meaningful message we can show through.
      const message = /tooth/i.test(error.message ?? "")
        ? "Invalid tooth number — use FDI notation (11–48 adult, 51–85 deciduous)"
        : "Failed to add item";
      toast.error(message);
    } else {
      // Roll up the totals so the parent plan's total_estimated_pence
      // stays in sync. Cheap to redo from scratch each time vs tracking
      // deltas, since plans usually have <20 items.
      await refreshPlanTotal(planId);
      await load();
    }
  };

  const updateItemStatus = async (itemId: string, status: TreatmentPlanItemStatus) => {
    const updates: Record<string, any> = { status };
    if (status === "COMPLETED") updates.completed_at = new Date().toISOString();

    const { error } = await supabase
      .from("treatment_plan_item")
      .update(updates)
      .eq("id", itemId);

    if (error) {
      toast.error("Failed to update item");
    } else {
      await load();
    }
  };

  const removeItem = async (itemId: string, planId: string) => {
    const { error } = await supabase
      .from("treatment_plan_item")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", itemId);

    if (error) {
      toast.error("Failed to remove item");
    } else {
      await refreshPlanTotal(planId);
      await load();
    }
  };

  // Recompute and store the plan's total from its currently-active items.
  // Done client-side because RLS scopes us to one practice anyway, and
  // a DB trigger would couple snapshotting to the items table change-log
  // unnecessarily.
  async function refreshPlanTotal(planId: string) {
    const { data, error } = await supabase
      .from("treatment_plan_item")
      .select("price_pence_snapshot")
      .eq("treatment_plan_id", planId)
      .is("deleted_at", null);

    if (error) return;
    const total = (data ?? []).reduce(
      (sum, row) => sum + (row.price_pence_snapshot ?? 0),
      0,
    );
    await supabase
      .from("treatment_plan")
      .update({ total_estimated_pence: total > 0 ? total : null })
      .eq("id", planId);
  }

  return {
    plans,
    loading,
    createPlan,
    updatePlanStatus,
    addItem,
    updateItemStatus,
    removeItem,
    reload: load,
  };
}

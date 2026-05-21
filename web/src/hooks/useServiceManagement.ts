import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/contexts/PracticeContext";
import { toast } from "sonner";
import type { Service } from "@/types/entities";

// Adapted to dentaloptima-core's `service` table (singular). Legacy concepts
// dropped in the core schema:
//   - all_staff_can_perform / requires_room / room_capacity — gone. Eligibility
//     is determined purely by rows in `staff_service`. A service with no rows
//     simply has no staff eligible to perform it.
//   - colour_tag → color_hex
//   - active     → is_active
//   - price      → price_pence (integer pence, not float pounds)
export function useServiceManagement() {
  // RLS on `service` requires the inserted row to carry a practice_id
  // matching app_private.current_practice_id(). The booking app already
  // resolves the caller's practice via PracticeContext at boot, so we
  // inject it on every create — there's no DB-side default for it.
  const tenant = usePractice();
  const callerPracticeId = tenant.practice.id;

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadServices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service")
      .select("*")
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (!error && data) {
      setServices(data as Service[]);
    }
    setLoading(false);
  };

  // Swaps display_order with the adjacent neighbour rather than renumbering
  // everything — cheap and tolerates gaps in the sequence.
  const reorderService = async (serviceId: string, direction: "up" | "down") => {
    const sorted = [...services].sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return a.name.localeCompare(b.name);
    });
    const idx = sorted.findIndex((s) => s.id === serviceId);
    if (idx === -1) return;
    const neighbourIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighbourIdx < 0 || neighbourIdx >= sorted.length) return;

    const current = sorted[idx];
    const neighbour = sorted[neighbourIdx];
    const [currentOrder, neighbourOrder] =
      current.display_order === neighbour.display_order
        ? direction === "up"
          ? [neighbour.display_order - 1, neighbour.display_order]
          : [neighbour.display_order, neighbour.display_order + 1]
        : [neighbour.display_order, current.display_order];

    setSaving(true);
    const { error: err1 } = await supabase
      .from("service")
      .update({ display_order: currentOrder })
      .eq("id", current.id);
    const { error: err2 } = await supabase
      .from("service")
      .update({ display_order: neighbourOrder })
      .eq("id", neighbour.id);
    if (err1 || err2) {
      toast.error("Failed to reorder service");
    }
    await loadServices();
    setSaving(false);
  };

  const loadServiceStaff = async (serviceId: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from("staff_service")
      .select("staff_id")
      .eq("service_id", serviceId);

    if (!error && data) {
      return data.map((ss) => ss.staff_id);
    }
    return [];
  };

  const createService = async (
    service: Partial<Service>,
    selectedStaff: string[],
    options: { requireStaff?: boolean } = {},
  ) => {
    const requireStaff = options.requireStaff ?? true;

    if (!service.name || !service.duration_minutes) {
      toast.error("Please fill in all required fields");
      return false;
    }

    // Bulk CSV import inserts services without staff — eligible-staff
    // assignment happens afterwards. Interactive form stays strict so
    // operators can't accidentally create an unbookable service.
    if (requireStaff && selectedStaff.length === 0) {
      toast.error("Assign at least one staff member to this service");
      return false;
    }

    setSaving(true);
    const { data: serviceData, error } = await supabase
      .from("service")
      .insert({
        practice_id: callerPracticeId,
        name: service.name,
        description: service.description ?? null,
        duration_minutes: service.duration_minutes,
        buffer_before_minutes: service.buffer_before_minutes || 0,
        buffer_after_minutes: service.buffer_after_minutes || 0,
        color_hex: service.color_hex,
        is_active: service.is_active ?? true,
        is_publicly_bookable: service.is_publicly_bookable ?? true,
        price_pence: service.price_pence ?? null,
        treatment_type: service.treatment_type ?? "OTHER",
        is_nhs: service.is_nhs ?? false,
        nhs_band: service.is_nhs ? service.nhs_band ?? null : null,
        recall_months: service.recall_months ?? null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create service");
      setSaving(false);
      return false;
    }

    if (serviceData) {
      const staffServiceData = selectedStaff.map((staffId) => ({
        staff_id: staffId,
        service_id: serviceData.id,
        // practice_id will be filled by RLS-aware insert; we pass it via
        // serviceData.practice_id which the SELECT returned.
        practice_id: serviceData.practice_id,
      }));

      const { error: staffError } = await supabase
        .from("staff_service")
        .insert(staffServiceData);

      if (staffError) {
        toast.error("Service created but failed to assign staff");
      }
    }

    toast.success("Service created successfully");
    await loadServices();
    setSaving(false);
    return true;
  };

  const updateService = async (service: Service, selectedStaff: string[]) => {
    if (selectedStaff.length === 0) {
      toast.error("Assign at least one staff member to this service");
      return false;
    }

    setSaving(true);
    const { error } = await supabase
      .from("service")
      .update({
        name: service.name,
        description: service.description ?? null,
        duration_minutes: service.duration_minutes,
        buffer_before_minutes: service.buffer_before_minutes,
        buffer_after_minutes: service.buffer_after_minutes,
        color_hex: service.color_hex,
        is_active: service.is_active,
        is_publicly_bookable: service.is_publicly_bookable,
        price_pence: service.price_pence ?? null,
        treatment_type: service.treatment_type ?? "OTHER",
        is_nhs: service.is_nhs ?? false,
        nhs_band: service.is_nhs ? service.nhs_band ?? null : null,
        recall_months: service.recall_months ?? null,
      })
      .eq("id", service.id);

    if (error) {
      toast.error("Failed to update service");
      setSaving(false);
      return false;
    }

    // Replace staff_service rows for this service.
    await supabase.from("staff_service").delete().eq("service_id", service.id);

    const staffServiceData = selectedStaff.map((staffId) => ({
      staff_id: staffId,
      service_id: service.id,
      practice_id: service.practice_id,
    }));

    const { error: staffError } = await supabase
      .from("staff_service")
      .insert(staffServiceData);

    if (staffError) {
      toast.error("Service updated but failed to update staff assignments");
    }

    toast.success("Service updated successfully");
    await loadServices();
    setSaving(false);
    return true;
  };

  useEffect(() => {
    loadServices();
  }, []);

  return {
    services,
    loading,
    saving,
    loadServices,
    loadServiceStaff,
    createService,
    updateService,
    reorderService,
  };
}

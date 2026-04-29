import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Service } from "@/types/entities";

export function useServiceManagement() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadServices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (!error && data) {
      setServices(data as Service[]);
    }
    setLoading(false);
  };

  // Moves a service up or down in the display order. Implemented by swapping
  // the `display_order` value with its adjacent neighbour rather than
  // renumbering everything — cheap and keeps gaps in the sequence.
  const reorderService = async (serviceId: string, direction: "up" | "down") => {
    // Use a local sorted copy so we always act on the latest state.
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
    // When two services share the same order (e.g. both default 100),
    // bump the one we want on top to one less than the other.
    const [currentOrder, neighbourOrder] =
      current.display_order === neighbour.display_order
        ? direction === "up"
          ? [neighbour.display_order - 1, neighbour.display_order]
          : [neighbour.display_order, neighbour.display_order + 1]
        : [neighbour.display_order, current.display_order];

    setSaving(true);
    const { error: err1 } = await supabase
      .from("services")
      .update({ display_order: currentOrder })
      .eq("id", current.id);
    const { error: err2 } = await supabase
      .from("services")
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
    selectedStaff: string[]
  ) => {
    if (!service.name || !service.duration_minutes) {
      toast.error("Please fill in all required fields");
      return false;
    }

    if (service.requires_room && (!service.room_capacity || service.room_capacity < 1)) {
      toast.error("Please specify room capacity (minimum 1)");
      return false;
    }

    // Auto-deactivate if no staff assigned (when not all_staff_can_perform)
    let shouldActivate = service.active ?? true;
    let autoDeactivated = false;

    if (!service.all_staff_can_perform && selectedStaff.length === 0) {
      shouldActivate = false;
      autoDeactivated = true;
    }

    setSaving(true);
    const { data: serviceData, error } = await supabase
      .from("services")
      .insert({
        name: service.name,
        duration_minutes: service.duration_minutes,
        buffer_before_minutes: service.buffer_before_minutes || 0,
        buffer_after_minutes: service.buffer_after_minutes || 0,
        colour_tag: service.colour_tag,
        active: shouldActivate,
        all_staff_can_perform: service.all_staff_can_perform ?? true,
        requires_room: service.requires_room ?? false,
        room_capacity: service.requires_room ? service.room_capacity : null,
        price: service.price || 0,
        treatment_type: service.treatment_type ?? null,
        is_nhs: service.is_nhs ?? false,
        nhs_band: service.is_nhs ? (service.nhs_band ?? null) : null,
        recall_months: service.recall_months ?? null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create service");
      setSaving(false);
      return false;
    }

    // Assign staff if needed
    if (!service.all_staff_can_perform && serviceData) {
      const staffServiceData = selectedStaff.map((staffId) => ({
        staff_id: staffId,
        service_id: serviceData.id,
      }));

      const { error: staffError } = await supabase
        .from("staff_service")
        .insert(staffServiceData);

      if (staffError) {
        toast.error("Service created but failed to assign staff");
      }
    }

    if (autoDeactivated) {
      toast.success("Service created successfully", {
        description: "Service has been deactivated because no staff are assigned to it",
      });
    } else {
      toast.success("Service created successfully");
    }

    await loadServices();
    setSaving(false);
    return true;
  };

  const updateService = async (
    service: Service,
    selectedStaff: string[]
  ) => {
    if (service.requires_room && (!service.room_capacity || service.room_capacity < 1)) {
      toast.error("Please specify room capacity (minimum 1)");
      return false;
    }

    // Auto-deactivate if no staff assigned (when not all_staff_can_perform)
    let shouldActivate = service.active;
    let autoDeactivated = false;

    if (!service.all_staff_can_perform && selectedStaff.length === 0) {
      shouldActivate = false;
      autoDeactivated = true;
    }

    setSaving(true);
    const { error } = await supabase
      .from("services")
      .update({
        name: service.name,
        duration_minutes: service.duration_minutes,
        buffer_before_minutes: service.buffer_before_minutes,
        buffer_after_minutes: service.buffer_after_minutes,
        colour_tag: service.colour_tag,
        active: shouldActivate,
        all_staff_can_perform: service.all_staff_can_perform,
        requires_room: service.requires_room,
        room_capacity: service.requires_room ? service.room_capacity : null,
        price: service.price || 0,
        treatment_type: service.treatment_type ?? null,
        is_nhs: service.is_nhs ?? false,
        nhs_band: service.is_nhs ? (service.nhs_band ?? null) : null,
        recall_months: service.recall_months ?? null,
      })
      .eq("id", service.id);

    if (error) {
      toast.error("Failed to update service");
      setSaving(false);
      return false;
    }

    // Update staff assignments
    await supabase
      .from("staff_service")
      .delete()
      .eq("service_id", service.id);

    if (!service.all_staff_can_perform) {
      const staffServiceData = selectedStaff.map((staffId) => ({
        staff_id: staffId,
        service_id: service.id,
      }));

      const { error: staffError } = await supabase
        .from("staff_service")
        .insert(staffServiceData);

      if (staffError) {
        toast.error("Service updated but failed to update staff assignments");
      }
    }

    if (autoDeactivated) {
      toast.success("Service updated successfully", {
        description: "Service has been deactivated because no staff are assigned to it",
      });
    } else {
      toast.success("Service updated successfully");
    }

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

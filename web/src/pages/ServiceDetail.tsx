import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { useServiceManagement } from "@/hooks/useServiceManagement";
import { useStaff } from "@/hooks/useStaff";
import { ServiceForm } from "@/components/settings/ServiceForm";
import { PageLoading } from "@/components/PageLoading";
import type { Service } from "@/types/entities";

// Full-page create/edit screen for services. Replaces the cramped
// DetailSheet on the Services list — services have ~12 fields across
// classification, pricing, NHS, recall, buffers, eligible staff and
// visibility, so a sheet never had enough room to lay them out clearly.
//
// Routes:
//   /settings/services/new           → create mode
//   /settings/services/:serviceId    → edit mode
//
// Cancel uses navigate(-1) so the operator lands back on the exact list
// scroll position they came from. Save also pops one level so successful
// edits behave the same way.

const initialServiceState: Partial<Service> = {
  name: "",
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  color_hex: null,
  is_active: true,
  is_publicly_bookable: true,
  price_pence: null,
  treatment_type: "OTHER",
  is_nhs: false,
};

export default function ServiceDetail() {
  const { serviceId } = useParams<{ serviceId?: string }>();
  const navigate = useNavigate();
  const { loading: authLoading } = useRequireAuth();
  const {
    services,
    loading: servicesLoading,
    saving,
    createService,
    updateService,
    loadServiceStaff,
  } = useServiceManagement();
  const { staff } = useStaff(false); // include non-bookable too — eligibility is independent of rota
  const isCreate = !serviceId || serviceId === "new";

  // Local form state. Create mode starts blank from useState's initializer;
  // edit mode hydrates from the loaded service via the effect below.
  const [formState, setFormState] = useState<Partial<Service>>(initialServiceState);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  // Create mode is "hydrated" immediately — there's nothing async to wait for.
  const [hydrated, setHydrated] = useState(isCreate);

  // Find the editing service from the loaded list.
  const editingService = useMemo(
    () => (isCreate ? null : services.find((s) => s.id === serviceId) ?? null),
    [services, serviceId, isCreate],
  );

  // Hydrate the form ONLY in edit mode, ONLY when the target service appears.
  // Keying on editingService.id keeps the effect stable across re-renders —
  // crucially we DON'T depend on `loadServiceStaff` here because that
  // function gets a fresh reference on every render of useServiceManagement,
  // which would otherwise re-fire this effect on every keystroke and snap
  // formState back to the loaded service's values.
  useEffect(() => {
    if (isCreate) return;
    if (!editingService) return;
    setFormState(editingService);
    let cancelled = false;
    void (async () => {
      const ids = await loadServiceStaff(editingService.id);
      if (cancelled) return;
      setSelectedStaff(ids);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, editingService?.id]);

  const handleSubmit = async () => {
    if (isCreate) {
      const ok = await createService(formState, selectedStaff);
      if (ok) navigate(-1);
    } else if (editingService) {
      const ok = await updateService(
        { ...editingService, ...formState } as Service,
        selectedStaff,
      );
      if (ok) navigate(-1);
    }
  };

  const title = isCreate ? "New service" : (editingService?.name ?? "Service");

  // Edit mode: still loading the list or hydrating staff selection.
  if (authLoading || (!isCreate && (servicesLoading || !hydrated))) {
    return (
      <Layout title={title} onBack={() => navigate("/settings/services")}>
        <PageLoading />
      </Layout>
    );
  }

  // Edit mode but no matching service — bad URL.
  if (!isCreate && !editingService) {
    return (
      <Layout title="Service not found" onBack={() => navigate("/settings/services")}>
        <div className="bg-card rounded-lg border p-6 text-sm text-muted-foreground">
          Couldn't find that service. It may have been deleted.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={title} onBack={() => navigate("/settings/services")}>
      <ServiceForm
        service={formState}
        staff={staff}
        selectedStaff={selectedStaff}
        onServiceChange={setFormState}
        onStaffSelectionChange={setSelectedStaff}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/settings/services")}
        saving={saving}
        mode={isCreate ? "create" : "edit"}
      />
    </Layout>
  );
}

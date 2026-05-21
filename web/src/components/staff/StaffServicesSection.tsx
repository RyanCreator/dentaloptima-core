import { useEffect, useMemo, useState } from "react";
import { Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/contexts/PracticeContext";
import { useServiceManagement } from "@/hooks/useServiceManagement";
import { useNhsEligibleStaffIds } from "@/hooks/useNhsEligibleStaffIds";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageLoading } from "@/components/PageLoading";
import { formatPrice } from "@/types/entities";

// Bulk-assign services to a single clinician — the reverse direction of
// ServiceForm's Staff tab. An admin can tick / untick any number of
// services for this staff member and save once. Without this surface,
// onboarding a new clinician means opening every service one by one to
// add them to the eligible-staff list.
//
// NHS gating mirrors the service form: if this clinician doesn't have an
// active NHS performer registration, every NHS service is disabled.
// Already-assigned NHS services without an active registration appear
// with an amber warning so the admin can review.

interface StaffServicesSectionProps {
  staffId: string;
  // Only OWNER/ADMIN can mutate staff_service via RLS. Non-admins see the
  // list read-only — useful for clinicians checking what they're assigned to.
  isAdmin: boolean;
}

export function StaffServicesSection({ staffId, isAdmin }: StaffServicesSectionProps) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;

  const { services, loading: servicesLoading } = useServiceManagement();
  const { eligibleSet: nhsEligibleSet } = useNhsEligibleStaffIds();
  const isStaffNhsEligible = nhsEligibleSet.has(staffId);

  // Initial assignments loaded from staff_service. Tracked separately from
  // the local `selected` set so we can diff on save and only INSERT/DELETE
  // the rows that actually changed.
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("staff_service")
        .select("service_id")
        .eq("staff_id", staffId);
      if (cancelled) return;
      if (error) {
        logger.error("Failed to load staff service assignments", error);
        toast.error("Failed to load service assignments");
      } else {
        const ids = new Set((data ?? []).map((r) => r.service_id as string));
        setInitialIds(ids);
        setSelected(ids);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const toggle = (serviceId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(serviceId);
      else next.delete(serviceId);
      return next;
    });
  };

  const dirty = useMemo(() => {
    if (selected.size !== initialIds.size) return true;
    for (const id of selected) if (!initialIds.has(id)) return true;
    return false;
  }, [selected, initialIds]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const toInsert = [...selected].filter((id) => !initialIds.has(id));
      const toDelete = [...initialIds].filter((id) => !selected.has(id));

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("staff_service").insert(
          toInsert.map((service_id) => ({
            practice_id: practiceId,
            staff_id: staffId,
            service_id,
          })),
        );
        if (insErr) throw insErr;
      }
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("staff_service")
          .delete()
          .eq("staff_id", staffId)
          .in("service_id", toDelete);
        if (delErr) throw delErr;
      }

      setInitialIds(new Set(selected));
      toast.success("Services updated");
    } catch (err) {
      logger.error("Failed to update services", err);
      toast.error("Failed to update services");
    } finally {
      setSaving(false);
    }
  };

  // Active services only — inactive ones aren't bookable so there's no
  // reason to assign them. Admins can flip them back to active first if
  // they want to assign someone.
  const activeServices = useMemo(() => services.filter((s) => s.is_active), [services]);

  // Already-assigned NHS services without an active performer registration
  // — shown to the admin as an amber alert above the list.
  const assignedBlockedByNhs = useMemo(
    () =>
      activeServices.filter(
        (s) => s.is_nhs && selected.has(s.id) && !isStaffNhsEligible,
      ),
    [activeServices, selected, isStaffNhsEligible],
  );

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">Services</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tick the services this clinician is qualified to perform.
            Patients only see a service if at least one assigned clinician is available.
          </p>
        </div>
      </div>

      {!isStaffNhsEligible && activeServices.some((s) => s.is_nhs) && (
        <div className="rounded-md border border-blue-300/60 bg-blue-50/60 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-100 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-700 dark:text-blue-300" />
          <span>
            This clinician has no active NHS performer registration, so NHS
            services are disabled. Add a registration in the NHS performer
            tab to enable them.
          </span>
        </div>
      )}

      {assignedBlockedByNhs.length > 0 && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-100 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
          <span>
            {assignedBlockedByNhs.length}{" "}
            {assignedBlockedByNhs.length === 1 ? "NHS service is" : "NHS services are"}{" "}
            currently assigned but this clinician has no active NHS performer
            registration. Either add a registration or unassign them before
            submitting NHS claims.
          </span>
        </div>
      )}

      {loading || servicesLoading ? (
        <PageLoading variant="inline" label="Loading services…" />
      ) : activeServices.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No active services yet. Create services from Settings → Services first.
        </div>
      ) : (
        <div className="border rounded-md divide-y max-h-[28rem] overflow-y-auto">
          {activeServices.map((service) => {
            const checked = selected.has(service.id);
            const blocked = service.is_nhs && !isStaffNhsEligible && !checked;
            const warn = service.is_nhs && !isStaffNhsEligible && checked;
            const interactive = isAdmin && !blocked;
            return (
              <label
                key={service.id}
                className={cn(
                  "flex items-center gap-3 p-3 transition-colors",
                  blocked && "opacity-60 cursor-not-allowed",
                  !blocked && interactive && "cursor-pointer hover:bg-muted/40",
                  !blocked && !interactive && "cursor-default",
                  checked && !warn && "bg-primary/5",
                  warn && "bg-amber-50/40 dark:bg-amber-950/15",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!interactive}
                  onChange={(e) => toggle(service.id, e.target.checked)}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {service.color_hex && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: service.color_hex }}
                      />
                    )}
                    <span className="text-sm font-medium truncate">{service.name}</span>
                    {service.is_nhs && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200 px-1.5 py-0.5 rounded">
                        NHS{service.nhs_band ? ` ${service.nhs_band.replace("_", " ")}` : ""}
                      </span>
                    )}
                    {service.is_nhs && !isStaffNhsEligible && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 px-1.5 py-0.5 rounded normal-case">
                        No NHS performer
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <span>{service.duration_minutes} min</span>
                    {service.price_pence != null && service.price_pence > 0 && (
                      <span>· {formatPrice(service.price_pence)}</span>
                    )}
                    {service.treatment_type && (
                      <span className="capitalize">
                        · {service.treatment_type.replace(/_/g, " ").toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end pt-1">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save assignments"}
          </Button>
        </div>
      )}
    </div>
  );
}

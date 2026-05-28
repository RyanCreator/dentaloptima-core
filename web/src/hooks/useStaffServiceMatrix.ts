import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Per-practice map of which staff members are assigned to perform which
// services. Read from the `staff_service` join table (each row = one
// staff↔service assignment). Used by the calendar's multi-staff drag
// flow to decide if dropping an appointment on a different clinician is
// allowed — they must have every service on the appointment.

export interface StaffServiceMatrix {
  /** Set of service_ids assigned to each staff_id. */
  byStaff: Map<string, Set<string>>;
  /** Set of staff_ids assigned to each service_id. Useful for the
   *  "no eligible staff" affordance — empty set means cancel-only. */
  byService: Map<string, Set<string>>;
  loading: boolean;
}

export function useStaffServiceMatrix(): StaffServiceMatrix {
  const [byStaff, setByStaff] = useState<Map<string, Set<string>>>(new Map());
  const [byService, setByService] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("staff_service")
        .select("staff_id, service_id");
      if (cancelled) return;
      if (error) {
        logger.error("Failed to load staff_service matrix", error);
        setLoading(false);
        return;
      }
      const s = new Map<string, Set<string>>();
      const v = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        if (!row.staff_id || !row.service_id) continue;
        let staffSet = s.get(row.staff_id);
        if (!staffSet) {
          staffSet = new Set();
          s.set(row.staff_id, staffSet);
        }
        staffSet.add(row.service_id);
        let svcSet = v.get(row.service_id);
        if (!svcSet) {
          svcSet = new Set();
          v.set(row.service_id, svcSet);
        }
        svcSet.add(row.staff_id);
      }
      setByStaff(s);
      setByService(v);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { byStaff, byService, loading };
}

/** Returns true when the staff member can perform every service on the
 *  appointment (i.e. has each serviceId in their staff_service set). */
export function canStaffPerformServices(
  matrix: StaffServiceMatrix,
  staffId: string,
  serviceIds: string[],
): boolean {
  const assigned = matrix.byStaff.get(staffId);
  if (!assigned) return false;
  return serviceIds.every((id) => assigned.has(id));
}

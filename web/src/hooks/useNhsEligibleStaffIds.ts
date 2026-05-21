import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// Returns the set of practice_member ids who currently have an active NHS
// performer registration. Used by:
//   - ServiceForm > Staff tab — when service.is_nhs is on, staff outside
//     this set are disabled in the assignment list.
//   - StaffDetail > Services tab — when the viewed clinician is outside
//     this set (i.e. checking against their own id), NHS services are
//     disabled in the assignment list.
//
// "Active" means nhs_performer.is_active = true AND
//   effective_to IS NULL OR effective_to >= today
// — same definition the NHSPerformerSection uses to compute the "active"
// chip on a clinician's profile.
//
// RLS already scopes nhs_performer to current_practice_id(), so we don't
// need to filter by practice_id client-side.

export function useNhsEligibleStaffIds() {
  const [eligibleSet, setEligibleSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("nhs_performer")
      .select("staff_id, effective_to")
      .eq("is_active", true)
      .or(`effective_to.is.null,effective_to.gte.${today}`);
    if (!error && data) {
      setEligibleSet(new Set(data.map((r) => r.staff_id as string)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    // Pick up live changes — when an admin adds an NHS performer row, the
    // service form's staff list should re-enable that clinician immediately.
    const channel = supabase
      .channel(`nhs-eligible-staff-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nhs_performer" },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { eligibleSet, loading, reload };
}

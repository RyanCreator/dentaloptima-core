import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ActivityCodeRef,
  BandChargeRef,
  NhsReferenceData,
} from "@/lib/nhs/validateClaim";

// Loads the global NHS FP17 reference data (the 9000-code dictionary + band
// charges seeded in migration 0054) so the pure validator can be fed without
// doing its own I/O. This data is effectively static — it changes at most once
// a year — so we cache it hard and never refetch within a session.
//
// `country` lets callers narrow to one jurisdiction; defaults to England (the
// only seeded set today).
export function useNhsReferenceData(country: "ENGLAND" | "WALES" | "ISLE_OF_MAN" = "ENGLAND") {
  return useQuery<NhsReferenceData>({
    queryKey: ["nhs-reference-data", country],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const [codesRes, chargesRes] = await Promise.all([
        supabase
          .from("nhs_activity_code")
          .select(
            "code, value, country, label, cds_band, is_clinical_data_set, governs_uda, valid_from, valid_to",
          )
          .eq("country", country),
        supabase
          .from("nhs_band_charge")
          .select("country, band, amount_pence, valid_from, valid_to")
          .eq("country", country),
      ]);

      if (codesRes.error) throw codesRes.error;
      if (chargesRes.error) throw chargesRes.error;

      return {
        codes: (codesRes.data ?? []) as ActivityCodeRef[],
        bandCharges: (chargesRes.data ?? []) as BandChargeRef[],
      };
    },
  });
}

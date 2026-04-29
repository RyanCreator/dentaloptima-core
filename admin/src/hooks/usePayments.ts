import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

export interface PaymentEvent {
  id: string;
  tenant_id: string;
  amount_pence: number;
  paid_at: string;
  extends_paid_until_to: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
  archived_at: string | null;
}

// Note: payment_event.tenant_id is kept opaque to allow legacy registry
// payments to coexist with new dentaloptima-core payments. New payments
// store the practice.id in the tenant_id column.
export function usePayments(practiceId: string | undefined) {
  return useQuery({
    queryKey: ["payments", practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<PaymentEvent[]> => {
      const { data, error } = await supabase
        .from("payment_event")
        .select("*")
        .eq("tenant_id", practiceId!)
        .is("archived_at", null)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentEvent[];
    },
  });
}

export interface RecordPaymentInput {
  practice_id: string;
  amount_pence: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  extends_paid_until_to: string | null;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordPaymentInput): Promise<PaymentEvent> => {
      const { data, error } = await supabase
        .from("payment_event")
        .insert({
          tenant_id: input.practice_id,
          amount_pence: input.amount_pence,
          paid_at: input.paid_at,
          method: input.method,
          reference: input.reference,
          notes: input.notes,
          extends_paid_until_to: input.extends_paid_until_to,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PaymentEvent;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["payments", vars.practice_id] }),
  });
}

export function useArchivePayment(practiceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_event")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", practiceId] }),
  });
}

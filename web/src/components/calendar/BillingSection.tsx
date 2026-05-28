import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Plus, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { usePractice } from "@/contexts/PracticeContext";

// Calendar-side billing strip shown under the appointment detail when the
// status is COMPLETED. The schema uses pence-integer columns
// (total_pence, amount_paid_pence) — this component handles the
// pence↔pounds conversion at the edge so the UI reads £-formatted.

interface BillingItem {
  id: string;
  appointment_id: string;
  service_id: string | null;
  description: string;
  total_pence: number;
  amount_paid_pence: number;
  payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "WRITTEN_OFF";
  payment_method: string | null;
  service?: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  UNPAID: "bg-red-100 text-red-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  REFUNDED: "bg-purple-100 text-purple-700",
  WRITTEN_OFF: "bg-gray-100 text-gray-700",
};

// "Pay later" sits at the top so the operator can pick it without scrolling.
// Selecting it leaves the item UNPAID; any other method marks it PAID up front.
const PAYMENT_METHODS = ["Pay later", "Card", "Cash", "Bank transfer", "NHS claim", "Insurance"];

interface BillingSectionProps {
  appointmentId: string;
  serviceName?: string;
  serviceId?: string;
  /** Service price in POUNDS (caller divides pence/100 before passing). */
  servicePrice?: number;
  /** True when the linked service is NHS-flagged. */
  isNhs?: boolean;
  /** NHS band ("1"/"2"/"3"/"URGENT"/etc) — required when isNhs is true. */
  nhsBand?: string | null;
}

function pounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function BillingSection({
  appointmentId,
  serviceName,
  serviceId,
  servicePrice,
  isNhs,
  nhsBand,
}: BillingSectionProps) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [items, setItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", payment_method: "Card" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billing_item")
      .select(
        "id, appointment_id, service_id, description, total_pence, amount_paid_pence, payment_status, payment_method, service:service_id(name)",
      )
      .eq("appointment_id", appointmentId)
      .is("deleted_at", null)
      .order("created_at");
    if (error) logger.error("Error loading billing", error);
    else setItems((data ?? []) as unknown as BillingItem[]);
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addItem = async () => {
    const amountPounds = parseFloat(form.amount);
    if (!form.description.trim() || Number.isNaN(amountPounds) || amountPounds <= 0) return;

    // Need patient_id for the billing_item insert (NOT NULL). Fetch from
    // the appointment in the same tick to avoid plumbing it through props.
    const { data: appt, error: apptErr } = await supabase
      .from("appointment")
      .select("patient_id")
      .eq("id", appointmentId)
      .maybeSingle();
    if (apptErr || !appt) {
      toast.error("Couldn't load appointment for billing");
      return;
    }

    const totalPence = Math.round(amountPounds * 100);
    const payLater = form.payment_method === "Pay later";
    // NHS billing items must have a band — DB check constraint is
    // (NOT (is_nhs AND nhs_band IS NULL)). If the service is NHS-flagged but
    // doesn't carry a band yet, record as private rather than failing the
    // insert; the proper home for NHS-band capture is the FP17 claim flow.
    const recordAsNhs = !!isNhs && !!nhsBand;
    const { error } = await supabase.from("billing_item").insert({
      practice_id: practiceId,
      patient_id: appt.patient_id,
      appointment_id: appointmentId,
      service_id: serviceId || null,
      description: form.description.trim(),
      unit_price_pence: totalPence,
      total_pence: totalPence,
      amount_paid_pence: payLater ? 0 : totalPence,
      payment_status: payLater ? "UNPAID" : "PAID",
      payment_method: form.payment_method,
      is_nhs: recordAsNhs,
      nhs_band: recordAsNhs ? nhsBand : null,
    });

    if (error) {
      toast.error("Failed to add billing item");
    } else {
      setShowAdd(false);
      setForm({ description: "", amount: "", payment_method: "Card" });
      await load();
    }
  };

  const markPaid = async (item: BillingItem) => {
    const { error } = await supabase
      .from("billing_item")
      .update({
        amount_paid_pence: item.total_pence,
        payment_status: "PAID",
      })
      .eq("id", item.id);
    if (error) toast.error("Failed to update payment");
    else {
      toast.success("Payment recorded");
      await load();
    }
  };

  const totalPence = items.reduce((sum, i) => sum + i.total_pence, 0);
  const totalPaidPence = items.reduce((sum, i) => sum + i.amount_paid_pence, 0);
  const outstandingPence = totalPence - totalPaidPence;

  return (
    <div className="space-y-3 pt-3 border-t">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Billing</h4>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setForm({
              description: serviceName || "",
              amount: servicePrice != null ? servicePrice.toFixed(2) : "",
              payment_method: "Card",
            });
            setShowAdd(true);
          }}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">No billing items</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{item.description}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">£{pounds(item.total_pence)}</span>
                    {item.payment_method && (
                      <span className="text-[10px] text-muted-foreground">{item.payment_method}</span>
                    )}
                    {item.amount_paid_pence > 0 && item.amount_paid_pence < item.total_pence && (
                      <span className="text-[10px] text-muted-foreground">
                        (£{pounds(item.amount_paid_pence)} paid)
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    STATUS_COLORS[item.payment_status] || ""
                  }`}
                >
                  {item.payment_status.replace("_", " ")}
                </span>
                {item.payment_status !== "PAID" && item.payment_status !== "REFUNDED" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markPaid(item)}
                    className="h-6 text-[10px] px-2 text-green-700 shrink-0"
                    title="Mark paid (cash, card-in-person, etc.)"
                  >
                    Mark paid
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-4 text-xs pt-1">
            <span>
              Total: <span className="font-medium">£{pounds(totalPence)}</span>
            </span>
            {outstandingPence > 0 && (
              <span className="text-red-600">
                Outstanding: <span className="font-medium">£{pounds(outstandingPence)}</span>
              </span>
            )}
          </div>
        </>
      )}

      {showAdd && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="h-8 text-xs"
                placeholder="Service description"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (£)</Label>
              <Input
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-8 text-xs"
                type="number"
                step="0.01"
                min="0"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment method</Label>
            <Select
              value={form.payment_method}
              onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={addItem}
              disabled={!form.description.trim() || !form.amount}
              className="h-7 text-xs"
            >
              Add Item
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAdd(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

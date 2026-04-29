import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Plus, CreditCard, Send, Receipt } from "lucide-react";
import { toast } from "sonner";

interface BillingItem {
  id: string;
  appointment_id: string;
  service_id: string | null;
  description: string;
  amount: number;
  amount_paid: number;
  payment_status: string;
  payment_method: string | null;
  invoice_number: string | null;
  invoice_sent_at: string | null;
  notes: string | null;
  service?: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  UNPAID: "bg-red-100 text-red-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  REFUNDED: "bg-purple-100 text-purple-700",
  WRITTEN_OFF: "bg-gray-100 text-gray-700",
};

interface BillingSectionProps {
  appointmentId: string;
  serviceName?: string;
  serviceId?: string;
  servicePrice?: number;
}

export function BillingSection({ appointmentId, serviceName, serviceId, servicePrice }: BillingSectionProps) {
  const [items, setItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", payment_method: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billing_item")
      .select("*, service:service_id(name)")
      .eq("appointment_id", appointmentId)
      .order("created_at");

    if (error) logger.error("Error loading billing", error);
    else setItems(data || []);
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    const amount = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amount) || amount <= 0) return;

    const { error } = await supabase.from("billing_item").insert({
      appointment_id: appointmentId,
      service_id: serviceId || null,
      description: form.description.trim(),
      amount,
      payment_method: form.payment_method || null,
    });

    if (error) {
      toast.error("Failed to add billing item");
    } else {
      setShowAdd(false);
      setForm({ description: "", amount: "", payment_method: "" });
      await load();
    }
  };

  const markPaid = async (itemId: string, amount: number) => {
    const { error } = await supabase
      .from("billing_item")
      .update({ amount_paid: amount, payment_status: "PAID", paid_at: new Date().toISOString() })
      .eq("id", itemId);

    if (error) toast.error("Failed to update payment");
    else { toast.success("Payment recorded"); await load(); }
  };

  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);

  // Calls the send-invoice edge function. The function mints an invoice
  // number if the row doesn't already have one, creates a Stripe Checkout
  // session, and emails the patient with the pay link. We just refresh
  // afterwards so the new invoice_number / invoice_sent_at appear in the UI.
  const sendInvoice = async (itemId: string) => {
    setSendingInvoice(itemId);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice", {
        body: { billing_item_id: itemId },
      });
      if (error) {
        const fnMessage =
          (data as { error?: string } | null)?.error ?? error.message ?? "Failed to send invoice";
        toast.error(fnMessage);
        return;
      }
      if (!data?.success) {
        toast.error(data?.error ?? "Failed to send invoice");
        return;
      }
      toast.success(`Invoice ${data.invoice_number} sent`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setSendingInvoice(null);
    }
  };

  const total = items.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPaid = items.reduce((sum, i) => sum + Number(i.amount_paid), 0);
  const outstanding = total - totalPaid;

  return (
    <div className="space-y-3 pt-3 border-t">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Billing</h4>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          setForm({
            description: serviceName || "",
            amount: servicePrice?.toString() || "",
            payment_method: "",
          });
          setShowAdd(true);
        }} className="h-7 text-xs">
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
            {items.map((item) => {
              const canSendInvoice = item.payment_status !== "PAID" && Number(item.amount) > 0;
              const isSendingThis = sendingInvoice === item.id;
              return (
                <div key={item.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium">{item.description}</span>
                      {item.invoice_number && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                          <Receipt className="h-3 w-3" />
                          {item.invoice_number}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">£{Number(item.amount).toFixed(2)}</span>
                      {item.payment_method && (
                        <span className="text-[10px] text-muted-foreground capitalize">{item.payment_method.replace("_", " ")}</span>
                      )}
                      {item.invoice_sent_at && item.payment_status !== "PAID" && (
                        <span className="text-[10px] text-blue-600">Invoice sent</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STATUS_COLORS[item.payment_status] || ""}`}>
                    {item.payment_status.replace("_", " ")}
                  </span>
                  {canSendInvoice && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => sendInvoice(item.id)}
                      disabled={isSendingThis}
                      className="h-6 text-[10px] px-2 text-blue-700 shrink-0"
                      title={item.invoice_sent_at ? "Resend with a fresh pay link" : "Email invoice with Stripe pay link"}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      {isSendingThis ? "Sending…" : item.invoice_sent_at ? "Resend" : "Send invoice"}
                    </Button>
                  )}
                  {item.payment_status === "UNPAID" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markPaid(item.id, Number(item.amount))}
                      className="h-6 text-[10px] px-2 text-green-700 shrink-0"
                      title="Mark paid manually (cash, card-in-person, etc.)"
                    >
                      Mark paid
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Totals */}
          {items.length > 0 && (
            <div className="flex justify-end gap-4 text-xs pt-1">
              <span>Total: <span className="font-medium">£{total.toFixed(2)}</span></span>
              {outstanding > 0 && (
                <span className="text-red-600">Outstanding: <span className="font-medium">£{outstanding.toFixed(2)}</span></span>
              )}
            </div>
          )}
        </>
      )}

      {/* Add item inline form */}
      {showAdd && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-8 text-xs" placeholder="Service description" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (£)</Label>
              <Input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="h-8 text-xs" type="number" step="0.01" min="0" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment method</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="nhs_claim">NHS claim</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addItem} disabled={!form.description.trim() || !form.amount} className="h-7 text-xs">Add Item</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

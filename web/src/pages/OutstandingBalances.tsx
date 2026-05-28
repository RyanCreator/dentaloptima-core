import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, User } from "lucide-react";
import { logger } from "@/lib/logger";

// All open balances. Lands here from the dashboard "Outstanding Balance"
// card. Each row is one billing_item that's UNPAID or PARTIALLY_PAID —
// the operator can mark it paid inline (with a payment method) without
// leaving the page. Click anywhere else on the row to jump to the patient.

const PAYMENT_METHODS = ["Cash", "Card", "Bank transfer", "Other"];

interface OutstandingRow {
  id: string;
  description: string;
  total_pence: number;
  amount_paid_pence: number;
  payment_status: "UNPAID" | "PARTIALLY_PAID";
  payment_method: string | null;
  created_at: string;
  patient: { id: string; full_name: string; phone: string | null } | null;
  appointment: { id: string; starts_at: string } | null;
}

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

export default function OutstandingBalances() {
  const { loading: authLoading } = useRequireAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<OutstandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingRow, setPayingRow] = useState<OutstandingRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billing_item")
      .select(
        `id, description, total_pence, amount_paid_pence, payment_status, payment_method, created_at,
         patient:patient_id (id, full_name, phone),
         appointment:appointment_id (id, starts_at)`,
      )
      .in("payment_status", ["UNPAID", "PARTIALLY_PAID"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      logger.error("Failed to load outstanding balances", error);
    } else if (data) {
      setRows(data as unknown as OutstandingRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading) {
    return (
      <Layout title="Outstanding balance">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Layout>
    );
  }

  const totalOutstanding = rows.reduce(
    (sum, r) => sum + (r.total_pence - r.amount_paid_pence),
    0,
  );

  return (
    <Layout
      title="Outstanding balance"
      description={
        rows.length === 0
          ? "Nothing outstanding — all caught up."
          : `${rows.length} unpaid item${rows.length === 1 ? "" : "s"} · ${pence(totalOutstanding)} total`
      }
    >
      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No outstanding balances"
          body="When a treatment is recorded as 'Pay later' or left unpaid, it'll appear here so you can chase it."
        />
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {rows.map((row) => {
            const owed = row.total_pence - row.amount_paid_pence;
            return (
              <div
                key={row.id}
                className="flex items-center gap-3 p-4 hover:bg-accent/30 transition-colors"
              >
                <button
                  onClick={() =>
                    row.patient && navigate(`/patients/${row.patient.id}`)
                  }
                  className="flex-1 min-w-0 text-left"
                  title="Open patient record"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {row.patient?.full_name ?? "Unknown patient"}
                    </span>
                    {row.payment_status === "PARTIALLY_PAID" && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                        Part-paid
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {row.description}
                    {row.appointment && (
                      <>
                        {" · "}
                        {format(new Date(row.appointment.starts_at), "d MMM")}
                      </>
                    )}
                    {row.payment_method && (
                      <>
                        {" · "}
                        <span className="italic">{row.payment_method}</span>
                      </>
                    )}
                    {" · "}
                    <span title={new Date(row.created_at).toLocaleString()}>
                      billed {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </span>
                  </p>
                </button>
                <div className="text-right shrink-0">
                  <div className="font-mono font-semibold tabular-nums">
                    {pence(owed)}
                  </div>
                  {row.amount_paid_pence > 0 && (
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      of {pence(row.total_pence)}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => setPayingRow(row)}
                  className="shrink-0"
                >
                  <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                  Mark paid
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <MarkPaidDialog
        row={payingRow}
        onOpenChange={(open) => !open && setPayingRow(null)}
        onPaid={() => {
          setPayingRow(null);
          load();
        }}
      />
    </Layout>
  );
}

interface MarkPaidDialogProps {
  row: OutstandingRow | null;
  onOpenChange: (open: boolean) => void;
  onPaid: () => void;
}

function MarkPaidDialog({ row, onOpenChange, onPaid }: MarkPaidDialogProps) {
  const owed = row ? row.total_pence - row.amount_paid_pence : 0;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Card");
  const [busy, setBusy] = useState(false);

  // Reset form whenever the dialog opens for a different row — the
  // amount field defaults to the full outstanding balance, the method
  // re-defaults to Card.
  useEffect(() => {
    if (row) {
      setAmount((owed / 100).toFixed(2));
      setMethod(row.payment_method ?? "Card");
    }
  }, [row, owed]);

  async function handlePay() {
    if (!row) return;
    const pounds = parseFloat(amount);
    if (Number.isNaN(pounds) || pounds <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const newPaymentPence = Math.round(pounds * 100);
    const newAmountPaid = row.amount_paid_pence + newPaymentPence;
    // Decide the new payment_status from the totals — partial if the
    // top-up doesn't cover the balance, paid if it meets/exceeds it.
    const newStatus = newAmountPaid >= row.total_pence ? "PAID" : "PARTIALLY_PAID";

    setBusy(true);
    try {
      const { error } = await supabase
        .from("billing_item")
        .update({
          amount_paid_pence: Math.min(newAmountPaid, row.total_pence),
          payment_status: newStatus,
          payment_method: method,
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(
        newStatus === "PAID"
          ? `Marked paid — £${pounds.toFixed(2)}`
          : `Recorded £${pounds.toFixed(2)} — balance ${pence(row.total_pence - newAmountPaid)} outstanding`,
      );
      onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {row?.patient?.full_name ?? "Patient"} · {row?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount received (£)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Outstanding: {pence(owed)}. Enter less to record a partial payment.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-method">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handlePay} disabled={busy}>
            {busy ? "Recording…" : `Record £${parseFloat(amount || "0").toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

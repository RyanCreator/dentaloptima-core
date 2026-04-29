import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRecordPayment } from "@/hooks/usePayments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practiceId: string;
  practiceName?: string;
}

export function RecordPaymentDialog({ open, onOpenChange, practiceId, practiceName }: Props) {
  const record = useRecordPayment();
  const [amount, setAmount] = useState("295.00");
  const [paidAt, setPaidAt] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [extendsTo, setExtendsTo] = useState("");

  function reset() {
    setAmount("295.00");
    setPaidAt(format(new Date(), "yyyy-MM-dd"));
    setMethod("bank_transfer");
    setReference("");
    setNotes("");
    setExtendsTo("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const pounds = parseFloat(amount);
    if (!Number.isFinite(pounds) || pounds < 0) {
      toast.error("Invalid amount");
      return;
    }
    try {
      await record.mutateAsync({
        practice_id: practiceId,
        amount_pence: Math.round(pounds * 100),
        paid_at: new Date(paidAt).toISOString(),
        method: method || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        extends_paid_until_to: extendsTo ? new Date(extendsTo).toISOString() : null,
      });
      toast.success("Payment recorded.");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {practiceName ? `From ${practiceName}.` : ""} Amounts in £.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount (£)</Label>
              <Input id="pay-amount" type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} disabled={record.isPending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Paid on</Label>
              <Input id="pay-date" type="date" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} disabled={record.isPending} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <Select value={method} onValueChange={setMethod} disabled={record.isPending}>
              <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="direct_debit">Direct debit</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} disabled={record.isPending} placeholder="Bank reference, invoice #, etc" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-extends">Extends paid period to (optional)</Label>
            <Input id="pay-extends" type="date" value={extendsTo} onChange={(e) => setExtendsTo(e.target.value)} disabled={record.isPending} />
            <p className="text-xs text-muted-foreground">Leave blank if this isn't a subscription extension.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes (optional)</Label>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={record.isPending} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>Cancel</Button>
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

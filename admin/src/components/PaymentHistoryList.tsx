import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePayments, useArchivePayment, type PaymentEvent } from "@/hooks/usePayments";
import { Button } from "@/components/ui/button";

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  direct_debit: "Direct debit",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};

export function PaymentHistoryList({ practiceId }: { practiceId: string }) {
  const { data, isLoading } = usePayments(practiceId);
  const archive = useArchivePayment(practiceId);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading payments…</div>;
  if (!data || data.length === 0) {
    return <div className="text-sm text-muted-foreground italic">No payments recorded yet.</div>;
  }

  const total = data.reduce((sum, p) => sum + p.amount_pence, 0);

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {data.length} payment{data.length === 1 ? "" : "s"} · £{(total / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })} total
      </div>
      <div className="border rounded-lg bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Date</th>
              <th className="text-right font-medium px-3 py-2">Amount</th>
              <th className="text-left font-medium px-3 py-2">Method</th>
              <th className="text-left font-medium px-3 py-2">Reference</th>
              <th className="text-left font-medium px-3 py-2">Extends to</th>
              <th className="text-right font-medium px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((p: PaymentEvent) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {format(new Date(p.paid_at), "d MMM yyyy")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  £{(p.amount_pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.method ? METHOD_LABELS[p.method] ?? p.method : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.reference ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {p.extends_paid_until_to ? format(new Date(p.extends_paid_until_to), "d MMM yyyy") : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm("Archive this payment?")) return;
                      try {
                        await archive.mutateAsync(p.id);
                        toast.success("Archived.");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                    disabled={archive.isPending}
                    title="Archive payment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

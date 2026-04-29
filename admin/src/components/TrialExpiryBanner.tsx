import { differenceInDays } from "date-fns";
import { AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Practice } from "@/hooks/useTenants";

// Renders a banner if the practice's trial is ending soon or expired.
// Hidden if status is ACTIVE / SUSPENDED / OFFBOARDED — those don't have a
// meaningful trial countdown anymore.
export function TrialExpiryBanner({ practice }: { practice: Practice }) {
  if (practice.status !== "TRIAL" || !practice.trial_ends_at) return null;

  const days = differenceInDays(new Date(practice.trial_ends_at), new Date());
  if (days > 7) return null;

  const expired = days < 0;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm",
        expired
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-amber-300/40 bg-amber-50 text-amber-900"
      )}
    >
      {expired ? <AlertOctagon className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
      <div className="flex-1">
        <div className="font-medium">
          {expired
            ? `Trial expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
            : days === 0
            ? "Trial ends today"
            : `Trial ends in ${days} day${days === 1 ? "" : "s"}`}
        </div>
        <div className="text-xs mt-0.5 opacity-80">
          {expired
            ? "Move them to ACTIVE plan + record the first payment, or set status to OFFBOARDED."
            : "Convert them to ACTIVE before the trial expires to avoid disruption."}
        </div>
      </div>
    </div>
  );
}

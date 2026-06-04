import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CompassSubmissionHelper } from "./CompassSubmissionHelper";

// Walks the receptionist through every ready-to-submit claim in turn using the
// Compass submission helper. After each claim is recorded as submitted it
// advances to the next; when the last is done it closes and reports the total.
// Closing mid-way is fine — claims already submitted keep their status.
interface Props {
  claimIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the queue finishes or is closed, so the list can refresh. */
  onDone?: () => void;
}

export function CompassSubmissionQueue({ claimIds, open, onOpenChange, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const total = claimIds.length;
  const current = open ? claimIds[idx] : null;

  const handleSubmitted = () => {
    if (idx + 1 < total) {
      setIdx(idx + 1);
    } else {
      toast.success(`All ${total} claim${total === 1 ? "" : "s"} recorded as submitted`);
      onDone?.();
      onOpenChange(false);
    }
  };

  if (!open || !current) return null;
  return (
    <CompassSubmissionHelper
      claimId={current}
      open={open}
      onOpenChange={(o) => {
        if (!o) onDone?.();
        onOpenChange(o);
      }}
      progress={total > 1 ? `${idx + 1} of ${total}` : undefined}
      onSubmitted={handleSubmitted}
    />
  );
}

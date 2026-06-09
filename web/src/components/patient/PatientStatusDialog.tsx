import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { setPatientStatus, PATIENT_INACTIVE_REASONS } from "@/lib/setPatientStatus";

export type PatientStatusMode = "inactive" | "deceased" | "reactivate";

interface Props {
  patientId: string;
  patientName: string;
  mode: PatientStatusMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful change so the caller can refresh. */
  onDone?: () => void;
}

const COPY: Record<PatientStatusMode, { title: string; desc: string; cta: string }> = {
  inactive: {
    title: "Mark patient inactive",
    desc: "Flags the patient inactive and cancels their open recalls so they're no longer chased. Their record is fully retained — this is a lifecycle flag, not deletion.",
    cta: "Mark inactive",
  },
  deceased: {
    title: "Mark patient deceased",
    desc: "Flags the patient deceased and cancels their open recalls. Their record is fully retained.",
    cta: "Mark deceased",
  },
  reactivate: {
    title: "Reactivate patient",
    desc: "Sets the patient back to active (registered). Recalls can be created again as normal.",
    cta: "Reactivate",
  },
};

export function PatientStatusDialog({ patientId, patientName, mode, open, onOpenChange, onDone }: Props) {
  const auth = useAuth();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setNote("");
    }
  }, [open]);

  const submit = async () => {
    if (mode === "inactive" && !reason) {
      toast.error("Choose a reason");
      return;
    }
    setSaving(true);
    try {
      const status = mode === "deceased" ? "DECEASED" : mode === "reactivate" ? "REGISTERED" : "INACTIVE";
      const { recallsCancelled } = await setPatientStatus({
        patientId,
        status,
        reason: mode === "inactive" ? reason : null,
        note: mode === "reactivate" ? null : note,
        actorMemberId: auth.member?.id ?? null,
      });
      toast.success(
        mode === "reactivate"
          ? "Patient reactivated"
          : `Patient marked ${mode}${recallsCancelled > 0 ? ` · ${recallsCancelled} recall${recallsCancelled === 1 ? "" : "s"} cancelled` : ""}`,
      );
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      logger.error("Set patient status failed", e);
      toast.error("Couldn't update the patient's status");
    } finally {
      setSaving(false);
    }
  };

  const copy = COPY[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{patientName}</span> — {copy.desc}
          </DialogDescription>
        </DialogHeader>

        {mode === "inactive" && (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Why are they no longer active?" />
                </SelectTrigger>
                <SelectContent>
                  {PATIENT_INACTIVE_REASONS.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. moved to Leeds, asked to be removed from recalls"
                className="min-h-[72px]"
              />
            </div>
          </div>
        )}

        {mode === "deceased" && (
          <div className="space-y-1.5 py-1">
            <Label>
              Note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            variant={mode === "reactivate" ? "default" : "destructive"}
          >
            {copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

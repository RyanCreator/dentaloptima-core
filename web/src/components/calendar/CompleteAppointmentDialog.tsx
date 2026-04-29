import { useState, useEffect } from "react";
import { Check, AlertTriangle, Heart } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CompleteAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceName: string;
  baselinePrice: number | null;
  patientName?: string;
  isPregnant?: boolean;
  takesAnticoagulant?: boolean;
  onConfirm: (actualPrice: number | null, treatmentSummary?: string) => Promise<void>;
  isUpdating: boolean;
}

export function CompleteAppointmentDialog({
  open,
  onOpenChange,
  serviceName,
  baselinePrice,
  patientName,
  isPregnant,
  takesAnticoagulant,
  onConfirm,
  isUpdating,
}: CompleteAppointmentDialogProps) {
  const [actualPrice, setActualPrice] = useState<string>("");
  const [treatmentSummary, setTreatmentSummary] = useState<string>("");

  useEffect(() => {
    if (open) {
      setActualPrice(
        baselinePrice !== null && baselinePrice !== undefined
          ? baselinePrice.toFixed(2)
          : ""
      );
      setTreatmentSummary("");
    }
  }, [open, baselinePrice]);

  const handleConfirm = async () => {
    const priceValue = actualPrice.trim() === "" ? null : parseFloat(actualPrice);
    await onConfirm(priceValue, treatmentSummary.trim() || undefined);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setActualPrice(value);
    }
  };

  const hasMedicalFlags = isPregnant || takesAnticoagulant;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            Complete Appointment
          </AlertDialogTitle>
          <AlertDialogDescription>
            {patientName
              ? `Record the treatment details for ${patientName}.`
              : "Confirm the details for this appointment."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-3 space-y-4">
          {/* Medical flag warnings */}
          {hasMedicalFlags && (
            <div className="space-y-1.5">
              {isPregnant && (
                <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Patient is pregnant — confirm treatment was appropriate</span>
                </div>
              )}
              {takesAnticoagulant && (
                <div className="flex items-center gap-2 text-sm bg-red-50 text-red-800 border border-red-200 rounded-md px-3 py-2">
                  <Heart className="h-4 w-4 shrink-0" />
                  <span>Patient takes anticoagulant — confirm bleeding risk was managed</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-sm font-medium">Service</Label>
            <p className="text-sm text-muted-foreground">{serviceName}</p>
          </div>

          {/* Treatment summary */}
          <div className="space-y-2">
            <Label htmlFor="treatment-summary" className="text-sm font-medium">
              Treatment Summary
            </Label>
            <Textarea
              id="treatment-summary"
              placeholder="Describe the treatment performed, findings, and any follow-up needed..."
              value={treatmentSummary}
              onChange={(e) => setTreatmentSummary(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Clinical record of what was done during the appointment
            </p>
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="actual-price" className="text-sm font-medium">
              Amount Charged
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                £
              </span>
              <Input
                id="actual-price"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={actualPrice}
                onChange={handlePriceChange}
                className="pl-7"
              />
            </div>
            {baselinePrice !== null && baselinePrice !== undefined && (
              <p className="text-xs text-muted-foreground">
                Standard price: £{baselinePrice.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isUpdating}
            className="bg-green-600 hover:bg-green-700"
          >
            {isUpdating ? "Completing..." : "Complete Appointment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { Eraser, PenLine, ShieldCheck } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";

// Hand-the-iPad-to-the-patient flow. The modal:
//   1. Shows a big, patient-facing instruction
//   2. Captures the signature on the canvas
//   3. On Done, uploads to the patient-files bucket
//   4. Inserts a `document` row and links it to the consent via document_id
//
// The caller (e.g. NewConsentSheet, ConsentRecordsSection) just opens this
// with the consent's patient_id + consent_id; everything else is internal.

interface SignatureCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Patient the signature is for — drives the storage path + RLS. */
  patientId: string;
  /** Consent record this signature is being attached to. */
  consentId: string;
  /** Label for the dialog body — e.g. "Privacy notice (v1.0)". */
  consentLabel: string;
  /** Called after a successful capture + upload + link. */
  onCaptured?: () => void;
}

export function SignatureCaptureDialog({
  open, onOpenChange, patientId, consentId, consentLabel, onCaptured,
}: SignatureCaptureDialogProps) {
  const auth = useAuth();
  const padRef = useRef<SignaturePadHandle>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCapture = async () => {
    if (!padRef.current || !auth.member) return;
    if (padRef.current.isEmpty()) {
      toast.error("Please sign before saving");
      return;
    }
    const blob = await padRef.current.toBlob();
    if (!blob) {
      toast.error("Couldn't read the signature — try again");
      return;
    }

    setSubmitting(true);
    try {
      const practiceId = auth.member.practice_id;
      const storagePath = `${practiceId}/${patientId}/CONSENT_FORM/${Date.now()}-signature.png`;

      const { error: uploadErr } = await supabase.storage
        .from("patient-files")
        .upload(storagePath, blob, {
          contentType: "image/png",
          upsert: false,
        });
      if (uploadErr) throw uploadErr;

      // Document row — gives the file a metadata anchor that consent_record
      // can FK to, and that DSAR exports already include.
      const { data: doc, error: docErr } = await supabase
        .from("document")
        .insert({
          practice_id: practiceId,
          patient_id: patientId,
          document_type: "CONSENT_FORM",
          title: `Signature — ${consentLabel}`,
          description: "Captured electronically on screen",
          mime_type: "image/png",
          file_size_bytes: blob.size,
          storage_bucket: "patient-files",
          storage_path: storagePath,
        })
        .select("id")
        .single();
      if (docErr || !doc) {
        // Roll back the orphan storage object so we don't leak.
        await supabase.storage.from("patient-files").remove([storagePath]);
        throw docErr ?? new Error("Document insert failed");
      }

      // Link the freshly-uploaded signature to the consent record. If the
      // link fails the file still exists in storage, but the consent loses
      // its signature pointer — log it; the practice can re-capture.
      const { error: linkErr } = await supabase
        .from("consent_record")
        .update({ document_id: doc.id })
        .eq("id", consentId);
      if (linkErr) {
        logger.error("consent signature link failed", linkErr);
        toast.error("Signature saved but couldn't link to the consent. Try again.");
      } else {
        toast.success("Signature captured");
        onOpenChange(false);
        onCaptured?.();
      }
    } catch (err) {
      logger.error("signature capture failed", err);
      toast.error(err instanceof Error ? err.message : "Couldn't save signature");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[92vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" /> Sign on screen
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">{consentLabel}</span>
            <span className="block text-xs">
              Hand the device to the patient. They sign in the box below, then
              tap Done.
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* The pad gets generous vertical space — comfortable for a wrist
            signature on an iPad in landscape. Aspect ratio holds on
            smaller viewports too. */}
        <div className="h-[260px] sm:h-[320px]">
          <SignaturePad ref={padRef} />
        </div>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" />
          The signature is stored as a PNG and linked to this consent record.
          It appears in audit + DSAR exports.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => padRef.current?.clear()}
            disabled={submitting}
          >
            <Eraser className="h-4 w-4 mr-1" /> Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleCapture} disabled={submitting}>
            {submitting ? "Saving…" : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

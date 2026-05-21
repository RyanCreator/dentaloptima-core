import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, PenLine, Eraser, X, ShieldCheck, ArrowRight,
} from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";

// Patient-hands kiosk for unsigned consents. Mounted at /kiosk/consents/:patientId
// WITHOUT the Layout chrome — the patient shouldn't see the sidebar or be
// able to navigate around the booking app. The route is auth-gated to
// practice members (the staff member starts the session, hands the iPad
// over, takes it back at the end).
//
// Flow:
//   1. Welcome screen with patient's name + practice name
//   2. For each unsigned active consent (digital/iPad method, no document_id):
//        - Show frozen consent text
//        - Capture signature on canvas
//        - Upload + link via consent_record.document_id
//   3. Done — "Please hand back to reception"
//
// "Staff: exit" pill in the corner is the way out. We don't lock the
// route programmatically — the practical security is that nothing
// sensitive is on screen besides the patient's own pending consents.

interface PatientLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}

interface PendingConsent {
  id: string;
  consent_type: string;
  consent_version: string;
  consent_text: string;
  granted_method: string;
}

const TYPE_LABEL: Record<string, string> = {
  PRIVACY_NOTICE: "Privacy notice",
  TREATMENT_GENERAL: "Treatment — general",
  TREATMENT_SPECIFIC: "Treatment — specific",
  X_RAY: "X-ray / radiograph",
  SEDATION: "Sedation",
  PHOTOGRAPHY: "Clinical photography",
  NHS_TERMS: "NHS terms of service",
  MARKETING: "Marketing communications",
  DATA_SHARING: "Data sharing",
};

export default function KioskConsents() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const tenant = usePractice();

  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [pending, setPending] = useState<PendingConsent[]>([]);
  const [stage, setStage] = useState<"loading" | "welcome" | "signing" | "done" | "error">("loading");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!patientId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const load = async () => {
    const [patientRes, consentRes] = await Promise.all([
      supabase
        .from("patient")
        .select("id, first_name, last_name, full_name")
        .eq("id", patientId!)
        .maybeSingle(),
      supabase
        .from("consent_record")
        .select("id, consent_type, consent_version, consent_text, granted_method, document_id, revoked_at, valid_until")
        .eq("patient_id", patientId!)
        .is("deleted_at", null)
        .order("granted_at", { ascending: false }),
    ]);

    if (patientRes.error || !patientRes.data) {
      logger.error("kiosk patient load failed", patientRes.error);
      setStage("error");
      return;
    }
    setPatient(patientRes.data as PatientLite);

    const today = new Date();
    const unsigned = ((consentRes.data ?? []) as Array<
      PendingConsent & { document_id: string | null; revoked_at: string | null; valid_until: string | null }
    >)
      .filter((c) => !c.document_id)
      .filter((c) => !c.revoked_at)
      .filter((c) => !c.valid_until || new Date(c.valid_until) > today)
      .filter((c) => c.granted_method === "DIGITAL_SIGNATURE" || c.granted_method === "IPAD_SIGNATURE");

    setPending(unsigned);
    setStage(unsigned.length === 0 ? "done" : "welcome");
  };

  const handleSubmitSignature = async () => {
    if (!auth.member) {
      toast.error("Staff session expired — please ask reception to restart.");
      return;
    }
    const consent = pending[currentIdx];
    if (!consent || !padRef.current) return;
    if (padRef.current.isEmpty()) {
      toast.error("Please sign before continuing");
      return;
    }

    setSubmitting(true);
    try {
      const blob = await padRef.current.toBlob();
      if (!blob) { toast.error("Couldn't capture signature"); setSubmitting(false); return; }

      const practiceId = auth.member.practice_id;
      const storagePath = `${practiceId}/${patientId}/CONSENT_FORM/${Date.now()}-kiosk-signature.png`;

      const { error: uploadErr } = await supabase.storage
        .from("patient-files")
        .upload(storagePath, blob, { contentType: "image/png", upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: doc, error: docErr } = await supabase
        .from("document")
        .insert({
          practice_id: practiceId,
          patient_id: patientId!,
          document_type: "CONSENT_FORM",
          title: `Signature — ${TYPE_LABEL[consent.consent_type] ?? consent.consent_type} v${consent.consent_version}`,
          description: "Captured in patient kiosk",
          mime_type: "image/png",
          file_size_bytes: blob.size,
          storage_bucket: "patient-files",
          storage_path: storagePath,
        })
        .select("id")
        .single();
      if (docErr || !doc) {
        await supabase.storage.from("patient-files").remove([storagePath]);
        throw docErr ?? new Error("Document insert failed");
      }

      const { error: linkErr } = await supabase
        .from("consent_record")
        .update({ document_id: doc.id })
        .eq("id", consent.id);
      if (linkErr) throw linkErr;

      padRef.current.clear();
      const nextIdx = currentIdx + 1;
      if (nextIdx >= pending.length) {
        setStage("done");
      } else {
        setCurrentIdx(nextIdx);
      }
    } catch (err) {
      logger.error("kiosk signature submit failed", err);
      toast.error("Couldn't save signature — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  // Tiny "Staff: exit" pill — patient-facing UI never has anything else
  // navigable so the corner control is the only way out.
  const exitButton = (
    <button
      onClick={() => navigate(`/patients/${patientId}`)}
      className="fixed top-3 right-3 z-50 inline-flex items-center gap-1 rounded-full border bg-card/90 backdrop-blur px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors shadow-sm"
    >
      <X className="h-3 w-3" /> Staff: exit
    </button>
  );

  if (stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (stage === "error" || !patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        {exitButton}
        <div className="text-center max-w-md space-y-2">
          <p className="text-lg font-semibold">We couldn't load this patient.</p>
          <p className="text-sm text-muted-foreground">Please hand back to reception.</p>
        </div>
      </div>
    );
  }

  const firstName = patient.first_name?.trim() || patient.full_name?.split(" ")[0] || "there";
  const total = pending.length;
  const current = pending[currentIdx];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40 flex flex-col">
      {exitButton}

      <main className="flex-1 flex items-center justify-center p-6">
        {stage === "welcome" && (
          <div className="max-w-2xl w-full text-center space-y-6">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {tenant.practice.name}
              </p>
              <h1 className="text-4xl font-semibold">Hello, {firstName}</h1>
              <p className="text-lg text-muted-foreground">
                We need your signature on {total} document{total === 1 ? "" : "s"} before your visit.
              </p>
            </div>
            <Button size="lg" onClick={() => setStage("signing")} className="h-14 px-8 text-base">
              Start <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {stage === "signing" && current && (
          <div className="max-w-3xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {currentIdx + 1} of {total}
              </p>
              <div className="flex gap-1">
                {pending.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-6 rounded-full ${i < currentIdx ? "bg-primary" : i === currentIdx ? "bg-primary/60" : "bg-muted"}`}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-5 sm:p-6 space-y-3">
              <h2 className="text-xl font-semibold">
                {TYPE_LABEL[current.consent_type] ?? current.consent_type}
              </h2>
              <p className="text-xs text-muted-foreground">Version {current.consent_version}</p>
              <div className="rounded border bg-muted/20 p-4 max-h-[28vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
                {current.consent_text}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-2">
                  <PenLine className="h-4 w-4" /> Sign below
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => padRef.current?.clear()}
                  disabled={submitting}
                  className="h-8 text-xs"
                >
                  <Eraser className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              </div>
              <div className="h-[240px] sm:h-[280px]">
                <SignaturePad ref={padRef} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={handleSubmitSignature}
                disabled={submitting}
                className="h-12 px-6"
              >
                {submitting
                  ? "Saving…"
                  : currentIdx + 1 === total
                    ? "Submit & finish"
                    : "Submit & continue"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>

            <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Your signature is stored securely and linked to your record.
            </p>
          </div>
        )}

        {stage === "done" && (
          <div className="max-w-md w-full text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold">All done</h1>
              <p className="text-muted-foreground">
                {total > 0
                  ? "Thanks for signing. Please hand the device back to reception."
                  : "Nothing to sign right now. Please hand back to reception."}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, PenLine, Eraser, X, ShieldCheck, ArrowRight, UserCheck,
} from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { ConsentMarkdown } from "@/components/ConsentMarkdown";
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
import { Input } from "@/components/ui/input";
import { format, parseISO } from "date-fns";

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
  /** Schema column is `dob`; UI label still reads "Date of birth". */
  dob: string | null;
}

// Minimum cumulative pen distance (in CSS px) below which we reject the
// signature as "not enough ink". Lets a single tap or a tiny scribble
// fail validation. Real signatures are 500+ even when scrawled. Tuned
// to be forgiving — we'd rather accept a messy real one than reject it.
const MIN_INK_LENGTH_PX = 120;

interface PendingConsent {
  id: string;
  consent_type: string;
  consent_version: string;
  consent_text: string;
  granted_method: string;
  /** Set when the row was queued from a template — drives the headline
   *  on the kiosk so the patient sees "Tooth extraction (simple)"
   *  instead of the generic "Treatment — specific" enum label. */
  template_title?: string | null;
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
  const [stage, setStage] = useState<
    "loading" | "welcome" | "identity_check" | "identity_rejected" | "signing" | "done" | "error"
  >("loading");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  // Practice's kiosk exit PIN — NULL means no PIN required. Read once on
  // mount alongside the patient + consents.
  const [exitPin, setExitPin] = useState<string | null>(null);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState(false);
  // "Forgot PIN" override — any practice member's email + password lets
  // them out without needing the PIN. Verified via supabase auth; same
  // session continues (signInWithPassword on the existing user just
  // refreshes the token).
  const [forgotOpen, setForgotOpen] = useState(false);
  const [overrideEmail, setOverrideEmail] = useState("");
  const [overridePassword, setOverridePassword] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);

  // Navigation lockdown — patient handed the device shouldn't be able to
  // browse the rest of the staff-authenticated app. Three layers:
  //   1. Replace history state on mount + push a sentinel entry so the
  //      browser back button has somewhere harmless to go (we re-push on
  //      every popstate so it can't actually leave).
  //   2. beforeunload prompt for tab close / address bar change.
  //   3. The "Staff: exit" button requires the PIN if one is configured.
  // None of this is bulletproof against a determined attacker with physical
  // device access, but it stops casual nosing — which is the realistic
  // threat. For high-security setups, recommend iPad Guided Access.
  useEffect(() => {
    // Push a sentinel so the first back-press lands here (a no-op)
    // rather than popping the kiosk URL off the stack.
    window.history.pushState({ kiosk: true }, "", window.location.href);
    const onPop = () => {
      // Patient pressed back. Re-push so the URL doesn't change and
      // they stay on the kiosk page. No toast — silent and confusing
      // is the right UX for an unauthorised navigation attempt.
      window.history.pushState({ kiosk: true }, "", window.location.href);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    // iOS Safari "swipe-back" can restore a page from the back-forward
    // cache and not always fire popstate — pageshow with persisted=true
    // catches that case and lets us re-push the sentinel.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.history.pushState({ kiosk: true }, "", window.location.href);
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!patientId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const load = async () => {
    const [patientRes, consentRes, settingRes] = await Promise.all([
      supabase
        .from("patient")
        .select("id, first_name, last_name, full_name, dob")
        .eq("id", patientId!)
        .maybeSingle(),
      supabase
        .from("consent_record")
        .select(
          `id, consent_type, consent_version, consent_text, granted_method, document_id, revoked_at, valid_until,
           template:template_id (title)`,
        )
        .eq("patient_id", patientId!)
        .is("deleted_at", null)
        .order("granted_at", { ascending: false }),
      supabase
        .from("practice_setting")
        .select("kiosk_exit_pin")
        .maybeSingle(),
    ]);

    if (patientRes.error || !patientRes.data) {
      logger.error("kiosk patient load failed", patientRes.error);
      setStage("error");
      return;
    }
    setPatient(patientRes.data as PatientLite);
    setExitPin((settingRes.data as any)?.kiosk_exit_pin ?? null);

    const today = new Date();
    const unsigned = ((consentRes.data ?? []) as Array<
      PendingConsent & {
        document_id: string | null;
        revoked_at: string | null;
        valid_until: string | null;
        template?: { title: string | null } | null;
      }
    >)
      .filter((c) => !c.document_id)
      .filter((c) => !c.revoked_at)
      .filter((c) => !c.valid_until || new Date(c.valid_until) > today)
      .filter((c) => c.granted_method === "DIGITAL_SIGNATURE" || c.granted_method === "IPAD_SIGNATURE")
      // Flatten the embedded template title onto the row so the render
      // path doesn't have to thread the optional embed.
      .map((c) => ({ ...c, template_title: c.template?.title ?? null }));

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
    // Reject single-tap "signatures" — see SignaturePad.tsx for the
    // ink-length heuristic. The threshold is forgiving (120px); a normal
    // signature scrawl comfortably clears it.
    if (padRef.current.getInkLengthPx() < MIN_INK_LENGTH_PX) {
      toast.error("Please draw your full signature");
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

  // "Staff: exit" pill. If the practice has configured a kiosk_exit_pin
  // we prompt for it before letting the user out — the kiosk runs on
  // the staff member's session, so unguarded exit would let the patient
  // browse the whole booking app.
  function attemptExit() {
    if (!exitPin) {
      navigate(`/patients/${patientId}`);
      return;
    }
    setPinAttempt("");
    setPinError(false);
    setExitDialogOpen(true);
  }
  const exitButton = (
    <button
      onClick={attemptExit}
      className="fixed top-3 right-3 z-50 inline-flex items-center gap-1 rounded-full border bg-card/90 backdrop-blur px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors shadow-sm"
    >
      <X className="h-3 w-3" /> Staff: exit
    </button>
  );

  async function attemptOverride() {
    if (!overrideEmail.trim() || !overridePassword) {
      setOverrideError("Email and password required");
      return;
    }
    setOverriding(true);
    setOverrideError(null);
    try {
      // signInWithPassword on the existing user just refreshes the token —
      // the session keeps working afterwards. If the credentials belong
      // to a different practice member, it'll switch to them which is
      // fine for the override case (the patient page handles the new
      // identity correctly). Wrong creds → toast and stay in dialog.
      const { error } = await supabase.auth.signInWithPassword({
        email: overrideEmail.trim(),
        password: overridePassword,
      });
      if (error) {
        setOverrideError("Email or password not recognised");
        return;
      }
      setExitDialogOpen(false);
      setForgotOpen(false);
      navigate(`/patients/${patientId}`);
    } catch {
      setOverrideError("Couldn't verify — try again");
    } finally {
      setOverriding(false);
    }
  }

  const exitDialog = (
    <AlertDialog
      open={exitDialogOpen}
      onOpenChange={(open) => {
        setExitDialogOpen(open);
        if (!open) {
          // Reset the override form whenever the dialog closes so a
          // fresh attempt starts from scratch.
          setForgotOpen(false);
          setOverrideEmail("");
          setOverridePassword("");
          setOverrideError(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Staff PIN</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the practice&apos;s kiosk exit PIN to leave the consent
            session.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pinAttempt}
          onChange={(e) => {
            setPinAttempt(e.target.value);
            setPinError(false);
          }}
          placeholder="••••"
          maxLength={8}
          className={pinError ? "border-destructive" : undefined}
        />
        {pinError && (
          <p className="text-xs text-destructive">Incorrect PIN.</p>
        )}

        {/* Forgot-PIN escape hatch. Opens an in-line form that takes
            any practice member's email + password — supabase auth
            verifies, and on success we exit the kiosk. Saves the
            practice from being stuck if reception forgets the PIN. */}
        {!forgotOpen ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline self-start"
            onClick={() => setForgotOpen(true)}
          >
            Forgot PIN?
          </button>
        ) : (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium">Sign in to override</p>
            <p className="text-[11px] text-muted-foreground">
              Use any practice member&apos;s email and password.
            </p>
            <Input
              type="email"
              placeholder="email@practice.co.uk"
              value={overrideEmail}
              onChange={(e) => {
                setOverrideEmail(e.target.value);
                setOverrideError(null);
              }}
              autoComplete="email"
            />
            <Input
              type="password"
              placeholder="Password"
              value={overridePassword}
              onChange={(e) => {
                setOverridePassword(e.target.value);
                setOverrideError(null);
              }}
              autoComplete="current-password"
            />
            {overrideError && (
              <p className="text-xs text-destructive">{overrideError}</p>
            )}
            <Button
              size="sm"
              onClick={attemptOverride}
              disabled={overriding}
              className="w-full"
            >
              {overriding ? "Checking…" : "Override and exit"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Or: open Dentaloptima in a separate browser tab → Settings →
              Appointment Settings → reveal or reset the PIN, then come back.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (pinAttempt === exitPin) {
                setExitDialogOpen(false);
                navigate(`/patients/${patientId}`);
              } else {
                setPinError(true);
              }
            }}
          >
            Exit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
      {exitDialog}

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
            <Button size="lg" onClick={() => setStage("identity_check")} className="h-14 px-8 text-base">
              Start <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {stage === "identity_check" && (
          <div className="max-w-xl w-full text-center space-y-6">
            <UserCheck className="h-10 w-10 text-primary mx-auto" />
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                Please confirm — is this you?
              </p>
              <h2 className="text-3xl font-semibold">
                {patient.full_name?.trim() ||
                  [patient.first_name, patient.last_name].filter(Boolean).join(" ") ||
                  "—"}
              </h2>
              {patient.dob && (
                <p className="text-base text-muted-foreground">
                  Date of birth · {format(parseISO(patient.dob), "d MMMM yyyy")}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                size="lg"
                variant="outline"
                onClick={() => setStage("identity_rejected")}
                className="h-14 px-8 text-base"
              >
                No, this isn&apos;t me
              </Button>
              <Button
                size="lg"
                onClick={() => setStage("signing")}
                className="h-14 px-8 text-base"
              >
                Yes, that&apos;s me <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground pt-2">
              If anything above is wrong, please hand the device back to reception.
            </p>
          </div>
        )}

        {stage === "identity_rejected" && (
          <div className="max-w-md w-full text-center space-y-4">
            <X className="h-10 w-10 text-amber-600 mx-auto" />
            <h2 className="text-2xl font-semibold">Please hand back to reception</h2>
            <p className="text-base text-muted-foreground">
              Reception will check the details and start your consents again.
            </p>
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
                {/* Prefer the template title when available — much more
                    informative than the generic consent_type enum label
                    ("Treatment — specific" vs "Tooth extraction (simple)"). */}
                {current.template_title ?? TYPE_LABEL[current.consent_type] ?? current.consent_type}
              </h2>
              <p className="text-xs text-muted-foreground">Version {current.consent_version}</p>
              <div className="rounded border bg-muted/20 p-4 max-h-[28vh] overflow-y-auto">
                <ConsentMarkdown body={current.consent_text} />
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

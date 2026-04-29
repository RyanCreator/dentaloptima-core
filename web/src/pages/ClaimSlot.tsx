import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Public landing page reached via the cancellation-offer email magic link.
// Patients are anonymous here — the URL token IS the credential. We POST it
// to claim-cancelled-slot, which validates + books or surfaces a friendly
// "sorry, just taken" message.
//
// No layout wrapper, no logged-in chrome — this needs to read like a clean
// confirmation page on a phone, not the staff dashboard.
type Status =
  | { kind: "loading" }
  | { kind: "success"; startsAt: string; patientName: string | null }
  | { kind: "error"; message: string };

export default function ClaimSlot() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setState({ kind: "error", message: "Missing claim token in the URL." });
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("claim-cancelled-slot", {
          body: { token },
        });
        if (cancelled) return;
        if (error) {
          // supabase-js wraps non-2xx; the function's error body is in `data`.
          const fnMessage =
            (data as { error?: string } | null)?.error ?? error.message ?? "Claim failed";
          setState({ kind: "error", message: fnMessage });
          return;
        }
        if (!data?.success) {
          setState({ kind: "error", message: data?.error ?? "Claim failed" });
          return;
        }
        setState({
          kind: "success",
          startsAt: data.starts_at,
          patientName: data.patient_name ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-6 sm:p-8 text-center">
        {state.kind === "loading" && (
          <>
            <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin mb-4" />
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">
              Claiming your slot…
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Hold tight.</p>
          </>
        )}

        {state.kind === "success" && (
          <>
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
              You're booked in
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              {state.patientName ? `${state.patientName}, your` : "Your"} appointment is
              confirmed for:
            </p>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 mb-4">
              <p className="text-base sm:text-lg font-semibold text-foreground">
                {format(new Date(state.startsAt), "EEEE, d MMMM yyyy")}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                at {format(new Date(state.startsAt), "HH:mm")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              A confirmation email is on its way. We'll see you then.
            </p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
              We couldn't claim that slot
            </h1>
            <p className="text-sm text-muted-foreground mb-4">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              You're still on the waiting list — we'll email you the next time a slot opens.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

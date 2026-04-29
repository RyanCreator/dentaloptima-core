import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  MapPin,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

// Public acceptance page reached via the magic-link in the treatment-plan
// email. The token in the URL is the credential — no Supabase auth.
//
// Three rendering states once we've fetched the plan:
//   - PROPOSED/DRAFT  → show plan + Accept / Decline buttons
//   - ACCEPTED        → "thank you" confirmation
//   - DECLINED        → "noted" confirmation
//   - other (in-progress/completed) → friendly "this plan has moved on"
//
// Decline collects an optional reason — useful for the practice to know
// whether it's a price objection vs timing vs lost interest.

interface PlanData {
  plan: {
    id: string;
    title: string;
    status: string;
    estimated_total: number | null;
    notes: string | null;
    accepted_at: string | null;
    declined_at: string | null;
  };
  patient_name: string | null;
  items: Array<{
    id: string;
    sequence: number;
    service_name: string;
    tooth_numbers: number[];
    estimated_price: number | null;
    notes: string | null;
  }>;
  practice: {
    clinic_name: string | null;
    practice_phone: string | null;
    practice_address: string | null;
    practice_website: string | null;
  } | null;
}

type Phase = "loading" | "ready" | "accepting" | "declining" | "done" | "error";

export default function TreatmentPlanAccept() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<PlanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setError("Missing token in the URL.");
        setPhase("error");
        return;
      }
      try {
        const { data: result, error: err } = await supabase.functions.invoke(
          "treatment-plan-action",
          { body: { token, action: "fetch" } }
        );
        if (cancelled) return;
        if (err) {
          const fnMsg =
            (result as { error?: string } | null)?.error ?? err.message ?? "Couldn't load";
          setError(fnMsg);
          setPhase("error");
          return;
        }
        if (!result?.success) {
          setError(result?.error ?? "Couldn't load");
          setPhase("error");
          return;
        }
        setData(result as PlanData);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
        setPhase("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submitAction(action: "accept" | "decline") {
    if (!token) return;
    setPhase(action === "accept" ? "accepting" : "declining");
    try {
      const body: Record<string, unknown> = { token, action };
      if (action === "decline" && declineReason.trim()) body.reason = declineReason.trim();
      const { data: result, error: err } = await supabase.functions.invoke(
        "treatment-plan-action",
        { body }
      );
      if (err) {
        const fnMsg =
          (result as { error?: string } | null)?.error ?? err.message ?? "Action failed";
        setError(fnMsg);
        setPhase("error");
        return;
      }
      if (!result?.success) {
        setError(result?.error ?? "Action failed");
        setPhase("error");
        return;
      }
      // Update local plan state to reflect the new status.
      if (data) {
        setData({
          ...data,
          plan: {
            ...data.plan,
            status: result.status as string,
            accepted_at: action === "accept" ? new Date().toISOString() : data.plan.accepted_at,
            declined_at: action === "decline" ? new Date().toISOString() : data.plan.declined_at,
          },
        });
      }
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPhase("error");
    }
  }

  if (phase === "loading") return <CenteredCard><Loader2 className="w-10 h-10 mx-auto text-primary animate-spin mb-4" /><p className="text-sm text-muted-foreground">Loading your treatment plan…</p></CenteredCard>;
  if (phase === "error") return <CenteredError message={error ?? "Something went wrong."} />;
  if (!data) return null;

  const { plan, patient_name, items, practice } = data;
  const clinicName = practice?.clinic_name ?? "Your practice";

  // Final-state views: short and clear.
  if (plan.status === "ACCEPTED" || phase === "done" && data.plan.status === "ACCEPTED") {
    return (
      <CenteredCard>
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold mb-2">Thanks{patient_name ? `, ${patient_name}` : ""}!</h1>
        <p className="text-sm text-muted-foreground">
          {clinicName} has been notified that you've accepted this plan. They'll be in touch
          to schedule your first appointment.
        </p>
      </CenteredCard>
    );
  }
  if (plan.status === "DECLINED") {
    return (
      <CenteredCard>
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold mb-2">Noted</h1>
        <p className="text-sm text-muted-foreground">
          We've let {clinicName} know this plan isn't right for you. If you change your mind, please get in touch.
        </p>
      </CenteredCard>
    );
  }
  if (plan.status !== "PROPOSED" && plan.status !== "DRAFT") {
    return (
      <CenteredError
        message={`This plan is ${plan.status.toLowerCase().replace("_", " ")} and can no longer be changed online. Please contact ${clinicName}.`}
      />
    );
  }

  // Live state — show the plan with Accept / Decline.
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden">
          <div className="bg-primary text-primary-foreground px-5 sm:px-7 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80 mb-1">
              {clinicName}
            </p>
            <h1 className="text-lg sm:text-xl font-bold leading-tight">{plan.title}</h1>
            {patient_name && <p className="text-sm opacity-90 mt-1">For {patient_name}</p>}
          </div>

          {/* Items */}
          <div className="px-5 sm:px-7 py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Treatment items
            </p>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No items listed yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((it) => (
                  <li key={it.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {it.sequence ? `${it.sequence}. ` : ""}
                        {it.service_name}
                      </p>
                      {it.tooth_numbers.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Tooth: {it.tooth_numbers.join(", ")}
                        </p>
                      )}
                      {it.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{it.notes}</p>
                      )}
                    </div>
                    {it.estimated_price != null && (
                      <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                        £{Number(it.estimated_price).toFixed(2)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {plan.estimated_total != null && (
              <div className="mt-4 pt-3 border-t flex items-center justify-between">
                <span className="text-sm font-semibold">Estimated total</span>
                <span className="text-xl font-bold tabular-nums">£{Number(plan.estimated_total).toFixed(2)}</span>
              </div>
            )}

            {plan.notes && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Notes from your dentist
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{plan.notes}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {!showDeclineReason ? (
            <div className="px-5 sm:px-7 py-4 border-t bg-gray-50/50 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => submitAction("accept")}
                disabled={phase === "accepting"}
                className="flex-1"
              >
                {phase === "accepting" ? "Confirming…" : "Accept this plan"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDeclineReason(true)}
                disabled={phase === "accepting"}
                className="flex-1"
              >
                Not for me
              </Button>
            </div>
          ) : (
            <div className="px-5 sm:px-7 py-4 border-t bg-gray-50/50 space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">No problem.</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Anything you'd like the practice to know? (Optional — won't change the outcome.)
                </p>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Cost is too high right now, prefer a different timing, want to think it over…"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowDeclineReason(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => submitAction("decline")}
                  disabled={phase === "declining"}
                  className="flex-1"
                >
                  {phase === "declining" ? "Sending…" : "Confirm decline"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Practice contact */}
        {practice && (practice.practice_phone || practice.practice_address || practice.practice_website) && (
          <div className="mt-5 rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
            <p className="text-sm font-semibold mb-3">Questions about this plan?</p>
            <div className="space-y-2 text-sm">
              {practice.practice_phone && (
                <a
                  href={`tel:${practice.practice_phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 text-foreground hover:text-primary"
                >
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {practice.practice_phone}
                </a>
              )}
              {practice.practice_website && (
                <a
                  href={practice.practice_website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-foreground hover:text-primary"
                >
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  {practice.practice_website}
                </a>
              )}
              {practice.practice_address && (
                <div className="flex items-start gap-2 text-muted-foreground text-xs">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{practice.practice_address}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-6 sm:p-8 text-center">
        {children}
      </div>
    </div>
  );
}

function CenteredError({ message }: { message: string }) {
  return (
    <CenteredCard>
      <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-bold mb-2">We couldn't show this plan</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </CenteredCard>
  );
}

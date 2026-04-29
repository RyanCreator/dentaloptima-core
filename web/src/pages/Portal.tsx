import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  CreditCard,
  LogOut,
  X,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// =============================================================================
// Patient self-service portal — magic-link auth, no Supabase user
// =============================================================================
// Three routes share this file:
//   /portal             → login form (or dashboard if a session token is in
//                         sessionStorage)
//   /portal/auth/:token → consume token from email link, persist to session,
//                         redirect to /portal
//   /portal/* (logged in)
// We store the token in sessionStorage rather than localStorage so closing
// the browser ends the session — patients are often on shared/family devices.
// =============================================================================

const STORAGE_KEY = "dentaloptima_portal_token";

interface PortalSessionData {
  patient: { id: string; full_name: string; email: string | null; phone: string | null };
  upcoming_appointments: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    service: { name: string } | null;
    staff: { full_name: string } | null;
  }>;
  outstanding_balance: number;
  outstanding_items: Array<{
    id: string;
    description: string;
    amount: number;
    amount_paid: number;
    invoice_number: string | null;
    appointment_starts_at: string | null;
  }>;
  practice: {
    clinic_name: string | null;
    practice_phone: string | null;
    practice_address: string | null;
    practice_website: string | null;
  } | null;
}

function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable — portal won't persist across navigation
    // but the in-memory React state still works for the current page.
  }
}

// ----- Magic-link entry from email --------------------------------------------

export function PortalAuthEntry() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing token in the URL.");
      return;
    }
    // Optimistically store + redirect. The session loader on /portal will
    // detect an invalid token and show an error if the link is bad.
    setStoredToken(token);
    navigate("/portal", { replace: true });
  }, [token, navigate]);

  if (error) return <CenteredError message={error} />;
  return (
    <CenteredCard>
      <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin mb-4" />
      <h1 className="text-lg font-semibold">Signing you in…</h1>
    </CenteredCard>
  );
}

// ----- Main portal page (login or dashboard) ---------------------------------

export default function Portal() {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [data, setData] = useState<PortalSessionData | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(token));
  const [sessionError, setSessionError] = useState<string | null>(null);

  const loadSession = useCallback(async (sessionToken: string) => {
    setLoading(true);
    setSessionError(null);
    try {
      const { data: result, error } = await supabase.functions.invoke("portal-action", {
        body: { token: sessionToken, action: "session" },
      });
      if (error) {
        // supabase-js wraps non-2xx; the function's error body is in `data`.
        const fnMsg =
          (result as { error?: string } | null)?.error ??
          error.message ??
          "Something went wrong";
        throw new Error(fnMsg);
      }
      if (!result?.success) throw new Error(result?.error ?? "Session failed");
      setData(result as PortalSessionData);
    } catch (err) {
      // Bad/expired token — clear it so we drop back to the login form.
      const msg = err instanceof Error ? err.message : "Session failed";
      setSessionError(msg);
      setStoredToken(null);
      setToken(null);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadSession(token);
  }, [token, loadSession]);

  function handleLogout() {
    if (token) {
      supabase.functions.invoke("portal-action", {
        body: { token, action: "logout" },
      });
    }
    setStoredToken(null);
    setToken(null);
    setData(null);
  }

  if (token && loading) {
    return (
      <CenteredCard>
        <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Loading your account…</p>
      </CenteredCard>
    );
  }

  if (!token || !data) {
    return <PortalLogin previousError={sessionError} />;
  }

  return (
    <PortalDashboard
      data={data}
      token={token}
      onLogout={handleLogout}
      onRefresh={() => loadSession(token)}
    />
  );
}

// ----- Login form -------------------------------------------------------------

function PortalLogin({ previousError }: { previousError: string | null }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await supabase.functions.invoke("request-portal-link", {
        body: { email: email.trim() },
      });
      // Always claim success — the function returns the same response either way.
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <CenteredCard>
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold mb-2">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          If we have your email on file, a sign-in link is on its way. The link is valid for 7 days.
        </p>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <h1 className="text-xl font-bold mb-1">Your account</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Enter the email address on your patient record. We'll email you a sign-in link.
      </p>
      {previousError && (
        <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 mb-4 text-left">
          {previousError}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3 text-left">
        <div className="space-y-1.5">
          <Label htmlFor="portal-email">Email address</Label>
          <Input
            id="portal-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={submitting || !email.trim()} className="w-full">
          {submitting ? "Sending…" : "Send me a link"}
        </Button>
      </form>
    </CenteredCard>
  );
}

// ----- Logged-in dashboard ----------------------------------------------------

function PortalDashboard({
  data,
  token,
  onLogout,
  onRefresh,
}: {
  data: PortalSessionData;
  token: string;
  onLogout: () => void;
  onRefresh: () => void;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function cancelAppointment(appointmentId: string) {
    if (!confirm("Cancel this appointment? You'll need to rebook if you change your mind.")) {
      return;
    }
    setCancellingId(appointmentId);
    try {
      const { data: result, error } = await supabase.functions.invoke("portal-action", {
        body: { token, action: "cancel", appointment_id: appointmentId },
      });
      if (error || !result?.success) {
        const fnMsg = (result as { error?: string } | null)?.error ?? error?.message ?? "Cancel failed";
        toast.error(fnMsg);
        return;
      }
      toast.success("Appointment cancelled");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingId(null);
    }
  }

  const clinicName = data.practice?.clinic_name ?? "Your practice";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {clinicName}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Hello, {data.patient.full_name}
            </h1>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground">
            <LogOut className="w-4 h-4 mr-1.5" />
            Sign out
          </Button>
        </div>

        {/* Outstanding balance card */}
        {data.outstanding_balance > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 sm:p-5 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-800">Outstanding balance</p>
                <p className="text-2xl font-bold text-amber-900 tabular-nums">
                  £{data.outstanding_balance.toFixed(2)}
                </p>
                <p className="text-xs text-amber-700/90 mt-1">
                  We've sent you payment links by email. If you don't have one, please get in touch with the practice.
                </p>
                {data.outstanding_items.length > 0 && (
                  <ul className="text-xs text-amber-900 mt-3 space-y-1">
                    {data.outstanding_items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {it.invoice_number ? `${it.invoice_number}: ` : ""}
                          {it.description}
                        </span>
                        <span className="tabular-nums shrink-0 font-medium">
                          £{(it.amount - it.amount_paid).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Upcoming appointments */}
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden mb-5">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-200 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Your upcoming appointments</h2>
          </div>
          {data.upcoming_appointments.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              You have no upcoming appointments.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.upcoming_appointments.map((apt) => (
                <li key={apt.id} className="px-4 sm:px-5 py-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {format(new Date(apt.starts_at), "EEEE, d MMMM yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {format(new Date(apt.starts_at), "HH:mm")} ·{" "}
                      {apt.service?.name ?? "Appointment"} ·{" "}
                      {apt.staff?.full_name ?? "Our team"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelAppointment(apt.id)}
                    disabled={cancellingId === apt.id}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    {cancellingId === apt.id ? "Cancelling…" : "Cancel"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Practice contact card */}
        {data.practice && (
          <div className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
            <p className="text-sm font-semibold text-foreground mb-3">
              Need to reschedule or have a question?
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              To move an appointment to a new date, please get in touch with the practice.
            </p>
            <div className="space-y-2 text-sm">
              {data.practice.practice_phone && (
                <a
                  href={`tel:${data.practice.practice_phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
                >
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {data.practice.practice_phone}
                </a>
              )}
              {data.patient.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span className="text-xs">Reply to any email we've sent you.</span>
                </div>
              )}
              {data.practice.practice_address && (
                <div className="flex items-start gap-2 text-muted-foreground text-xs">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{data.practice.practice_address}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Helpers ----------------------------------------------------------------

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
      <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </CenteredCard>
  );
}

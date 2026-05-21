import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Single landing pad for every Supabase auth-by-email flow:
//   - Invitation acceptance (auth.admin.inviteUserByEmail) → user has a
//     session but no password yet → show set-password form
//   - Password recovery (auth.resetPasswordForEmail) → same form
//   - Magic link sign-in (auth.signInWithOtp) → just redirect to /
//
// Supabase's default email links carry the access token in the URL hash
// (#access_token=...&type=invite). The supabase-js client picks this up
// automatically via `detectSessionInUrl` on its first read of window.location,
// so by the time this component mounts we usually already have a session.
//
// We listen on `onAuthStateChange` for the explicit PASSWORD_RECOVERY event
// (Supabase emits it for both reset-password AND invite flows in v2) and
// branch on the URL hash's `type` for the SIGNED_IN case.

type Mode = "loading" | "set_password" | "redirecting" | "expired" | "error";

function readHashType(): string | null {
  // Supabase puts query-style params after the hash: #access_token=...&type=invite
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  return new URLSearchParams(hash).get("type");
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;

    // SIGNED_IN fires first when supabase-js processes the URL hash, then
    // PASSWORD_RECOVERY fires (for type=recovery only, after a short delay).
    // Branch off the URL hash's `type` rather than racing the two events —
    // the type tells us exactly which flow this is.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!alive) return;
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        const type = readHashType();
        if (type === "recovery" || type === "invite" || type === "signup") {
          setMode("set_password");
        } else {
          // Magic link or normal sign-in — punch through to the app.
          setMode("redirecting");
          setTimeout(() => navigate("/", { replace: true }), 400);
        }
      }
    });

    // Hash-based session pickup happens asynchronously. If after 2s there's
    // still no session, the link is most likely expired or already-used.
    const watchdog = setTimeout(async () => {
      if (!alive || mode !== "loading") return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMode("expired");
      }
    }, 2500);

    return () => {
      alive = false;
      subscription.unsubscribe();
      clearTimeout(watchdog);
    };
    // mode intentionally excluded — we only want this to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    toast.success("Password set — signing you in.");
    setMode("redirecting");
    setTimeout(() => navigate("/", { replace: true }), 400);
  };

  if (mode === "loading") {
    return (
      <Centered>
        <div className="text-sm text-muted-foreground">Verifying link…</div>
      </Centered>
    );
  }

  if (mode === "expired") {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <h1 className="text-lg font-semibold">Link expired or already used</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            This invite or password-reset link is no longer valid. Please ask
            your practice admin or Dentaloptima support to send a fresh one.
          </p>
          <Button variant="outline" onClick={() => navigate("/login", { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </Centered>
    );
  }

  if (mode === "error") {
    return (
      <Centered>
        <div className="space-y-3 text-center max-w-sm">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" onClick={() => navigate("/login", { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </Centered>
    );
  }

  if (mode === "redirecting") {
    return (
      <Centered>
        <div className="text-sm text-muted-foreground">Signing you in…</div>
      </Centered>
    );
  }

  // mode === "set_password"
  return (
    <Centered>
      <form
        onSubmit={handleSetPassword}
        className="w-full max-w-sm bg-card border rounded-lg shadow-sm p-6 space-y-5"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">Set your password</h1>
          <p className="text-xs text-muted-foreground">
            Choose a password to finish setting up your account.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        {errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
            {errorMsg}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Saving…" : "Save password & continue"}
        </Button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      {children}
    </div>
  );
}

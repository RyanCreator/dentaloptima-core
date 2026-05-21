import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePractice } from "@/contexts/PracticeContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const tenant = usePractice();

  // If they're already signed in for THIS hostname's practice, skip the form.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      const { data: members } = await supabase
        .from("practice_member")
        .select("practice_id, is_active")
        .eq("user_id", session.user.id)
        .limit(1);
      const member = members?.[0];
      if (member?.is_active && member.practice_id === tenant.practice.id) {
        navigate("/", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, tenant.practice.id]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !signInData.user) {
        toast.error(error?.message ?? "Sign in failed");
        return;
      }

      // Hostname binding: the signed-in user MUST be a practice_member of
      // the practice that owns this hostname. Anything else is a wrong-
      // domain login attempt — refuse it and sign back out.
      const { data: members, error: lookupError } = await supabase
        .from("practice_member")
        .select("practice_id, is_active")
        .eq("user_id", signInData.user.id)
        .limit(1);

      if (lookupError) {
        toast.error("Couldn't verify your account. Try again.");
        await supabase.auth.signOut();
        return;
      }

      const member = members?.[0];
      if (!member) {
        toast.error("This account isn't linked to a practice.");
        await supabase.auth.signOut();
        return;
      }
      if (!member.is_active) {
        toast.error("This account is not active. Contact your practice admin.");
        await supabase.auth.signOut();
        return;
      }
      if (member.practice_id !== tenant.practice.id) {
        toast.error(
          `This account belongs to a different practice. Log in via your practice's booking domain instead.`,
        );
        await supabase.auth.signOut();
        return;
      }

      // All gates passed — proceed to the dashboard.
      navigate("/", { replace: true });
    } catch (err) {
      console.error("[Login] unexpected error", err);
      toast.error("An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Sign in</h1>
            <p className="text-muted-foreground">
              Access {tenant.practice.name}'s booking dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            Logging into the wrong practice's domain is rejected.
          </p>
        </div>
      </div>

      <div className="hidden lg:block relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-center text-white space-y-4 max-w-2xl">
            <h2 className="text-4xl font-bold">{tenant.practice.name}</h2>
            <p className="text-xl opacity-90">Booking System</p>
          </div>
        </div>
      </div>
    </div>
  );
}

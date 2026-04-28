import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Verify operator status before redirecting — if not, sign back out
      // immediately so they don't see a flicker of the dashboard.
      const { data: isOperator } = await supabase.rpc("is_operator");
      if (!isOperator) {
        await supabase.auth.signOut();
        toast.error("That account isn't an operator. Use the booking app instead.");
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Magic link sent — check your email");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send magic link";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <div className="w-full max-w-sm bg-card border rounded-lg shadow-sm p-6 space-y-5">
        <div className="space-y-1 text-center">
          <div className="h-10 w-10 mx-auto rounded-md bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
            D
          </div>
          <h1 className="text-lg font-semibold mt-2">Dentaloptima Core Admin</h1>
          <p className="text-xs text-muted-foreground">
            Operator access only. Practice staff use the booking app.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="relative text-center">
          <span className="bg-card px-2 text-xs text-muted-foreground relative z-10">or</span>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleMagicLink}
          disabled={busy}
        >
          Email me a magic link
        </Button>
      </div>
    </div>
  );
}

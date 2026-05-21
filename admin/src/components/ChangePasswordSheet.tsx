import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 12;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Operator self-service password change. Re-auths with the current password
// before calling updateUser — guards against "tab left open on a shared
// machine" attacks where an attacker could otherwise rotate the password
// without proving the operator's identity beyond JWT freshness.
export function ChangePasswordSheet({ open, onOpenChange }: Props) {
  const { session } = useAuth();
  const email = session?.user?.email ?? "";

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset on open so old values don't leak across attempts.
  useEffect(() => {
    if (!open) return;
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setShowCurrent(false);
    setShowNew(false);
  }, [open]);

  const newLongEnough = newPw.length >= MIN_PASSWORD_LENGTH;
  const matches = newPw.length > 0 && newPw === confirmPw;
  const sameAsCurrent = newPw.length > 0 && newPw === currentPw;
  const canSubmit =
    currentPw.length > 0 && newLongEnough && matches && !sameAsCurrent && !busy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !email) return;
    setBusy(true);
    try {
      // Step 1 — re-auth. signInWithPassword refreshes the session JWT,
      // which is fine; it's the same user. If the current password is
      // wrong, this is where we catch it.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPw,
      });
      if (signInErr) {
        toast.error("Current password is incorrect");
        return;
      }

      // Step 2 — update password. Goes straight to auth.users.encrypted_password
      // (bcrypt-hashed by Supabase Auth, we never see plaintext server-side).
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPw,
      });
      if (updateErr) {
        toast.error(updateErr.message);
        return;
      }

      toast.success("Password updated. Sign in with the new one next time.");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Change password</SheetTitle>
          <SheetDescription>
            Updates your sign-in password. You stay signed in on this tab; future logins use the new password.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Current password</Label>
            <div className="flex items-stretch gap-2">
              <Input
                id="cp-current"
                type={showCurrent ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
                required
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCurrent((v) => !v)}
                className="shrink-0"
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-new">New password</Label>
            <div className="flex items-stretch gap-2">
              <Input
                id="cp-new"
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                aria-invalid={newPw.length > 0 && !newLongEnough}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNew((v) => !v)}
                className="shrink-0"
                aria-label={showNew ? "Hide new password" : "Show new password"}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p
              className={cn(
                "text-[11px]",
                newPw.length > 0 && !newLongEnough ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {newPw.length === 0
                ? `Minimum ${MIN_PASSWORD_LENGTH} characters.`
                : newLongEnough
                  ? "Length OK."
                  : `${MIN_PASSWORD_LENGTH - newPw.length} more character${MIN_PASSWORD_LENGTH - newPw.length === 1 ? "" : "s"} needed.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type={showNew ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              required
              aria-invalid={confirmPw.length > 0 && newPw !== confirmPw}
            />
            {confirmPw.length > 0 && newPw !== confirmPw && (
              <p className="text-[11px] text-destructive">Passwords don't match.</p>
            )}
            {sameAsCurrent && (
              <p className="text-[11px] text-amber-600">New password must be different from current.</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="flex-1">
              {busy ? "Updating…" : (
                <><KeyRound className="h-4 w-4 mr-2" />Update password</>
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

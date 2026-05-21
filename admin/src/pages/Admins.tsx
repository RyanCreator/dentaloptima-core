import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Plus,
  Shield,
  ShieldOff,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
} from "lucide-react";
import { useOperators, useSetOperatorRole } from "@/hooks/useOperators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ChangePasswordSheet } from "@/components/ChangePasswordSheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const PASSWORD_MIN = 12;

export default function Admins() {
  const auth = useAuth();
  const callerEmail = auth.session?.user?.email?.toLowerCase() ?? "";
  const { data: operators, isLoading } = useOperators();
  const setRole = useSetOperatorRole();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [changePwOpen, setChangePwOpen] = useState(false);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operators</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dentaloptima staff who can manage tenants. Practice members use the booking app, not this admin.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add operator
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {operators && (
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Email</th>
                  <th className="text-left font-medium px-4 py-2.5">Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Joined</th>
                  <th className="text-left font-medium px-4 py-2.5">Last sign-in</th>
                  <th className="text-right font-medium px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((o) => {
                  const isSelf = o.email.toLowerCase() === callerEmail;
                  return (
                    <tr key={o.id} className="border-t">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {o.email}
                          {isSelf && <Badge variant="secondary" className="text-[10px]">you</Badge>}
                          {!o.active && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">—</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{format(new Date(o.created_at), "d MMM yyyy")}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">—</td>
                      <td className="px-4 py-2.5 text-right">
                        {isSelf ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setChangePwOpen(true)}
                            className="h-9"
                          >
                            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                            Change password
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevoking(o.email)}
                            disabled={setRole.isPending}
                            className="h-9"
                          >
                            <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {operators.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                      No operators (you shouldn't be seeing this if you're logged in)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddOperatorSheet open={inviteOpen} onOpenChange={setInviteOpen} />
      <ChangePasswordSheet open={changePwOpen} onOpenChange={setChangePwOpen} />

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke operator role"
        description={
          revoking
            ? `${revoking} will lose access to this admin app. They can still log in to the booking app if they're a practice member.`
            : ""
        }
        confirmLabel="Revoke"
        variant="destructive"
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await setRole.mutateAsync({ email: revoking, is_operator: false });
            toast.success(`${revoking} is no longer an operator.`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
          } finally {
            setRevoking(null);
          }
        }}
      />
    </div>
  );
}

type AddMode = "invite" | "password";

function AddOperatorSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const setRole = useSetOperatorRole();
  const [mode, setMode] = useState<AddMode>("invite");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Tracks the password we just used so we can show it on the success
  // screen — operators have to pass it to the new operator over a
  // secure channel and re-typing isn't reliable.
  const [createdResult, setCreatedResult] = useState<{ email: string; password: string } | null>(null);

  // Reset form when sheet (re-)opens.
  useEffect(() => {
    if (!open) return;
    setMode("invite");
    setEmail("");
    setFullName("");
    setPassword("");
    setShowPassword(false);
    setCreatedResult(null);
  }, [open]);

  const passwordLongEnough = password.length >= PASSWORD_MIN;
  const canSubmit =
    email.trim().length > 0 && (mode === "invite" || passwordLongEnough);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const result = await setRole.mutateAsync({
        email: email.trim().toLowerCase(),
        is_operator: true,
        full_name: fullName.trim() || undefined,
        password: mode === "password" ? password : undefined,
      });
      if (mode === "password") {
        // Stash the password in local UI state so we can show it on
        // the success screen. Cleared when the sheet closes.
        setCreatedResult({ email: email.trim().toLowerCase(), password });
        toast.success(result.message ?? "Operator created");
      } else {
        toast.success(result.message ?? `Invited ${email}`);
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  function generatePassword() {
    // 18 chars, mixed case + digits + a couple of symbols. crypto.getRandomValues
    // for proper randomness — Math.random is biased.
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#-_";
    const arr = new Uint32Array(18);
    crypto.getRandomValues(arr);
    const out = Array.from(arr, (n) => charset[n % charset.length]).join("");
    setPassword(out);
    setShowPassword(true);
  }

  async function copyPasswordToClipboard() {
    if (!createdResult) return;
    try {
      await navigator.clipboard.writeText(createdResult.password);
      toast.success("Password copied");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add operator</SheetTitle>
          <SheetDescription>
            {createdResult
              ? "Operator created. Pass these credentials to them over a secure channel."
              : "Pick how to onboard them — magic-link email or set their password directly."}
          </SheetDescription>
        </SheetHeader>

        {/* Success screen — shows the password we set so it can be passed on. */}
        {createdResult ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300/60 p-3 space-y-2">
              <p className="text-sm font-medium">{createdResult.email}</p>
              <p className="text-xs text-muted-foreground">
                They can sign in immediately at <code className="font-mono">admin.dentaloptima.co.uk</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
              <div className="flex items-stretch gap-2">
                <Input
                  readOnly
                  value={createdResult.password}
                  className="font-mono text-sm"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" variant="outline" onClick={copyPasswordToClipboard} className="shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                This is the only time you'll see this password — copy it now and share it via a secure channel (1Password, Signal, etc.). It can't be re-displayed later.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            {/* Mode toggle. */}
            <div className="grid grid-cols-2 rounded-md border bg-muted/40 p-1 text-xs">
              <button
                type="button"
                onClick={() => setMode("invite")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 rounded transition-colors",
                  mode === "invite" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                Send invite email
              </button>
              <button
                type="button"
                onClick={() => setMode("password")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 rounded transition-colors",
                  mode === "password" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Set password now
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {mode === "invite"
                ? "They get a magic link by email; they pick their own password on click. Best when SMTP is reliable."
                : "They sign in immediately with the password you set. Best when email is unreliable, or for internal accounts."}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="op-email">Email</Label>
              <Input
                id="op-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={setRole.isPending}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="op-name">Full name <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input
                id="op-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={setRole.isPending}
              />
            </div>

            {mode === "password" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="op-pw">Password</Label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate
                  </button>
                </div>
                <div className="flex items-stretch gap-2">
                  <Input
                    id="op-pw"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={setRole.isPending}
                    minLength={PASSWORD_MIN}
                    className="font-mono"
                    aria-invalid={password.length > 0 && !passwordLongEnough}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPassword((v) => !v)}
                    className="shrink-0"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className={cn(
                  "text-[11px]",
                  password.length > 0 && !passwordLongEnough ? "text-destructive" : "text-muted-foreground",
                )}>
                  {password.length === 0
                    ? `Minimum ${PASSWORD_MIN} characters. Click Generate for a strong random password.`
                    : passwordLongEnough
                      ? "Looks good."
                      : `${PASSWORD_MIN - password.length} more character${PASSWORD_MIN - password.length === 1 ? "" : "s"} needed.`}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={setRole.isPending}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={setRole.isPending || !canSubmit} className="flex-1">
                {setRole.isPending ? (
                  "Working…"
                ) : mode === "invite" ? (
                  <><Shield className="h-4 w-4 mr-2" />Send invite</>
                ) : (
                  <><KeyRound className="h-4 w-4 mr-2" />Create operator</>
                )}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

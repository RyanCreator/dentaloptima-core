import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Shield, ShieldOff } from "lucide-react";
import { useOperators, useSetOperatorRole } from "@/hooks/useOperators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";

export default function Admins() {
  const auth = useAuth();
  const callerEmail = auth.session?.user?.email?.toLowerCase() ?? "";
  const { data: operators, isLoading } = useOperators();
  const setRole = useSetOperatorRole();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operators</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dentaloptima staff who can manage tenants. Practice members use the booking app, not this admin.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Invite operator
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {operators && (
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
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
                        {!o.last_sign_in_at && <Badge variant="outline" className="text-[10px]">invited</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.full_name || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{format(new Date(o.created_at), "d MMM yyyy")}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {o.last_sign_in_at ? format(new Date(o.last_sign_in_at), "d MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevoking(o.email)}
                          disabled={setRole.isPending}
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
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                  No operators (you shouldn't be seeing this if you're logged in)
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <InviteOperatorSheet open={inviteOpen} onOpenChange={setInviteOpen} />

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke operator role"
        description={revoking ? `${revoking} will lose access to this admin app. They can still log in to the booking app if they're a practice member.` : ""}
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

function InviteOperatorSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const setRole = useSetOperatorRole();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const result = await setRole.mutateAsync({
        email: email.trim().toLowerCase(),
        is_operator: true,
        full_name: fullName.trim() || undefined,
      });
      toast.success(result.message ?? `Invited ${email}`);
      setEmail("");
      setFullName("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Invite operator</SheetTitle>
          <SheetDescription>
            They'll receive a magic-link email and become an operator on accept.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="op-email">Email</Label>
            <Input id="op-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={setRole.isPending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-name">Full name (optional)</Label>
            <Input id="op-name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={setRole.isPending} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={setRole.isPending} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={setRole.isPending} className="flex-1">
              {setRole.isPending ? "Sending…" : <><Shield className="h-4 w-4 mr-2" />Invite</>}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

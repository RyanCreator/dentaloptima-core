import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useInviteMember, type PracticeRole } from "@/hooks/useTenants";

const ROLES: PracticeRole[] = ["OWNER", "ADMIN", "DENTIST", "HYGIENIST", "NURSE", "RECEPTIONIST"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practiceId: string;
  practiceName?: string;
}

export function InviteMemberSheet({ open, onOpenChange, practiceId, practiceName }: Props) {
  const invite = useInviteMember();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<PracticeRole>("DENTIST");

  function reset() {
    setEmail("");
    setFullName("");
    setRole("DENTIST");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({
        practice_id: practiceId,
        email: email.trim().toLowerCase(),
        role,
        full_name: fullName.trim(),
      });
      toast.success(`Invite sent to ${email}.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invite member</SheetTitle>
          <SheetDescription>
            {practiceName ? `Add a new staff member to ${practiceName}.` : "Add a new staff member."}
            {" "}They'll receive an email invite.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="memberName">Full name</Label>
            <Input
              id="memberName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr Jane Smith"
              disabled={invite.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memberEmail">Email</Label>
            <Input
              id="memberEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={invite.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memberRole">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PracticeRole)} disabled={invite.isPending}>
              <SelectTrigger id="memberRole">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={invite.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending} className="flex-1">
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInviteStaff, type StaffRole } from "@/hooks/useInviteStaff";

// Sheet for OWNER/ADMIN to invite a new staff member into their own
// practice. The role dropdown adapts to the caller — ADMINs cannot
// grant OWNER, so it's hidden from the list (the edge function enforces
// this regardless; the UI just doesn't dangle it).

interface InviteStaffSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practiceId: string;
  practiceName: string;
  callerRole: "OWNER" | "ADMIN";
  onInvited?: () => void;
}

const NON_OWNER_ROLES: StaffRole[] = ["ADMIN", "DENTIST", "HYGIENIST", "NURSE", "RECEPTIONIST"];

export function InviteStaffSheet({
  open,
  onOpenChange,
  practiceId,
  practiceName,
  callerRole,
  onInvited,
}: InviteStaffSheetProps) {
  const { invite, submitting } = useInviteStaff();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("DENTIST");

  const allowedRoles: StaffRole[] =
    callerRole === "OWNER" ? ["OWNER", ...NON_OWNER_ROLES] : NON_OWNER_ROLES;

  // Reset on close so reopening doesn't show stale data.
  useEffect(() => {
    if (!open) {
      setFullName("");
      setEmail("");
      setRole("DENTIST");
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) {
      toast.error("Full name required");
      return;
    }
    if (!trimmedEmail) {
      toast.error("Email required");
      return;
    }
    try {
      await invite({
        practice_id: practiceId,
        email: trimmedEmail,
        role,
        full_name: trimmedName,
      });
      toast.success(`Invite sent to ${trimmedEmail}`);
      onOpenChange(false);
      onInvited?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invite";
      toast.error(message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invite staff member</SheetTitle>
          <SheetDescription>
            They'll get an email invite to {practiceName}. They set their own
            password the first time they sign in.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Full name</Label>
            <Input
              id="staff-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as StaffRole)}
              disabled={submitting}
            >
              <SelectTrigger id="staff-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {callerRole !== "OWNER" && (
              <p className="text-[11px] text-muted-foreground">
                Only the practice owner can invite another OWNER.
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2, ShieldAlert, Mail, Link as LinkIcon, Copy, Check } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useUpdateMember,
  useRemoveMember,
  useResendMemberInvite,
  type PracticeMember,
  type PracticeRole,
} from "@/hooks/useTenants";

const ROLES: PracticeRole[] = ["OWNER", "ADMIN", "DENTIST", "HYGIENIST", "NURSE", "RECEPTIONIST"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: PracticeMember | null;
  // The practice's custom_hostname, used to build the redirect URL the
  // sign-in email lands on. Optional — when missing we just don't send a
  // redirect and Supabase uses its default Site URL.
  practiceHostname?: string | null;
}

// Click a member row → this sheet. Edit role, toggle is_active, mark
// available-for-booking on, edit name/GDC/specialism, or remove.
//
// Removing soft-deletes the practice_member row. The auth.users row stays
// (so the same person can be re-added later), but RLS will refuse to return
// any data scoped to this practice for this user the next time they hit
// the booking app.
export function EditMemberSheet({ open, onOpenChange, member, practiceHostname }: Props) {
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const resend = useResendMemberInvite();
  const [role, setRole] = useState<PracticeRole>("DENTIST");
  // Set when the function returns a magic link instead of sending an email
  // (rate limit, SMTP failure, etc). Stays visible until manually dismissed
  // so the operator can copy it without time pressure.
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [fullName, setFullName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [availableForBooking, setAvailableForBooking] = useState(false);
  const [gdcNumber, setGdcNumber] = useState("");
  const [specialism, setSpecialism] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!member) return;
    setRole(member.role);
    setFullName(member.full_name ?? "");
    setIsActive(member.is_active);
    setAvailableForBooking(member.available_for_booking);
    setGdcNumber(member.gdc_number ?? "");
    setSpecialism(member.specialism ?? "");
    setFallbackLink(null);
    setLinkCopied(false);
  }, [member?.id]);

  if (!member) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    );
  }

  const isLastOwner = member.role === "OWNER";

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    try {
      await update.mutateAsync({
        id: member.id,
        practice_id: member.practice_id,
        patch: {
          role,
          full_name: fullName.trim() || null,
          is_active: isActive,
          available_for_booking: availableForBooking,
          gdc_number: gdcNumber.trim() || null,
          specialism: specialism.trim() || null,
        },
      });
      toast.success("Member updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleResendInvite() {
    if (!member) return;
    setFallbackLink(null);
    setLinkCopied(false);
    try {
      // Booking app convention: marketing lives at <practice.com>, the
      // booking app lives at app.<practice.com> served by the canonical
      // deployment. The auth callback only exists in the booking app, so
      // we redirect there. If practiceHostname already starts with "app.",
      // don't double-prefix.
      const bookingHost = practiceHostname
        ? practiceHostname.startsWith("app.")
          ? practiceHostname
          : `app.${practiceHostname}`
        : null;
      const redirect = bookingHost ? `https://${bookingHost}/auth/callback` : undefined;
      const result = await resend.mutateAsync({
        practice_id: member.practice_id,
        member_id: member.id,
        redirect_to: redirect,
      });
      if (result.kind === "link") {
        // Email path failed (rate limit / SMTP / etc). The function
        // generated a fallback link for us to share manually.
        if (result.link) {
          setFallbackLink(result.link);
          toast.warning(result.message);
        } else {
          // Defensive — if we ever get kind="link" without an actual link
          // string, surface a real error rather than silently swallowing.
          toast.error(
            "The function couldn't send an email and didn't return a fallback link either. Check the edge-function logs.",
          );
        }
      } else {
        toast.success(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend");
    }
  }

  async function handleCopyLink() {
    if (!fallbackLink) return;
    try {
      await navigator.clipboard.writeText(fallbackLink);
      setLinkCopied(true);
      toast.success("Link copied to clipboard");
      // Reset the copied indicator after 2s so the operator can see they
      // can copy again (e.g. paste failed, want a fresh copy).
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy manually.");
    }
  }

  async function doRemove() {
    if (!member) return;
    try {
      await remove.mutateAsync({ id: member.id, practice_id: member.practice_id });
      toast.success(`${member.email} removed from this practice`);
      setConfirmRemove(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit member</SheetTitle>
            <SheetDescription className="font-mono text-xs">{member.email}</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Full name</Label>
              <Input id="m-name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={update.isPending} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as PracticeRole)} disabled={update.isPending}>
                <SelectTrigger id="m-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLastOwner && (
                <p className="text-xs text-amber-700 flex items-start gap-1.5 mt-1">
                  <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" />
                  Leave at least one OWNER per practice — the booking app needs an owner to function.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="m-active" className="cursor-pointer">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive members can't sign in but their data stays.
                </p>
              </div>
              <Switch id="m-active" checked={isActive} onCheckedChange={setIsActive} disabled={update.isPending} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="m-booking" className="cursor-pointer">Available for booking</Label>
                <p className="text-xs text-muted-foreground">
                  Show in patient-facing booking calendars.
                </p>
              </div>
              <Switch id="m-booking" checked={availableForBooking} onCheckedChange={setAvailableForBooking} disabled={update.isPending} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-gdc">GDC number</Label>
                <Input id="m-gdc" value={gdcNumber} onChange={(e) => setGdcNumber(e.target.value)} disabled={update.isPending} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-spec">Specialism</Label>
                <Input id="m-spec" value={specialism} onChange={(e) => setSpecialism(e.target.value)} placeholder="Endodontist" disabled={update.isPending} />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={update.isPending} className="flex-1">
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleResendInvite}
                disabled={resend.isPending || update.isPending || remove.isPending}
                title="Send a fresh sign-in email — useful if the original invite never arrived."
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                {resend.isPending ? "Sending…" : "Resend invite email"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmRemove(true)}
                disabled={update.isPending || remove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Remove from practice
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Magic-link fallback — when the email path failed (rate limit /
          SMTP / fake inbox), we surface the sign-in link here so the
          operator can paste it into Slack, WhatsApp, etc. Centered modal
          so it's impossible to miss. */}
      <Dialog
        open={fallbackLink !== null}
        onOpenChange={(o) => {
          if (!o) {
            setFallbackLink(null);
            setLinkCopied(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Sign-in link ready to share
            </DialogTitle>
            <DialogDescription>
              Email couldn't be sent — usually because Supabase's auth rate
              limit was hit. Copy the link below and share it with{" "}
              <strong>{member.email}</strong> via Slack, WhatsApp or in
              person. It works the same as the link in the email and
              expires in 1 hour.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 pt-2">
            <Input
              type="text"
              readOnly
              value={fallbackLink ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button onClick={handleCopyLink} className="shrink-0">
              {linkCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFallbackLink(null);
                setLinkCopied(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${member.full_name || member.email}?`}
        description={
          <>
            They'll immediately lose access to {member.email ? <strong>{member.email}</strong> : "their account"}'s practice data.
            The auth account is kept so they can be re-added later if needed.
            {isLastOwner && (
              <p className="mt-2 text-amber-700">
                <ShieldAlert className="inline h-3 w-3 mr-1" />
                This is the OWNER. The practice will have no owner.
              </p>
            )}
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={doRemove}
      />
    </>
  );
}

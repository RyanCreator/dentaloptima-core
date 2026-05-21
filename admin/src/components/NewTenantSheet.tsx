import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePractice } from "@/hooks/useTenants";
import { markLeadConverted } from "@/hooks/useLeads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (practiceId: string) => void;
  // Optional pre-fill — used when the sheet is opened from a lead's
  // "Convert" button. The lead id is also captured so we can mark the
  // lead CONVERTED + link it to the new practice on success.
  initialPracticeName?: string;
  initialOwnerEmail?: string;
  initialOwnerFullName?: string;
  fromLeadId?: string;
}

export function NewTenantSheet({
  open,
  onOpenChange,
  onCreated,
  initialPracticeName,
  initialOwnerEmail,
  initialOwnerFullName,
  fromLeadId,
}: Props) {
  const create = useCreatePractice();
  const [practiceName, setPracticeName] = useState(initialPracticeName ?? "");
  const [slug, setSlug] = useState(initialPracticeName ? slugify(initialPracticeName) : "");
  const [ownerEmail, setOwnerEmail] = useState(initialOwnerEmail ?? "");
  const [ownerFullName, setOwnerFullName] = useState(initialOwnerFullName ?? "");
  const [trialDays, setTrialDays] = useState("30");

  // Re-prefill when the sheet (re-)opens with new initial values — e.g.
  // user navigates from a different lead's convert flow.
  useEffect(() => {
    if (!open) return;
    if (initialPracticeName !== undefined) {
      setPracticeName(initialPracticeName);
      setSlug(slugify(initialPracticeName));
    }
    if (initialOwnerEmail !== undefined) setOwnerEmail(initialOwnerEmail);
    if (initialOwnerFullName !== undefined) setOwnerFullName(initialOwnerFullName);
  }, [open, initialPracticeName, initialOwnerEmail, initialOwnerFullName]);

  function reset() {
    setPracticeName("");
    setSlug("");
    setOwnerEmail("");
    setOwnerFullName("");
    setTrialDays("30");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const result = await create.mutateAsync({
        practice_name: practiceName,
        slug,
        owner_email: ownerEmail,
        owner_full_name: ownerFullName,
        trial_days: Number(trialDays) || 30,
      });
      toast.success(`Practice created. Invite emailed to ${ownerEmail}.`);
      // Best-effort lead linkage — don't fail the create if this errors.
      if (fromLeadId) {
        try {
          await markLeadConverted(fromLeadId, result.practice_id);
        } catch (err) {
          console.warn("[NewTenantSheet] markLeadConverted failed", err);
          toast.warning("Practice created, but couldn't mark the lead converted. Update it manually on the Leads page.");
        }
      }
      reset();
      onOpenChange(false);
      onCreated?.(result.practice_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      toast.error(message);
    }
  }

  // Auto-derive slug from name as the user types (only if they haven't
  // already overridden it themselves).
  const slugIsTracking = !slug || slug === slugify(practiceName).slice(0, slug.length);
  function handleNameChange(value: string) {
    setPracticeName(value);
    if (slugIsTracking) setSlug(slugify(value));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New tenant</SheetTitle>
          <SheetDescription>
            Creates the practice and emails the owner an invite link.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Practice name</Label>
            <Input
              id="name"
              required
              value={practiceName}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={200}
              disabled={create.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="lowercase-with-hyphens"
              minLength={3}
              maxLength={50}
              disabled={create.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs. Lowercase letters, numbers, hyphens. 3-50 chars.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ownerName">Owner name</Label>
            <Input
              id="ownerName"
              required
              value={ownerFullName}
              onChange={(e) => setOwnerFullName(e.target.value)}
              disabled={create.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ownerEmail">Owner email</Label>
            <Input
              id="ownerEmail"
              type="email"
              required
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              disabled={create.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trial">Trial length (days)</Label>
            <Input
              id="trial"
              type="number"
              min="1"
              max="365"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              disabled={create.isPending}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending} className="flex-1">
              {create.isPending ? "Creating…" : "Create practice"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

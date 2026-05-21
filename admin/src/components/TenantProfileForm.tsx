import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdatePractice, type Practice } from "@/hooks/useTenants";

// The actual edit form for a practice. Used in two places:
//   1. <EditTenantSheet> — opened from the Tenants list page so an
//      operator can do a quick row-level edit without navigating.
//   2. The "Profile" tab on TenantDetail — same form, inline, no modal.
//
// Keeping the form in one component means hostname/seat-limit/CQC etc.
// stay in lockstep across both surfaces.

interface TenantProfileFormProps {
  tenant: Practice;
  onSaved?: () => void;
  onCancel?: () => void;
  // The Sheet variant wants the action bar inside its sticky footer; the
  // tab variant wants it inline with the form. Set this prop on the Sheet
  // caller to render only fields and expose `submit` via the imperative
  // ref pattern. For now we always render inline.
  cancelLabel?: string;
}

export function TenantProfileForm({
  tenant,
  onSaved,
  onCancel,
  cancelLabel = "Cancel",
}: TenantProfileFormProps) {
  const update = useUpdatePractice();
  const [name, setName] = useState(tenant.name);
  const [primaryEmail, setPrimaryEmail] = useState(tenant.primary_email ?? "");
  const [primaryPhone, setPrimaryPhone] = useState(tenant.primary_phone ?? "");
  const [city, setCity] = useState(tenant.city ?? "");
  const [postcode, setPostcode] = useState(tenant.postcode ?? "");
  const [nhsContract, setNhsContract] = useState(tenant.nhs_contract_number ?? "");
  const [cqcProvider, setCqcProvider] = useState(tenant.cqc_provider_id ?? "");
  const [customHostname, setCustomHostname] = useState(tenant.custom_hostname ?? "");
  const [seatLimit, setSeatLimit] = useState<string>(
    tenant.staff_seat_limit === null ? "" : String(tenant.staff_seat_limit),
  );

  // When the parent reopens the form for a different tenant (or the same
  // tenant after a remote edit), refresh the local form state.
  useEffect(() => {
    setName(tenant.name);
    setPrimaryEmail(tenant.primary_email ?? "");
    setPrimaryPhone(tenant.primary_phone ?? "");
    setCity(tenant.city ?? "");
    setPostcode(tenant.postcode ?? "");
    setNhsContract(tenant.nhs_contract_number ?? "");
    setCqcProvider(tenant.cqc_provider_id ?? "");
    setCustomHostname(tenant.custom_hostname ?? "");
    setSeatLimit(tenant.staff_seat_limit === null ? "" : String(tenant.staff_seat_limit));
  }, [tenant.id, tenant.updated_at]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const hostname = customHostname.trim().toLowerCase() || null;
      const trimmedSeat = seatLimit.trim();
      let seatLimitValue: number | null = null;
      if (trimmedSeat !== "") {
        const parsed = Number(trimmedSeat);
        if (!Number.isInteger(parsed) || parsed < 0) {
          toast.error("Staff seat limit must be a whole number ≥ 0, or empty for unlimited.");
          return;
        }
        seatLimitValue = parsed;
      }
      await update.mutateAsync({
        id: tenant.id,
        patch: {
          name: name.trim(),
          primary_email: primaryEmail.trim() || null,
          primary_phone: primaryPhone.trim() || null,
          city: city.trim() || null,
          postcode: postcode.trim() || null,
          nhs_contract_number: nhsContract.trim() || null,
          cqc_provider_id: cqcProvider.trim() || null,
          custom_hostname: hostname,
          staff_seat_limit: seatLimitValue,
        },
      });
      toast.success("Saved");
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="t-name">Name</Label>
        <Input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-email">Primary email</Label>
        <Input id="t-email" type="email" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-phone">Primary phone</Label>
        <Input id="t-phone" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-city">City</Label>
          <Input id="t-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-postcode">Postcode</Label>
          <Input id="t-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-nhs">NHS contract #</Label>
        <Input id="t-nhs" value={nhsContract} onChange={(e) => setNhsContract(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-cqc">CQC provider ID</Label>
        <Input id="t-cqc" value={cqcProvider} onChange={(e) => setCqcProvider(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-hostname">Practice domain</Label>
        <Input
          id="t-hostname"
          value={customHostname}
          onChange={(e) => setCustomHostname(e.target.value)}
          placeholder="optimadental.co.uk"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {tenant.custom_hostname && customHostname.trim().toLowerCase() !== tenant.custom_hostname && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 text-xs text-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
            <span>
              Changing the domain will break login until DNS + SSL are re-set up for the new one.
              Make sure the practice has CNAMEd the new hostname before saving.
            </span>
          </div>
        )}
        {customHostname.trim().toLowerCase().startsWith("app.") && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 text-xs text-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
            <span>
              Don't include the <code className="bg-background/60 px-1 py-0.5 rounded text-[11px]">app.</code>{" "}
              prefix here — that's added automatically for the booking app.
              Enter just the bare practice domain.
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The practice's primary domain (no <code className="bg-muted px-1 py-0.5 rounded text-[11px]">app.</code> prefix).
          The marketing site lives here; the booking app at{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[11px]">app.&lt;this&gt;</code>{" "}
          serves the same practice. Both are CNAMEd to{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[11px]">app.dentaloptima.co.uk</code>.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-seats">Staff seat limit</Label>
        <Input
          id="t-seats"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={seatLimit}
          onChange={(e) => setSeatLimit(e.target.value)}
          placeholder="Unlimited"
        />
        <p className="text-xs text-muted-foreground">
          Maximum number of active staff members the practice can have.
          Leave blank for unlimited. Lowering below the current count
          doesn't remove anyone — it just blocks new invites until the
          practice is back under the limit.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={update.isPending}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={update.isPending} className="flex-1">
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

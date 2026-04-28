import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdatePractice, type Practice } from "@/hooks/useTenants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Practice;
}

export function EditTenantSheet({ open, onOpenChange, tenant }: Props) {
  const update = useUpdatePractice();
  const [name, setName] = useState(tenant.name);
  const [primaryEmail, setPrimaryEmail] = useState(tenant.primary_email ?? "");
  const [primaryPhone, setPrimaryPhone] = useState(tenant.primary_phone ?? "");
  const [city, setCity] = useState(tenant.city ?? "");
  const [postcode, setPostcode] = useState(tenant.postcode ?? "");
  const [nhsContract, setNhsContract] = useState(tenant.nhs_contract_number ?? "");
  const [cqcProvider, setCqcProvider] = useState(tenant.cqc_provider_id ?? "");

  // Reset form when tenant changes (e.g. switching between tenants)
  useEffect(() => {
    setName(tenant.name);
    setPrimaryEmail(tenant.primary_email ?? "");
    setPrimaryPhone(tenant.primary_phone ?? "");
    setCity(tenant.city ?? "");
    setPostcode(tenant.postcode ?? "");
    setNhsContract(tenant.nhs_contract_number ?? "");
    setCqcProvider(tenant.cqc_provider_id ?? "");
  }, [tenant.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
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
        },
      });
      toast.success("Saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit practice</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
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

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending} className="flex-1">
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { TenantProfileForm } from "@/components/TenantProfileForm";
import { type Practice } from "@/hooks/useTenants";

// Quick-edit Sheet used from the Tenants list page. The detail page uses
// the same TenantProfileForm inline as a "Profile" tab — so anything you
// see here is also available there.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Practice;
}

export function EditTenantSheet({ open, onOpenChange, tenant }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit practice</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <TenantProfileForm
            tenant={tenant}
            onSaved={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePractice } from "@/contexts/PracticeContext";
import { useAuth } from "@/hooks/useAuth";
import { useServices } from "@/hooks/useServices";
import {
  useTreatmentPlans,
  type TreatmentPlan,
  type TreatmentPlanItem,
  type TreatmentPlanStatus,
  type TreatmentPlanItemStatus,
} from "@/hooks/useTreatmentPlans";
import { formatPrice } from "@/types/entities";

// Adapted to dentaloptima-core's `treatment_plan` + `treatment_plan_item`
// schema. The primary data hook lives in useTreatmentPlans; this component
// is the UI shell + sheets.

const PLAN_STATUS_OPTIONS: { value: TreatmentPlanStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "PROPOSED", label: "Proposed" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
];

const ITEM_STATUS_OPTIONS: { value: TreatmentPlanItemStatus; label: string }[] = [
  { value: "PROPOSED", label: "Proposed" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_BADGE: Record<TreatmentPlanStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PROPOSED: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-500",
};

// Parse "11, 12, 21" → [11, 12, 21]. Returns null on bad input so the caller
// can warn before round-tripping to the DB. Leaves range-checking to the DB
// CHECK constraint (fn_is_valid_tooth_array) — that's the source of truth
// for FDI validity.
function parseTeeth(raw: string): number[] | null {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return [];
  const out: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n <= 0) return null;
    out.push(n);
  }
  return out;
}

interface TreatmentPlansSectionProps {
  patientId: string;
}

export function TreatmentPlansSection({ patientId }: TreatmentPlansSectionProps) {
  const tenant = usePractice();
  const { member } = useAuth();
  const { services } = useServices();
  const {
    plans,
    loading,
    createPlan,
    updatePlanStatus,
    addItem,
    updateItemStatus,
    removeItem,
  } = useTreatmentPlans(patientId);

  const [showCreate, setShowCreate] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const openPlan = useMemo(
    () => plans.find((p) => p.id === openPlanId) ?? null,
    [plans, openPlanId],
  );

  // Membership gate: creating a plan requires a logged-in practice member
  // because proposed_by is NOT NULL in the schema.
  const canPropose = !!member;

  const handleCreate = async (title: string, description: string) => {
    if (!member) {
      toast.error("You must be signed in as a practice member to create a plan");
      return;
    }
    const plan = await createPlan({
      practiceId: tenant.practice.id,
      proposedBy: member.id,
      title,
      description,
    });
    if (plan) setShowCreate(false);
  };

  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Treatment Plans</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreate(true)}
          disabled={!canPropose}
          title={canPropose ? "" : "Only practice members can create plans"}
        >
          <Plus className="h-4 w-4 mr-1" /> New plan
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No treatment plans yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} onClick={() => setOpenPlanId(plan.id)} />
          ))}
        </div>
      )}

      {/* New plan sheet */}
      <NewPlanSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={handleCreate}
      />

      {/* Plan detail sheet */}
      <Sheet open={!!openPlan} onOpenChange={(o) => !o && setOpenPlanId(null)}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{openPlan?.title ?? "Plan"}</SheetTitle>
            <SheetDescription className="sr-only">
              View and manage treatment plan items.
            </SheetDescription>
          </SheetHeader>

          {openPlan && (
            <PlanDetail
              plan={openPlan}
              services={services}
              practiceId={tenant.practice.id}
              onPlanStatus={(status, reason) =>
                updatePlanStatus(openPlan.id, status, reason)
              }
              onAddItem={(item) => addItem(openPlan.id, item)}
              onItemStatus={(itemId, status) => updateItemStatus(itemId, status)}
              onRemoveItem={(itemId) => removeItem(itemId, openPlan.id)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PlanRow({ plan, onClick }: { plan: TreatmentPlan; onClick: () => void }) {
  const itemCount = plan.items?.filter((i) => i.status !== "CANCELLED").length ?? 0;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-md border hover:bg-muted/30 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{plan.title}</span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[plan.status]}`}
          >
            {plan.status.replace("_", " ").toLowerCase()}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {itemCount} item{itemCount === 1 ? "" : "s"}
          {plan.total_estimated_pence != null && plan.total_estimated_pence > 0 && (
            <> &middot; {formatPrice(plan.total_estimated_pence)}</>
          )}
          {plan.proposer?.full_name && <> &middot; by {plan.proposer.full_name}</>}
          <> &middot; {format(new Date(plan.created_at), "d MMM yyyy")}</>
        </div>
        {plan.description && (
          <div className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1">
            {plan.description}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function NewPlanSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string, description: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onCreate(title.trim(), description.trim());
    setSaving(false);
    setTitle("");
    setDescription("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New treatment plan</SheetTitle>
          <SheetDescription className="sr-only">
            Create a new treatment plan as a draft. Items can be added once the plan exists.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Restorative phase"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Outline what this plan covers..."
            />
          </div>
          <Button
            onClick={submit}
            disabled={saving || !title.trim()}
            className="w-full"
          >
            {saving ? "Saving..." : "Create as draft"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PlanDetail({
  plan,
  services,
  practiceId,
  onPlanStatus,
  onAddItem,
  onItemStatus,
  onRemoveItem,
}: {
  plan: TreatmentPlan;
  services: any[];
  practiceId: string;
  onPlanStatus: (status: TreatmentPlanStatus, declinedReason?: string) => Promise<void>;
  onAddItem: (item: {
    practiceId: string;
    service: { id: string; price_pence: number | null; duration_minutes: number };
    tooth_numbers?: number[];
    surface?: string;
    notes?: string;
    sequence?: number;
  }) => Promise<void>;
  onItemStatus: (itemId: string, status: TreatmentPlanItemStatus) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const visibleItems = (plan.items ?? []).filter((i) => i.status !== "CANCELLED");

  const handleStatusChange = async (next: TreatmentPlanStatus) => {
    if (next === "DECLINED") {
      const reason = window.prompt("Reason for declining (optional)");
      // null when user cancels — bail
      if (reason === null) return;
      await onPlanStatus(next, reason || undefined);
    } else {
      await onPlanStatus(next);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {plan.description && (
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <Label className="text-[10px] text-muted-foreground">Status</Label>
          <Select
            value={plan.status}
            onValueChange={(v) => handleStatusChange(v as TreatmentPlanStatus)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Total estimated</Label>
          <p className="mt-1 text-sm font-medium">
            {plan.total_estimated_pence != null && plan.total_estimated_pence > 0
              ? formatPrice(plan.total_estimated_pence)
              : "—"}
          </p>
        </div>
      </div>

      {plan.declined_reason && (
        <p className="text-xs text-muted-foreground italic">
          Declined reason: {plan.declined_reason}
        </p>
      )}

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Items</h4>
          <Button size="sm" variant="ghost" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add item
          </Button>
        </div>

        {visibleItems.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No items yet</p>
        ) : (
          <div className="space-y-1.5">
            {visibleItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onStatusChange={(s) => onItemStatus(item.id, s)}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <AddItemSheet
        open={showAdd}
        onOpenChange={setShowAdd}
        services={services}
        onAdd={async (item) => {
          await onAddItem({
            practiceId,
            service: item.service,
            tooth_numbers: item.tooth_numbers,
            surface: item.surface,
            notes: item.notes,
            sequence: visibleItems.length,
          });
          setShowAdd(false);
        }}
      />
    </div>
  );
}

function ItemRow({
  item,
  onStatusChange,
  onRemove,
}: {
  item: TreatmentPlanItem;
  onStatusChange: (s: TreatmentPlanItemStatus) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-md border text-sm bg-background">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{item.service?.name ?? "Service"}</span>
          {item.tooth_numbers && item.tooth_numbers.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {item.tooth_numbers.join(", ")}
            </span>
          )}
          {item.surface && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {item.surface}
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {item.duration_minutes_snapshot} min
          {item.price_pence_snapshot != null && (
            <> &middot; {formatPrice(item.price_pence_snapshot)}</>
          )}
        </div>
        {item.notes && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{item.notes}</p>
        )}
      </div>
      <Select
        value={item.status}
        onValueChange={(v) => onStatusChange(v as TreatmentPlanItemStatus)}
      >
        <SelectTrigger className="h-7 text-xs w-[100px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ITEM_STATUS_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
        title="Remove item"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AddItemSheet({
  open,
  onOpenChange,
  services,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: any[];
  onAdd: (item: {
    service: { id: string; price_pence: number | null; duration_minutes: number };
    tooth_numbers?: number[];
    surface?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [serviceId, setServiceId] = useState("");
  const [teeth, setTeeth] = useState("");
  const [surface, setSurface] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      toast.error("Pick a service");
      return;
    }
    const parsed = parseTeeth(teeth);
    if (parsed === null) {
      toast.error("Tooth numbers must be comma-separated integers");
      return;
    }
    setSaving(true);
    await onAdd({
      service: {
        id: service.id,
        price_pence: service.price_pence ?? null,
        duration_minutes: service.duration_minutes,
      },
      tooth_numbers: parsed.length > 0 ? parsed : undefined,
      surface: surface.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    setServiceId("");
    setTeeth("");
    setSurface("");
    setNotes("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add item to plan</SheetTitle>
          <SheetDescription className="sr-only">
            Pick a service and add tooth-level details. Price and duration are
            snapshotted at this moment so future service changes don't drift the plan.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes} min{s.price_pence ? `, ${formatPrice(s.price_pence)}` : ""})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tooth numbers (FDI)</Label>
            <Input
              value={teeth}
              onChange={(e) => setTeeth(e.target.value)}
              placeholder="e.g. 11, 12, 21"
            />
            <p className="text-[10px] text-muted-foreground">
              Adult: 11–48. Deciduous: 51–85. Comma-separated.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Surface (optional)</Label>
            <Input
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              placeholder="e.g. MO, DOL"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything specific to this item..."
            />
          </div>
          <Button
            onClick={submit}
            disabled={saving || !serviceId}
            className="w-full"
          >
            {saving ? "Adding..." : "Add item"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

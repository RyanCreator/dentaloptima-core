import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { Plus, ChevronDown, ChevronRight, Trash2, Send, CheckCircle2 } from "lucide-react";
import { useTreatmentPlans, type TreatmentPlan } from "@/hooks/useTreatmentPlans";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PROPOSED: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  DECLINED: "bg-red-100 text-red-700",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  SCHEDULED: "bg-blue-100 text-blue-600",
  IN_PROGRESS: "bg-amber-100 text-amber-600",
  COMPLETED: "bg-green-100 text-green-600",
  CANCELLED: "bg-red-100 text-red-600",
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PROPOSED", "DECLINED"],
  PROPOSED: ["ACCEPTED", "DECLINED"],
  ACCEPTED: ["IN_PROGRESS", "DECLINED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  DECLINED: ["DRAFT"],
};

interface TreatmentPlansSectionProps {
  patientId: string;
}

export function TreatmentPlansSection({ patientId }: TreatmentPlansSectionProps) {
  const { plans, loading, createPlan, updatePlanStatus, addItem, updateItemStatus, removeItem } = useTreatmentPlans(patientId);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Add item state
  const [showAddItem, setShowAddItem] = useState<string | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [itemForm, setItemForm] = useState({
    service_id: "",
    tooth_numbers: "",
    estimated_price: "",
    notes: "",
  });

  useEffect(() => {
    supabase.from("services").select("id, name, price, duration_minutes").eq("active", true).is("deleted_at", null).order("name")
      .then(({ data }) => { if (data) setServices(data); });
  }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const plan = await createPlan(newTitle.trim(), newNotes.trim());
    if (plan) {
      setShowCreate(false);
      setNewTitle("");
      setNewNotes("");
      setExpandedPlan(plan.id);
    }
    setCreating(false);
  };

  const handleAddItem = async (planId: string) => {
    const selectedService = services.find((s) => s.id === itemForm.service_id);
    const toothNums = itemForm.tooth_numbers
      ? itemForm.tooth_numbers.split(",").map((n) => parseInt(n.trim())).filter((n) => !isNaN(n))
      : undefined;

    await addItem(planId, {
      service_id: itemForm.service_id || undefined,
      tooth_numbers: toothNums?.length ? toothNums : undefined,
      estimated_price: itemForm.estimated_price ? parseFloat(itemForm.estimated_price) : selectedService?.price ?? undefined,
      notes: itemForm.notes || undefined,
    });
    setShowAddItem(null);
    setItemForm({ service_id: "", tooth_numbers: "", estimated_price: "", notes: "" });
  };

  const toggleExpand = (planId: string) => {
    setExpandedPlan(expandedPlan === planId ? null : planId);
  };

  return (
    <div className="bg-card rounded-lg border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Treatment Plans</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Plan
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No treatment plans
        </p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expanded={expandedPlan === plan.id}
              onToggle={() => toggleExpand(plan.id)}
              onStatusChange={updatePlanStatus}
              onAddItem={() => setShowAddItem(plan.id)}
              onItemStatusChange={updateItemStatus}
              onRemoveItem={removeItem}
            />
          ))}
        </div>
      )}

      {/* Create plan sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New Treatment Plan</SheetTitle>
            <SheetDescription className="sr-only">Create a treatment plan for this patient</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Upper arch restoration 2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} placeholder="Overview of the treatment pathway..." />
            </div>
            <Button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="w-full">
              {creating ? "Creating..." : "Create Plan"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add item sheet */}
      <Sheet open={!!showAddItem} onOpenChange={(open) => { if (!open) setShowAddItem(null); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add Treatment Item</SheetTitle>
            <SheetDescription className="sr-only">Add a line item to the treatment plan</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={itemForm.service_id} onValueChange={(v) => {
                const svc = services.find((s) => s.id === v);
                setItemForm((f) => ({
                  ...f,
                  service_id: v,
                  estimated_price: svc?.price?.toString() || f.estimated_price,
                }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select service..." /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tooth numbers</Label>
                <Input value={itemForm.tooth_numbers} onChange={(e) => setItemForm((f) => ({ ...f, tooth_numbers: e.target.value }))} placeholder="e.g. 16, 17" />
                <p className="text-[10px] text-muted-foreground">FDI notation, comma-separated</p>
              </div>
              <div className="space-y-1.5">
                <Label>Estimated price</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
                  <Input value={itemForm.estimated_price} onChange={(e) => setItemForm((f) => ({ ...f, estimated_price: e.target.value }))} className="pl-6" placeholder="0.00" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input value={itemForm.notes} onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." />
            </div>
            <Button onClick={() => showAddItem && handleAddItem(showAddItem)} disabled={!itemForm.service_id} className="w-full">
              Add Item
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------
function PlanCard({
  plan,
  expanded,
  onToggle,
  onStatusChange,
  onAddItem,
  onItemStatusChange,
  onRemoveItem,
}: {
  plan: TreatmentPlan;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (planId: string, status: string) => void;
  onAddItem: () => void;
  onItemStatusChange: (itemId: string, status: string) => void;
  onRemoveItem: (itemId: string) => void;
}) {
  const items = plan.items || [];
  const total = items.reduce((sum, i) => sum + (i.estimated_price || 0), 0);
  const completed = items.filter((i) => i.status === "COMPLETED").length;
  const transitions = STATUS_TRANSITIONS[plan.status] || [];

  return (
    <div className="border rounded-md">
      <button onClick={onToggle} className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors text-left">
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{plan.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[plan.status] || ""}`}>
              {plan.status.replace("_", " ")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""}
            {total > 0 && <> &middot; £{total.toFixed(2)} est.</>}
            {completed > 0 && <> &middot; {completed}/{items.length} done</>}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {format(new Date(plan.created_at), "d MMM yy")}
        </span>
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 space-y-3">
          {/* Plan notes */}
          {plan.notes && (
            <p className="text-xs text-muted-foreground pt-2">{plan.notes}</p>
          )}

          {/* Items list */}
          {items.length > 0 ? (
            <div className="space-y-1 pt-2">
              {items.sort((a, b) => a.sequence - b.sequence).map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                  <span className="text-xs text-muted-foreground w-5 shrink-0">#{item.sequence || "—"}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-xs">{item.service?.name || "No service"}</span>
                    {item.tooth_numbers?.length ? (
                      <span className="text-xs text-muted-foreground ml-1">
                        (teeth: {item.tooth_numbers.join(", ")})
                      </span>
                    ) : null}
                    {item.estimated_price != null && (
                      <span className="text-xs text-muted-foreground ml-1">
                        — £{item.estimated_price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <select
                    value={item.status}
                    onChange={(e) => onItemStatusChange(item.id, e.target.value)}
                    className={`text-[10px] rounded px-1.5 py-0.5 border-0 font-medium ${ITEM_STATUS_COLORS[item.status] || ""}`}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                  <button onClick={() => onRemoveItem(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors" title="Remove item">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No items yet</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Button variant="outline" size="sm" onClick={onAddItem} className="text-xs h-7">
              <Plus className="h-3 w-3 mr-1" /> Add Item
            </Button>
            {transitions.map((status) => (
              <Button
                key={status}
                variant="ghost"
                size="sm"
                onClick={() => onStatusChange(plan.id, status)}
                className="text-xs h-7"
              >
                {status === "PROPOSED" ? "Propose" :
                 status === "ACCEPTED" ? "Accept" :
                 status === "IN_PROGRESS" ? "Start" :
                 status === "COMPLETED" ? "Complete" :
                 status === "DECLINED" ? "Decline" :
                 status === "DRAFT" ? "Revert to Draft" : status}
              </Button>
            ))}

            {/* Send-to-patient — only meaningful while DRAFT or PROPOSED. We
                show "Resend" once acceptance_sent_at is stamped so staff can
                see the difference at a glance. Idempotent on the backend. */}
            {(plan.status === "DRAFT" || plan.status === "PROPOSED") && (
              <SendToPatientButton plan={plan} />
            )}
            {plan.status === "ACCEPTED" && plan.accepted_via === "patient_email" && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 ml-1">
                <CheckCircle2 className="h-3 w-3" />
                Patient accepted by email
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sends the treatment plan via the send-treatment-plan edge function. Shows
// "Send to patient" the first time, "Resend" once acceptance_sent_at is
// stamped — distinguishes "haven't asked yet" from "patient ignored us".
function SendToPatientButton({ plan }: { plan: TreatmentPlan }) {
  const [sending, setSending] = useState(false);
  const alreadySent = Boolean((plan as any).acceptance_sent_at);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        setSending(true);
        try {
          const { data, error } = await supabase.functions.invoke("send-treatment-plan", {
            body: { treatment_plan_id: plan.id },
          });
          if (error) {
            const fnMsg =
              (data as { error?: string } | null)?.error ?? error.message ?? "Send failed";
            toast.error(fnMsg);
            return;
          }
          if (!data?.success) {
            toast.error(data?.error ?? "Send failed");
            return;
          }
          toast.success(alreadySent ? "Plan resent to patient" : "Plan sent to patient");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Send failed");
        } finally {
          setSending(false);
        }
      }}
      disabled={sending}
      className="text-xs h-7 text-blue-700"
      title={alreadySent ? "Resend with the same link" : "Email this plan to the patient with an Accept button"}
    >
      <Send className="h-3 w-3 mr-1" />
      {sending ? "Sending…" : alreadySent ? "Resend" : "Send to patient"}
    </Button>
  );
}

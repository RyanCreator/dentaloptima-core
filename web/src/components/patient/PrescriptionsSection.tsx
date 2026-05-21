import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pill, Plus, ShieldAlert, XCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Prescription {
  id: string;
  drug_name: string;
  dose: string;
  frequency: string;
  duration: string;
  quantity: string;
  route: string | null;
  is_repeat: boolean;
  is_controlled_drug: boolean;
  indication: string;
  patient_counselled: boolean;
  warnings_given: string | null;
  status: string;
  issued_at: string | null;
  collected_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  prescriber_id: string;
  appointment_id: string | null;
}

interface AppointmentLite {
  id: string;
  starts_at: string;
  status: string;
}

interface MemberLite { id: string; full_name: string | null; role: string }

const STATUS_STYLE: Record<string, string> = {
  DRAFT:     "bg-amber-100 text-amber-700",
  ISSUED:    "bg-blue-100 text-blue-700",
  COLLECTED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-700",
  EXPIRED:   "bg-gray-100 text-gray-700",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const ROUTE_OPTIONS = [
  "ORAL", "TOPICAL", "INJECTION", "INHALED", "INTRANASAL", "OTHER",
];

interface PrescriptionsSectionProps {
  patientId: string;
}

export function PrescriptionsSection({ patientId }: PrescriptionsSectionProps) {
  const auth = useAuth();
  const [items, setItems] = useState<Prescription[]>([]);
  const [prescribers, setPrescribers] = useState<Record<string, MemberLite>>({});
  const [appointments, setAppointments] = useState<AppointmentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [cancelling, setCancelling] = useState<Prescription | null>(null);

  const canPrescribe =
    auth.member?.role === "OWNER" ||
    auth.member?.role === "DENTIST" ||
    auth.member?.role === "HYGIENIST";

  useEffect(() => { void load(); }, [patientId]);

  const load = async () => {
    setLoading(true);

    // Pull prescriptions + a lightweight list of this patient's
    // appointments in parallel — the latter feeds the "linked appointment"
    // picker on the new-prescription sheet and the display on each card.
    const [rxRes, apptRes] = await Promise.all([
      supabase
        .from("prescription")
        .select("*")
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointment")
        .select("id, starts_at, status")
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .order("starts_at", { ascending: false })
        .limit(30),
    ]);

    if (rxRes.error)   logger.error("prescription load failed", rxRes.error);
    if (apptRes.error) logger.error("appointment load failed", apptRes.error);

    const rows = (rxRes.data as Prescription[]) ?? [];
    setItems(rows);
    setAppointments((apptRes.data as AppointmentLite[]) ?? []);

    const prescriberIds = Array.from(new Set(rows.map((r) => r.prescriber_id)));
    if (prescriberIds.length > 0) {
      const { data: m } = await supabase
        .from("practice_member")
        .select("id, full_name, role")
        .in("id", prescriberIds);
      const map: Record<string, MemberLite> = {};
      (m ?? []).forEach((row) => { map[row.id] = row as MemberLite; });
      setPrescribers(map);
    }
    setLoading(false);
  };

  const issue = async (rxId: string) => {
    const { error } = await supabase
      .from("prescription")
      .update({ status: "ISSUED", issued_at: new Date().toISOString() })
      .eq("id", rxId);
    if (error) { toast.error("Couldn't issue"); logger.error("rx issue failed", error); return; }
    toast.success("Prescription issued");
    await load();
  };

  const markCollected = async (rxId: string) => {
    const { error } = await supabase
      .from("prescription")
      .update({ status: "COLLECTED", collected_at: new Date().toISOString() })
      .eq("id", rxId);
    if (error) { toast.error("Couldn't mark collected"); logger.error("rx collect failed", error); return; }
    toast.success("Marked collected");
    await load();
  };

  // Bucket by lifecycle stage so the most-relevant ones surface first.
  const buckets = useMemo(() => {
    const active:    Prescription[] = []; // DRAFT or ISSUED
    const completed: Prescription[] = []; // COLLECTED
    const dead:      Prescription[] = []; // CANCELLED, EXPIRED
    items.forEach((r) => {
      if (r.status === "DRAFT" || r.status === "ISSUED") active.push(r);
      else if (r.status === "COLLECTED") completed.push(r);
      else dead.push(r);
    });
    return { active, completed, dead };
  }, [items]);

  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Pill className="h-4 w-4 text-muted-foreground" />
          Prescriptions
          {buckets.active.length > 0 && (
            <span className="text-muted-foreground font-normal">({buckets.active.length} active)</span>
          )}
        </h3>
        {canPrescribe && (
          <Button variant="ghost" size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Prescribe
          </Button>
        )}
      </div>

      {!canPrescribe && items.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          Only dentists and hygienists can issue prescriptions.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 && canPrescribe ? (
        <p className="text-sm text-muted-foreground py-2">
          No prescriptions on file.
        </p>
      ) : (
        <div className="space-y-3">
          {buckets.active.length > 0 && (
            <PrescriptionGroup
              label="Active"
              rows={buckets.active}
              prescribers={prescribers}
              appointments={appointments}
              canManage={canPrescribe}
              onIssue={issue}
              onMarkCollected={markCollected}
              onCancel={setCancelling}
            />
          )}
          {buckets.completed.length > 0 && (
            <PrescriptionGroup
              label="Collected"
              rows={buckets.completed}
              prescribers={prescribers}
              appointments={appointments}
              canManage={false}
            />
          )}
          {buckets.dead.length > 0 && (
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground px-1">
                Show {buckets.dead.length} cancelled / expired
              </summary>
              <div className="mt-2">
                <PrescriptionGroup
                  label=""
                  rows={buckets.dead}
                  prescribers={prescribers}
                  appointments={appointments}
                  canManage={false}
                />
              </div>
            </details>
          )}
        </div>
      )}

      {canPrescribe && (
        <NewPrescriptionSheet
          open={showNew}
          onOpenChange={setShowNew}
          patientId={patientId}
          practiceId={auth.member?.practice_id ?? ""}
          prescriberId={auth.member?.id ?? ""}
          appointments={appointments}
          onCreated={load}
        />
      )}

      <CancelPrescriptionDialog
        prescription={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={async () => { setCancelling(null); await load(); }}
      />
    </div>
  );
}

interface PrescriptionGroupProps {
  label: string;
  rows: Prescription[];
  prescribers: Record<string, MemberLite>;
  appointments: AppointmentLite[];
  canManage: boolean;
  onIssue?: (rxId: string) => void;
  onMarkCollected?: (rxId: string) => void;
  onCancel?: (rx: Prescription) => void;
}

function PrescriptionGroup({ label, rows, prescribers, appointments, canManage, onIssue, onMarkCollected, onCancel }: PrescriptionGroupProps) {
  const apptById = new Map(appointments.map((a) => [a.id, a]));
  return (
    <div className="space-y-1">
      {label && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => {
          const prescriber = prescribers[r.prescriber_id]?.full_name;
          const linkedAppt = r.appointment_id ? apptById.get(r.appointment_id) : null;
          return (
            <div
              key={r.id}
              className={cn(
                "p-3 rounded border bg-muted/30",
                r.is_controlled_drug && "border-red-200 bg-red-50/40",
              )}
            >
              <div className="flex items-start gap-2">
                <Pill className={cn(
                  "h-4 w-4 shrink-0 mt-0.5",
                  r.is_controlled_drug ? "text-red-700" : "text-muted-foreground",
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.drug_name}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide",
                      STATUS_STYLE[r.status] ?? "bg-muted",
                    )}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.is_controlled_drug && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide">
                        <ShieldAlert className="h-3 w-3" /> Controlled
                      </span>
                    )}
                    {r.is_repeat && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide">
                        Repeat
                      </span>
                    )}
                  </div>

                  <p className="text-sm mt-1">
                    {r.dose} · {r.frequency} · {r.duration}
                    {r.route && <> · {r.route.toLowerCase()}</>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quantity: {r.quantity} · For: {r.indication}
                  </p>

                  {r.warnings_given && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <strong className="text-foreground">Warnings given:</strong> {r.warnings_given}
                    </p>
                  )}

                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
                    <span>Prescribed {format(parseISO(r.created_at), "d MMM yyyy")}</span>
                    {prescriber && <><span>·</span><span>by {prescriber}</span></>}
                    {linkedAppt && (
                      <>
                        <span>·</span>
                        <span>For visit {format(parseISO(linkedAppt.starts_at), "d MMM yyyy, HH:mm")}</span>
                      </>
                    )}
                    {r.issued_at && (
                      <><span>·</span><span>Issued {format(parseISO(r.issued_at), "d MMM yyyy")}</span></>
                    )}
                    {r.collected_at && (
                      <><span>·</span><span>Collected {format(parseISO(r.collected_at), "d MMM yyyy")}</span></>
                    )}
                    {r.patient_counselled && (
                      <><span>·</span><span className="text-green-700">Patient counselled</span></>
                    )}
                  </div>

                  {r.cancellation_reason && (
                    <p className="text-xs text-red-700 mt-1">
                      <strong>Cancelled:</strong> {r.cancellation_reason}
                    </p>
                  )}
                </div>

                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    {r.status === "DRAFT" && onIssue && (
                      <Button variant="outline" size="sm" onClick={() => onIssue(r.id)} className="h-7 text-xs">
                        Issue
                      </Button>
                    )}
                    {r.status === "ISSUED" && onMarkCollected && (
                      <Button variant="outline" size="sm" onClick={() => onMarkCollected(r.id)} className="h-7 text-xs">
                        Mark collected
                      </Button>
                    )}
                    {(r.status === "DRAFT" || r.status === "ISSUED") && onCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancel(r)}
                        className="h-7 text-xs text-muted-foreground hover:text-red-700"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface NewPrescriptionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  practiceId: string;
  prescriberId: string;
  appointments: AppointmentLite[];
  onCreated: () => Promise<void> | void;
}

function NewPrescriptionSheet({
  open, onOpenChange, patientId, practiceId, prescriberId, appointments, onCreated,
}: NewPrescriptionSheetProps) {
  const [drugName, setDrugName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [quantity, setQuantity] = useState("");
  const [route, setRoute] = useState<string>("");
  const [indication, setIndication] = useState("");
  const [isControlled, setIsControlled] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [patientCounselled, setPatientCounselled] = useState(false);
  const [warningsGiven, setWarningsGiven] = useState("");
  const [issueImmediately, setIssueImmediately] = useState(true);
  const [appointmentId, setAppointmentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Default to the most recent appointment in the last 7 days — that's
  // almost always the one the prescription is for. Older than that, the
  // dentist is more likely doing an out-of-band repeat — leave blank.
  useEffect(() => {
    if (!open) return;
    setDrugName("");
    setDose("");
    setFrequency("");
    setDuration("");
    setQuantity("");
    setRoute("ORAL");
    setIndication("");
    setIsControlled(false);
    setIsRepeat(false);
    setPatientCounselled(false);
    setWarningsGiven("");
    setIssueImmediately(true);

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = appointments.find((a) => parseISO(a.starts_at).getTime() > weekAgo);
    setAppointmentId(recent?.id ?? "");
  }, [open, appointments]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!drugName.trim())   { toast.error("Drug name is required");   return; }
    if (!dose.trim())       { toast.error("Dose is required");        return; }
    if (!frequency.trim())  { toast.error("Frequency is required");   return; }
    if (!duration.trim())   { toast.error("Duration is required");    return; }
    if (!quantity.trim())   { toast.error("Quantity is required");    return; }
    if (!indication.trim()) { toast.error("Indication is required");  return; }

    setSubmitting(true);
    try {
      const issuedAt = issueImmediately ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("prescription")
        .insert({
          practice_id:  practiceId,
          patient_id:   patientId,
          prescriber_id: prescriberId,
          appointment_id: appointmentId || null,
          drug_name:    drugName.trim(),
          dose:         dose.trim(),
          frequency:    frequency.trim(),
          duration:     duration.trim(),
          quantity:     quantity.trim(),
          route:        route || null,
          is_repeat:    isRepeat,
          is_controlled_drug: isControlled,
          indication:   indication.trim(),
          patient_counselled: patientCounselled,
          warnings_given: warningsGiven.trim() || null,
          status:       issueImmediately ? "ISSUED" : "DRAFT",
          issued_at:    issuedAt,
        });
      if (error) throw error;
      toast.success(issueImmediately ? "Prescription issued" : "Saved as draft");
      onOpenChange(false);
      await onCreated();
    } catch (err) {
      logger.error("prescription create failed", err);
      toast.error(err instanceof Error ? err.message : "Couldn't create prescription");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New prescription</SheetTitle>
          <SheetDescription>
            Captured as a separate record from notes, with controlled-drug
            and counselling flags for CQC inspection.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label>Drug name *</Label>
            <Input
              value={drugName}
              onChange={(e) => setDrugName(e.target.value)}
              placeholder="e.g. Amoxicillin, Ibuprofen, Diazepam"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Dose *</Label>
              <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="500 mg" />
            </div>
            <div className="space-y-1">
              <Label>Route *</Label>
              <Select value={route} onValueChange={setRoute}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>
                  {ROUTE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Frequency *</Label>
              <Input
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="3 times daily"
              />
            </div>
            <div className="space-y-1">
              <Label>Duration *</Label>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="5 days"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Quantity *</Label>
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="15 tablets / 100ml / etc."
            />
          </div>

          <div className="space-y-1">
            <Label>Indication *</Label>
            <Input
              value={indication}
              onChange={(e) => setIndication(e.target.value)}
              placeholder="What you're prescribing it for (e.g. dental abscess, post-op pain)"
            />
          </div>

          {/* Linked appointment — optional but useful for audit + recall.
              We pre-populate with the most recent recent visit. */}
          {appointments.length > 0 && (
            <div className="space-y-1">
              <Label>Linked appointment</Label>
              <Select
                value={appointmentId || "__none__"}
                onValueChange={(v) => setAppointmentId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="No appointment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No appointment</SelectItem>
                  {appointments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {format(parseISO(a.starts_at), "EEE d MMM, HH:mm")} · {a.status.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Useful for audit + recall. Leave blank for ad-hoc / repeat prescriptions.
              </p>
            </div>
          )}

          {/* Counselling + warnings — CQC will check these for any rx */}
          <div className="rounded border bg-muted/30 p-3 space-y-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={patientCounselled}
                onChange={(e) => setPatientCounselled(e.target.checked)}
                className="mt-1 shrink-0"
              />
              <div>
                <span className="font-medium">Patient counselled</span>
                <p className="text-xs text-muted-foreground">
                  Tick to confirm you've discussed how to take it, side effects, and what to do if it doesn't work.
                </p>
              </div>
            </label>

            <div className="space-y-1">
              <Label>Specific warnings given</Label>
              <Textarea
                value={warningsGiven}
                onChange={(e) => setWarningsGiven(e.target.value)}
                placeholder="Allergies discussed, interactions with current meds, no alcohol, etc."
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isControlled}
                onChange={(e) => setIsControlled(e.target.checked)}
              />
              <ShieldAlert className="h-3.5 w-3.5 text-red-700" />
              Controlled drug
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isRepeat}
                onChange={(e) => setIsRepeat(e.target.checked)}
              />
              Repeat
            </label>
          </div>

          <div className="rounded border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={issueImmediately}
                onChange={(e) => setIssueImmediately(e.target.checked)}
              />
              <span>Issue now (otherwise saves as a draft)</span>
            </label>
          </div>

          <SheetFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              <FileText className="h-4 w-4 mr-1" />
              {submitting ? "Saving…" : issueImmediately ? "Issue prescription" : "Save draft"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface CancelPrescriptionDialogProps {
  prescription: Prescription | null;
  onClose: () => void;
  onCancelled: () => Promise<void> | void;
}

function CancelPrescriptionDialog({ prescription, onClose, onCancelled }: CancelPrescriptionDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (prescription) setReason(""); }, [prescription]);
  if (!prescription) return null;

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast.error("Reason is required when cancelling a prescription");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("prescription")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason.trim(),
      })
      .eq("id", prescription.id);
    setSubmitting(false);
    if (error) {
      logger.error("prescription cancel failed", error);
      toast.error("Couldn't cancel");
      return;
    }
    toast.success("Prescription cancelled");
    await onCancelled();
  };

  return (
    <Dialog open={Boolean(prescription)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel prescription?</DialogTitle>
          <DialogDescription>
            {prescription.drug_name} ({prescription.dose}). The record stays for audit — cancellation just marks it withdrawn from this point on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 mt-2">
          <Label>Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required — e.g. allergy reported, dosing error, treatment plan changed"
            rows={3}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Keep prescription</Button>
          <Button variant="destructive" onClick={handleCancel} disabled={submitting}>
            <XCircle className="h-4 w-4 mr-1" />
            {submitting ? "Cancelling…" : "Cancel prescription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

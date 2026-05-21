import { useEffect, useState, type FormEvent } from "react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  detail: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const TYPE_OPTIONS = [
  { value: "ALLERGY",          label: "Allergy" },
  { value: "MEDICAL_CONDITION",label: "Medical condition" },
  { value: "ANTICOAGULANT",    label: "Anticoagulant" },
  { value: "PREGNANCY",        label: "Pregnancy" },
  { value: "LATEX_ALLERGY",    label: "Latex allergy" },
  { value: "INFECTION_RISK",   label: "Infection risk" },
  { value: "DRUG_INTERACTION", label: "Drug interaction" },
  { value: "SAFEGUARDING",     label: "Safeguarding flag" },
  { value: "OTHER",            label: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical", style: "bg-red-100 text-red-700" },
  { value: "HIGH",     label: "High",     style: "bg-amber-100 text-amber-700" },
  { value: "MEDIUM",   label: "Medium",   style: "bg-blue-100 text-blue-700" },
  { value: "LOW",      label: "Low",      style: "bg-muted text-muted-foreground" },
];

interface MedicalAlertsSectionProps {
  patientId: string;
  /** Optional callback so the patient banner can refresh after edits. */
  onChange?: () => void;
}

export function MedicalAlertsSection({ patientId, onChange }: MedicalAlertsSectionProps) {
  const auth = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { void load(); }, [patientId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("medical_alert")
      .select("id, alert_type, severity, title, detail, is_active, expires_at, created_at")
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) logger.error("alerts load failed", error);
    const rows = (data as AlertRow[]) ?? [];

    // Auto-expire pass — any active alert whose expires_at has passed gets
    // flipped to inactive in the background. Idempotent and audit-logged
    // via the medical_alert trigger. We don't await it (the user already
    // has data to look at); next reload picks up the change.
    const nowIso = new Date().toISOString();
    const stale = rows.filter((a) => a.is_active && a.expires_at && a.expires_at < nowIso);
    if (stale.length > 0) {
      void supabase
        .from("medical_alert")
        .update({ is_active: false })
        .in("id", stale.map((a) => a.id))
        .then(({ error: expErr }) => {
          if (expErr) logger.error("alert auto-expire failed", expErr);
          else {
            // Reflect the change locally so the UI is consistent without
            // a second round-trip. Also notify the patient banner.
            setAlerts((prev) =>
              prev.map((a) => stale.some((s) => s.id === a.id) ? { ...a, is_active: false } : a),
            );
            onChange?.();
          }
        });
    }

    setAlerts(rows);
    setLoading(false);
  };

  const deactivate = async (alertId: string) => {
    const { error } = await supabase
      .from("medical_alert")
      .update({ is_active: false })
      .eq("id", alertId);
    if (error) { toast.error("Couldn't expire alert"); logger.error("alert expire failed", error); return; }
    toast.success("Alert expired", {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: undoErr } = await supabase
            .from("medical_alert")
            .update({ is_active: true })
            .eq("id", alertId);
          if (undoErr) { toast.error("Couldn't undo"); return; }
          toast.success("Alert restored");
          await load();
          onChange?.();
        },
      },
    });
    await load();
    onChange?.();
  };

  const reactivate = async (alertId: string) => {
    const { error } = await supabase
      .from("medical_alert")
      .update({ is_active: true })
      .eq("id", alertId);
    if (error) { toast.error("Couldn't reactivate"); logger.error("alert reactivate failed", error); return; }
    toast.success("Alert reactivated");
    await load();
    onChange?.();
  };

  const remove = async (alertId: string) => {
    if (!confirm("Soft-delete this alert? CQC requires it remain retrievable in audit history.")) return;
    const { error } = await supabase
      .from("medical_alert")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", alertId);
    if (error) { toast.error("Couldn't delete"); logger.error("alert delete failed", error); return; }
    toast.success("Alert deleted");
    await load();
    onChange?.();
  };

  const active   = alerts.filter((a) => a.is_active);
  const inactive = alerts.filter((a) => !a.is_active);

  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Medical alerts
          {active.length > 0 && (
            <span className="text-muted-foreground font-normal">({active.length} active)</span>
          )}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setShowNew(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No medical alerts. Use "Add" for allergies, anticoagulants, pregnancy, latex sensitivity, infection risks, etc.
        </p>
      ) : (
        <div className="space-y-1.5">
          {active.map((a) => (
            <AlertRowCard
              key={a.id}
              alert={a}
              onEdit={() => { setEditingId(a.id); setShowNew(true); }}
              onExpire={() => deactivate(a.id)}
              onDelete={() => remove(a.id)}
            />
          ))}
          {inactive.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Show {inactive.length} expired alert{inactive.length === 1 ? "" : "s"}
              </summary>
              <div className="space-y-1.5 mt-2 opacity-60">
                {inactive.map((a) => (
                  <AlertRowCard
                    key={a.id}
                    alert={a}
                    onEdit={() => { setEditingId(a.id); setShowNew(true); }}
                    onReactivate={() => reactivate(a.id)}
                    onDelete={() => remove(a.id)}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <NewAlertSheet
        open={showNew}
        onOpenChange={(o) => { setShowNew(o); if (!o) setEditingId(null); }}
        patientId={patientId}
        practiceId={auth.member?.practice_id ?? ""}
        existing={editingId ? alerts.find((a) => a.id === editingId) ?? null : null}
        onSaved={async () => { await load(); onChange?.(); }}
      />
    </div>
  );
}

interface AlertRowCardProps {
  alert: AlertRow;
  onEdit: () => void;
  onExpire?: () => void;
  onReactivate?: () => void;
  onDelete: () => void;
}

function AlertRowCard({ alert, onEdit, onExpire, onReactivate, onDelete }: AlertRowCardProps) {
  const sev = SEVERITY_OPTIONS.find((s) => s.value === alert.severity);
  const typeLabel = TYPE_OPTIONS.find((t) => t.value === alert.alert_type)?.label ?? alert.alert_type;

  return (
    <div className="flex items-center gap-2 text-sm p-3 rounded border bg-muted/30">
      <AlertTriangle className={cn("h-4 w-4 shrink-0",
        alert.severity === "CRITICAL" ? "text-red-600"
          : alert.severity === "HIGH" ? "text-amber-600"
          : "text-muted-foreground",
      )} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{alert.title}</span>
          {sev && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide", sev.style)}>
              {sev.label}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{typeLabel}</span>
        </div>
        {alert.detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
        )}
        {alert.expires_at && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-expires {format(parseISO(alert.expires_at), "d MMM yyyy")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 text-xs">Edit</Button>
        {onExpire && (
          <Button variant="ghost" size="sm" onClick={onExpire} className="h-7 text-xs text-muted-foreground">Expire</Button>
        )}
        {onReactivate && (
          <Button variant="ghost" size="sm" onClick={onReactivate} className="h-7 text-xs text-primary">Reactivate</Button>
        )}
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-red-600 p-1"
          aria-label="Delete"
          title="Delete"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface NewAlertSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  practiceId: string;
  existing: AlertRow | null;
  onSaved: () => Promise<void> | void;
}

function NewAlertSheet({ open, onOpenChange, patientId, practiceId, existing, onSaved }: NewAlertSheetProps) {
  const [alertType, setAlertType] = useState("");
  const [severity, setSeverity]   = useState("");
  const [title, setTitle]         = useState("");
  const [detail, setDetail]       = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Hydrate when opening — either fresh or with the existing row's values.
  // expiresAt is a timestamptz on the DB; the date input wants YYYY-MM-DD,
  // so we trim to the date portion.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setAlertType(existing.alert_type);
      setSeverity(existing.severity);
      setTitle(existing.title);
      setDetail(existing.detail ?? "");
      setExpiresAt(existing.expires_at ? existing.expires_at.slice(0, 10) : "");
    } else {
      setAlertType("");
      setSeverity("HIGH");
      setTitle("");
      setDetail("");
      setExpiresAt("");
    }
  }, [open, existing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!alertType)     { toast.error("Pick an alert type"); return; }
    if (!severity)      { toast.error("Pick a severity");    return; }
    if (!title.trim())  { toast.error("Title is required");  return; }

    setSubmitting(true);
    try {
      if (existing) {
        const { error } = await supabase
          .from("medical_alert")
          .update({
            alert_type: alertType,
            severity,
            title: title.trim(),
            detail: detail.trim() || null,
            expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          })
          .eq("id", existing.id);
        if (error) throw error;
        toast.success("Alert updated");
      } else {
        const { error } = await supabase
          .from("medical_alert")
          .insert({
            practice_id: practiceId,
            patient_id: patientId,
            alert_type: alertType,
            severity,
            title: title.trim(),
            detail: detail.trim() || null,
            expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            is_active: true,
          });
        if (error) throw error;
        toast.success("Alert added");
      }
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      logger.error("alert save failed", err);
      toast.error(err instanceof Error ? err.message : "Couldn't save alert");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{existing ? "Edit medical alert" : "Add medical alert"}</SheetTitle>
          <SheetDescription>
            Shown as a banner at the top of this patient's record. Use for things any clinician must see before treating.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type *</Label>
              <Select value={alertType} onValueChange={setAlertType}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Severity *</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What clinicians should see at a glance — e.g. 'Allergic to penicillin'"
              maxLength={120}
            />
          </div>

          <div className="space-y-1">
            <Label>Detail</Label>
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="More context (drug names, reaction history, anticoagulant type + dose, due date for pregnancy, etc)"
              rows={4}
            />
          </div>

          <div className="space-y-1">
            <Label>Auto-expire on</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional — useful for pregnancy alerts that should clear automatically.
            </p>
          </div>

          <SheetFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : existing ? "Save changes" : "Add alert"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

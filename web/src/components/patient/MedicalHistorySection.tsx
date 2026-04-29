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
import { Badge } from "@/components/Badge";
import { format, parseISO } from "date-fns";
import { Plus, Pill, AlertTriangle, Bug, Stethoscope, FileText } from "lucide-react";
import { useMedicalHistory, type MedicalHistoryEntry } from "@/hooks/useMedicalHistory";

const ENTRY_TYPES = [
  { value: "condition", label: "Condition", icon: Stethoscope },
  { value: "medication", label: "Medication", icon: Pill },
  { value: "allergy", label: "Allergy", icon: AlertTriangle },
  { value: "procedure", label: "Procedure", icon: FileText },
  { value: "event", label: "Event", icon: Bug },
] as const;

const SEVERITIES = [
  { value: "low", label: "Low", color: "bg-blue-100 text-blue-700" },
  { value: "medium", label: "Medium", color: "bg-amber-100 text-amber-700" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-700" },
];

function getTypeIcon(type: string) {
  const found = ENTRY_TYPES.find((t) => t.value === type);
  return found ? found.icon : FileText;
}

function getSeverityStyle(severity: string | null) {
  if (!severity) return null;
  return SEVERITIES.find((s) => s.value === severity);
}

interface MedicalHistorySectionProps {
  patientId: string;
}

export function MedicalHistorySection({ patientId }: MedicalHistorySectionProps) {
  const { entries, loading, addEntry, toggleActive } = useMedicalHistory(patientId);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    entry_type: "condition",
    title: "",
    details: "",
    severity: "",
    onset_date: "",
  });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const success = await addEntry({
      entry_type: form.entry_type,
      title: form.title.trim(),
      details: form.details.trim(),
      severity: form.severity || undefined,
      onset_date: form.onset_date || undefined,
    });
    if (success) {
      setShowAdd(false);
      setForm({ entry_type: "condition", title: "", details: "", severity: "", onset_date: "" });
    }
    setSaving(false);
  };

  // Group entries by type
  const active = entries.filter((e) => e.is_active);
  const resolved = entries.filter((e) => !e.is_active);

  // Group active by type
  const grouped = ENTRY_TYPES.map((type) => ({
    ...type,
    entries: active.filter((e) => e.entry_type === type.value),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="bg-card rounded-lg border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Medical History</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No medical history recorded
        </p>
      ) : (
        <div className="space-y-4">
          {/* Active entries grouped by type */}
          {grouped.map(({ value, label, icon: Icon, entries: typeEntries }) => (
            <div key={value}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {label}s
                </h4>
              </div>
              <div className="space-y-1.5">
                {typeEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onToggle={toggleActive} />
                ))}
              </div>
            </div>
          ))}

          {/* Resolved entries */}
          {resolved.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Resolved ({resolved.length})
              </h4>
              <div className="space-y-1.5">
                {resolved.slice(0, 5).map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onToggle={toggleActive} />
                ))}
                {resolved.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{resolved.length - 5} more resolved entries
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add entry Sheet */}
      <Sheet open={showAdd} onOpenChange={setShowAdd}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add Medical History</SheetTitle>
            <SheetDescription className="sr-only">
              Record a new medical history entry for this patient
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.entry_type} onValueChange={(v) => setForm((f) => ({ ...f, entry_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTRY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={
                  form.entry_type === "condition" ? "e.g. Type 2 diabetes" :
                  form.entry_type === "medication" ? "e.g. Warfarin 5mg" :
                  form.entry_type === "allergy" ? "e.g. Penicillin" :
                  form.entry_type === "procedure" ? "e.g. Root canal, UR6" :
                  "e.g. Hospital admission"
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Details (optional)</Label>
              <Textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Onset date</Label>
                <Input
                  type="date"
                  value={form.onset_date}
                  onChange={(e) => setForm((f) => ({ ...f, onset_date: e.target.value }))}
                />
              </div>
            </div>

            <Button onClick={handleAdd} disabled={saving || !form.title.trim()} className="w-full">
              {saving ? "Saving..." : "Add Entry"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry row component
// ---------------------------------------------------------------------------
function EntryRow({
  entry,
  onToggle,
}: {
  entry: MedicalHistoryEntry;
  onToggle: (id: string, active: boolean) => void;
}) {
  const Icon = getTypeIcon(entry.entry_type);
  const sevStyle = getSeverityStyle(entry.severity);

  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-md border text-sm ${
      entry.is_active ? "bg-background" : "bg-muted/30 opacity-70"
    }`}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-medium ${!entry.is_active ? "line-through" : ""}`}>
            {entry.title}
          </span>
          {sevStyle && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sevStyle.color}`}>
              {sevStyle.label}
            </span>
          )}
        </div>
        {entry.details && (
          <p className="text-xs text-muted-foreground mt-0.5">{entry.details}</p>
        )}
        <div className="text-[10px] text-muted-foreground mt-1">
          {entry.onset_date && <>Since {format(parseISO(entry.onset_date), "MMM yyyy")} &middot; </>}
          {entry.staff?.full_name && <>{entry.staff.full_name} &middot; </>}
          {format(new Date(entry.created_at), "d MMM yyyy")}
        </div>
      </div>
      <button
        onClick={() => onToggle(entry.id, !entry.is_active)}
        className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border shrink-0"
        title={entry.is_active ? "Mark as resolved" : "Mark as active"}
      >
        {entry.is_active ? "Resolve" : "Reactivate"}
      </button>
    </div>
  );
}

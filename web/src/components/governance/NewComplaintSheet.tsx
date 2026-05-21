import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { X, Search } from "lucide-react";

interface NewComplaintSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface PatientHit  { id: string; full_name: string }
interface StaffOption { id: string; full_name: string | null; role: string }

const METHOD_OPTIONS = [
  { value: "IN_PERSON",    label: "In person" },
  { value: "PHONE",        label: "Phone" },
  { value: "EMAIL",        label: "Email" },
  { value: "LETTER",       label: "Letter" },
  { value: "WEBSITE",      label: "Website / review form" },
  { value: "SOCIAL_MEDIA", label: "Social media" },
  { value: "OTHER",        label: "Other" },
];

function nowLocalDatetimeInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewComplaintSheet({ open, onOpenChange, onCreated }: NewComplaintSheetProps) {
  const auth = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [complainantName, setComplainantName] = useState("");
  const [complainantRelation, setComplainantRelation] = useState("");
  const [complainantEmail, setComplainantEmail] = useState("");
  const [complainantPhone, setComplainantPhone] = useState("");

  const [receivedAt, setReceivedAt] = useState<string>(nowLocalDatetimeInput());
  const [receivedVia, setReceivedVia] = useState<string>("");

  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");

  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const [searchingPatient, setSearchingPatient] = useState(false);

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffNamed, setStaffNamed] = useState<string[]>([]);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setComplainantName("");
    setComplainantRelation("");
    setComplainantEmail("");
    setComplainantPhone("");
    setReceivedAt(nowLocalDatetimeInput());
    setReceivedVia("");
    setSummary("");
    setDetail("");
    setPatient(null);
    setPatientQuery("");
    setPatientHits([]);
    setStaffNamed([]);
  }, [open]);

  // Load staff list once when first opened.
  useEffect(() => {
    if (!open || staffOptions.length > 0) return;
    void (async () => {
      const { data, error } = await supabase
        .from("practice_member")
        .select("id, full_name, role")
        .eq("is_active", true)
        .order("full_name");
      if (error) logger.error("staff load failed", error);
      else setStaffOptions((data as StaffOption[]) || []);
    })();
  }, [open, staffOptions.length]);

  // Debounced patient search.
  useEffect(() => {
    const q = patientQuery.trim();
    if (q.length < 2) { setPatientHits([]); return; }
    const t = setTimeout(async () => {
      setSearchingPatient(true);
      const { data, error } = await supabase
        .from("patient")
        .select("id, full_name")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .is("deleted_at", null)
        .limit(8);
      if (error) logger.error("patient search failed", error);
      else setPatientHits((data as PatientHit[]) || []);
      setSearchingPatient(false);
    }, 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const toggleStaff = (id: string) => {
    setStaffNamed((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!auth.member) { toast.error("Not signed in"); return; }
    if (!complainantName.trim()) { toast.error("Complainant name is required"); return; }
    if (!receivedVia)            { toast.error("Pick how it was received");      return; }
    if (!summary.trim())         { toast.error("Add a one-line summary");        return; }
    if (!detail.trim())          { toast.error("Add the full complaint detail"); return; }

    setSubmitting(true);
    try {
      const receivedIso = new Date(receivedAt).toISOString();
      const { error } = await supabase
        .from("complaint")
        .insert({
          practice_id:  auth.member.practice_id,
          patient_id:   patient?.id ?? null,
          complainant_name:     complainantName.trim(),
          complainant_relation: complainantRelation.trim() || null,
          complainant_email:    complainantEmail.trim() || null,
          complainant_phone:    complainantPhone.trim() || null,
          received_at:  receivedIso,
          received_via: receivedVia,
          received_by:  auth.member.id,
          summary:      summary.trim(),
          detail:       detail.trim(),
          staff_named:  staffNamed.length > 0 ? staffNamed : null,
          status:       "NEW",
        });
      if (error) throw error;
      toast.success("Complaint logged");
      toast.message("Acknowledge within 3 working days — CQC requirement.");
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      logger.error("complaint create failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to log complaint");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Record a complaint</SheetTitle>
          <SheetDescription>
            CQC requires this to be acknowledged within 3 working days and responded to within 28 days.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Complainant */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Complainant
            </h3>

            <div className="space-y-1">
              <Label>Name *</Label>
              <Input
                value={complainantName}
                onChange={(e) => setComplainantName(e.target.value)}
                placeholder="Full name of the person complaining"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Relation to patient</Label>
                <Input
                  value={complainantRelation}
                  onChange={(e) => setComplainantRelation(e.target.value)}
                  placeholder="Self, parent, guardian, advocate..."
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={complainantEmail}
                  onChange={(e) => setComplainantEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={complainantPhone}
                onChange={(e) => setComplainantPhone(e.target.value)}
              />
            </div>
          </section>

          {/* Receipt */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Receipt
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Received *</Label>
                <Input
                  type="datetime-local"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Method *</Label>
                <Select value={receivedVia} onValueChange={setReceivedVia}>
                  <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Substance */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Substance
            </h3>

            <div className="space-y-1">
              <Label>Summary *</Label>
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line description — appears in lists and reports"
                maxLength={200}
              />
            </div>

            <div className="space-y-1">
              <Label>Full detail *</Label>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="What the patient said, in their words where possible. Capture facts before interpretation."
                rows={6}
              />
            </div>

            {/* Patient (optional — complainant may be parent/guardian) */}
            <div className="space-y-1">
              <Label>Patient referred to (if applicable)</Label>
              {patient ? (
                <div className="flex items-center gap-2 bg-muted/40 rounded px-3 py-2 text-sm">
                  <span className="flex-1">{patient.full_name}</span>
                  <button
                    type="button"
                    onClick={() => { setPatient(null); setPatientQuery(""); }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear patient"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                      placeholder="Search by name or email..."
                      className="pl-9"
                    />
                  </div>
                  {patientQuery.trim().length >= 2 && (
                    <div className="rounded border bg-card max-h-48 overflow-y-auto">
                      {searchingPatient ? (
                        <p className="text-xs text-muted-foreground p-2">Searching...</p>
                      ) : patientHits.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2">No matches</p>
                      ) : (
                        patientHits.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setPatient(p); setPatientQuery(""); setPatientHits([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          >
                            {p.full_name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Staff named in the complaint</Label>
              <div className="rounded border bg-card divide-y max-h-44 overflow-y-auto">
                {staffOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">Loading staff…</p>
                ) : (
                  staffOptions.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={staffNamed.includes(s.id)}
                        onChange={() => toggleStaff(s.id)}
                        className="rounded"
                      />
                      <span className="flex-1">{s.full_name ?? "Unnamed"}</span>
                      <span className="text-xs text-muted-foreground">{s.role}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </section>

          <SheetFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Logging…" : "Log complaint"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

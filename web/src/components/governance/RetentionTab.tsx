import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, differenceInYears } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Archive, ShieldAlert, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { GlossaryTerm } from "@/components/GlossaryTerm";

interface EligibleRow {
  patient_id: string;
  patient_number: number | null;
  full_name: string;
  dob: string | null;
  last_visited_at: string | null;
  registration_status: string;
}

export function RetentionTab() {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";

  const [items, setItems] = useState<EligibleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [anonymising, setAnonymising] = useState<EligibleRow | null>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_retention_eligible_patients");
    if (error) logger.error("retention list failed", error);
    setItems(((data as EligibleRow[]) ?? []));
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((r) =>
      r.full_name.toLowerCase().includes(s) ||
      String(r.patient_number ?? "").includes(s),
    );
  }, [items, search]);

  if (!isAdmin) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
        Only practice admins can view the retention queue.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Explainer — retention is one of the things CQC + ICO will ask about
          and it's invisible until you go looking, so the page is a primary
          surface for it. */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-semibold">
              <GlossaryTerm term="GDPR" /> <GlossaryTerm term="Retention">retention</GlossaryTerm>
            </p>
            <p className="text-muted-foreground">
              Patients listed below are past their retention window and eligible
              for anonymisation. Anonymising clears their identifying details and
              soft-deletes the record, but keeps clinical history retrievable
              (so <GlossaryTerm term="CQC" /> can still see what care was given).
            </p>
            <p className="text-xs text-muted-foreground">
              Retention windows: 11 years from last visit for adults · until age 25 for under-18s · never if{" "}
              <GlossaryTerm term="LegalHold">legal hold</GlossaryTerm> is set.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or patient number..."
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {items.length} eligible
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <Archive className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">
            {items.length === 0 ? "Nothing eligible for retention purge" : "No matches"}
          </p>
          <p className="text-sm mt-1">
            {items.length === 0
              ? "All your active patients are still within their retention window or under legal hold."
              : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border divide-y">
          {filtered.map((r) => {
            const age = r.dob ? differenceInYears(new Date(), parseISO(r.dob)) : null;
            return (
              <div key={r.patient_id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{r.full_name}</span>
                    {r.patient_number != null && (
                      <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                        #{r.patient_number}
                      </span>
                    )}
                    <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 uppercase tracking-wide">
                      {r.registration_status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                    {r.dob && <span>DOB {format(parseISO(r.dob), "d MMM yyyy")}{age != null && ` · ${age}y`}</span>}
                    <span>·</span>
                    <span>
                      {r.last_visited_at
                        ? `Last visit ${format(parseISO(r.last_visited_at), "d MMM yyyy")}`
                        : "No recorded visits"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/patients/${r.patient_id}`)}
                    className="h-8 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAnonymising(r)}
                    className="h-8 text-xs text-red-700 hover:text-red-800 hover:bg-red-50"
                  >
                    Anonymise
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnonymisePatientDialog
        patient={anonymising}
        onClose={() => setAnonymising(null)}
        onDone={async () => {
          setAnonymising(null);
          await load();
        }}
      />
    </div>
  );
}

interface AnonymisePatientDialogProps {
  patient: EligibleRow | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

function AnonymisePatientDialog({ patient, onClose, onDone }: AnonymisePatientDialogProps) {
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (patient) setTypedName(""); }, [patient]);

  if (!patient) return null;

  // Type-the-name confirmation. Lifts the bar from "click button" to
  // "deliberately re-type the patient's name", because this is irreversible.
  const expected = patient.full_name.trim();
  const matches = typedName.trim().toLowerCase() === expected.toLowerCase();

  const handleConfirm = async () => {
    if (!matches) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("anonymise_patient", { p_patient_id: patient.patient_id });
    setSubmitting(false);
    if (error) {
      logger.error("anonymise failed", error);
      toast.error(error.message || "Couldn't anonymise");
      return;
    }
    toast.success(`Anonymised — ${patient.full_name}`);
    toast.message("Audit-logged. The patient record is now redacted and soft-deleted.");
    await onDone();
  };

  return (
    <Dialog open={Boolean(patient)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-700" /> Anonymise patient?
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              This permanently redacts the patient's identifying details and
              soft-deletes the record. <strong>It cannot be undone.</strong>
            </span>
            <span className="block">
              Clinical history rows stay intact (CQC can still see what care
              was given), but the patient is no longer identifiable.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          <Label className="text-xs">
            To confirm, type the patient's full name: <strong>{expected}</strong>
          </Label>
          <Input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={expected}
            autoComplete="off"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!matches || submitting}
          >
            {submitting ? "Anonymising…" : "Anonymise permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

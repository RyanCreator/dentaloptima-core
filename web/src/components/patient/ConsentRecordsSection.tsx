import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
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
import {
  FileCheck2, Plus, CheckCircle2, XCircle, Clock, PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignatureCaptureDialog } from "@/components/SignatureCaptureDialog";

interface ConsentRow {
  id: string;
  consent_type: string;
  consent_version: string;
  consent_text: string;
  granted_at: string;
  granted_method: string;
  granted_by_patient: boolean;
  guardian_name: string | null;
  guardian_relation: string | null;
  witnessed_by: string | null;
  document_id: string | null;
  valid_until: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
}

interface MemberLite { id: string; full_name: string | null }

const TYPE_OPTIONS = [
  { value: "PRIVACY_NOTICE",     label: "Privacy notice",            scope: "Practice-wide" },
  { value: "TREATMENT_GENERAL",  label: "Treatment — general",       scope: "Ongoing care" },
  { value: "TREATMENT_SPECIFIC", label: "Treatment — specific",      scope: "One procedure" },
  { value: "X_RAY",              label: "X-ray / radiograph",        scope: "Imaging" },
  { value: "SEDATION",           label: "Sedation",                  scope: "Per procedure" },
  { value: "PHOTOGRAPHY",        label: "Clinical photography",       scope: "Per procedure" },
  { value: "NHS_TERMS",          label: "NHS terms of service",      scope: "NHS care" },
  { value: "MARKETING",          label: "Marketing communications",  scope: "Practice-wide" },
  { value: "DATA_SHARING",       label: "Data sharing",              scope: "GDPR" },
];

const METHOD_OPTIONS = [
  { value: "DIGITAL_SIGNATURE", label: "Digital signature" },
  { value: "IPAD_SIGNATURE",    label: "iPad signature" },
  { value: "PAPER",             label: "Paper form (filed)" },
  { value: "VERBAL",            label: "Verbal (documented)" },
];

// Template text used as a starting point when the user picks a consent type.
// The patient will see + agree to exactly what's in the textarea at grant
// time — these are deliberately conservative defaults, the practice will
// likely customise them. The schema freezes the text once stored, so future
// edits here don't retroactively change existing records.
const TEMPLATE_TEXT: Record<string, string> = {
  PRIVACY_NOTICE:
    "I have read and understood the practice's privacy notice. I understand how my personal and clinical information will be collected, stored, used, and shared. I understand my rights under UK GDPR including the right to access, rectify, and erase my data.",
  TREATMENT_GENERAL:
    "I consent to receiving general dental care at this practice. I understand that my dentist will discuss specific treatments with me before they are carried out, and that I may withdraw consent for any treatment at any time.",
  TREATMENT_SPECIFIC:
    "I consent to the specific treatment described above. I have been given the opportunity to ask questions, and I understand the risks, benefits, and alternatives. I understand I may withdraw consent at any time before treatment begins.",
  X_RAY:
    "I consent to dental radiographs (X-rays). I understand that radiographs are clinically justified, that the dose is kept as low as reasonably practicable, and that this is necessary for my diagnosis and treatment.",
  SEDATION:
    "I consent to conscious sedation for the procedure discussed. I understand the risks and have received fasting and post-procedure instructions. I confirm I have a responsible adult to accompany me home and stay with me for the rest of the day.",
  PHOTOGRAPHY:
    "I consent to clinical photographs being taken for my dental records. I understand these may be used for my treatment planning, monitoring, and (where I separately consent) for anonymised teaching or research.",
  NHS_TERMS:
    "I have read and accept the NHS terms of service for dental treatment, including charge bands, exemption rules, and my obligations as an NHS patient.",
  MARKETING:
    "I consent to receiving marketing communications from this practice via the channels I have selected. I understand I may withdraw consent at any time.",
  DATA_SHARING:
    "I consent to my dental records being shared with the specified third parties (referring specialists, NHS Business Services Authority, insurers as applicable) where necessary for my care.",
};

const METHOD_LABEL: Record<string, string> =
  Object.fromEntries(METHOD_OPTIONS.map((o) => [o.value, o.label]));
const TYPE_LABEL: Record<string, string> =
  Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

interface ConsentRecordsSectionProps {
  patientId: string;
}

export function ConsentRecordsSection({ patientId }: ConsentRecordsSectionProps) {
  const auth = useAuth();
  const [records, setRecords] = useState<ConsentRow[]>([]);
  const [members, setMembers] = useState<Record<string, MemberLite>>({});
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<ConsentRow | null>(null);
  const [revoking, setRevoking] = useState<ConsentRow | null>(null);
  // Retrofit-signing of an existing consent — separate from the inline
  // capture chain in NewConsentSheet. Lets the practice come back later
  // and attach a signature to a consent that was originally captured
  // verbally / on paper.
  const [signing, setSigning] = useState<ConsentRow | null>(null);

  useEffect(() => { void load(); }, [patientId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("consent_record")
      .select("*")
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("granted_at", { ascending: false });
    if (error) logger.error("consent load failed", error);
    const rows = (data as ConsentRow[]) ?? [];
    setRecords(rows);

    // Resolve witnessing-staff names.
    const memberIds = Array.from(new Set(
      rows.map((r) => r.witnessed_by).filter((v): v is string => Boolean(v)),
    ));
    if (memberIds.length > 0) {
      const { data: m } = await supabase
        .from("practice_member")
        .select("id, full_name")
        .in("id", memberIds);
      const map: Record<string, MemberLite> = {};
      (m ?? []).forEach((row) => { map[row.id] = row as MemberLite; });
      setMembers(map);
    }
    setLoading(false);
  };

  const today = startOfDay(new Date());

  // Bucket by status. "Active" = not revoked, not past valid_until.
  const buckets = useMemo(() => {
    const active: ConsentRow[]  = [];
    const revoked: ConsentRow[] = [];
    const expired: ConsentRow[] = [];
    records.forEach((r) => {
      if (r.revoked_at) revoked.push(r);
      else if (r.valid_until && isBefore(parseISO(r.valid_until), today)) expired.push(r);
      else active.push(r);
    });
    return { active, revoked, expired };
  }, [records, today]);

  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-muted-foreground" />
          Consent records
          {buckets.active.length > 0 && (
            <span className="text-muted-foreground font-normal">({buckets.active.length} active)</span>
          )}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" /> Capture
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No consents captured. Capture privacy notice + general treatment consent at registration;
          add procedure-specific consents (X-ray, sedation, photography) before each relevant visit.
        </p>
      ) : (
        <div className="space-y-3">
          {buckets.active.length > 0 && (
            <ConsentGroup
              label="Active"
              rows={buckets.active}
              members={members}
              tone="active"
              onView={setViewing}
              onRevoke={setRevoking}
              onSign={setSigning}
            />
          )}
          {buckets.expired.length > 0 && (
            <ConsentGroup
              label="Expired"
              rows={buckets.expired}
              members={members}
              tone="expired"
              onView={setViewing}
            />
          )}
          {buckets.revoked.length > 0 && (
            <ConsentGroup
              label="Revoked"
              rows={buckets.revoked}
              members={members}
              tone="revoked"
              onView={setViewing}
            />
          )}
        </div>
      )}

      <NewConsentSheet
        open={showNew}
        onOpenChange={setShowNew}
        patientId={patientId}
        practiceId={auth.member?.practice_id ?? ""}
        currentMemberId={auth.member?.id ?? ""}
        onCreated={load}
      />

      <ViewConsentDialog
        record={viewing}
        members={members}
        onClose={() => setViewing(null)}
      />

      <RevokeConsentDialog
        record={revoking}
        currentMemberId={auth.member?.id ?? ""}
        onClose={() => setRevoking(null)}
        onRevoked={async () => { setRevoking(null); await load(); }}
      />

      {/* Retrofit signature capture for existing consents that were
          recorded without one (e.g. digital method picked but the patient
          stepped away before signing). */}
      {signing && (
        <SignatureCaptureDialog
          open
          onOpenChange={async (next) => { if (!next) { setSigning(null); await load(); } }}
          patientId={patientId}
          consentId={signing.id}
          consentLabel={`${TYPE_LABEL[signing.consent_type] ?? signing.consent_type} v${signing.consent_version}`}
        />
      )}
    </div>
  );
}

interface ConsentGroupProps {
  label: string;
  rows: ConsentRow[];
  members: Record<string, MemberLite>;
  tone: "active" | "expired" | "revoked";
  onView: (r: ConsentRow) => void;
  onRevoke?: (r: ConsentRow) => void;
  onSign?: (r: ConsentRow) => void;
}

function ConsentGroup({ label, rows, members, tone, onView, onRevoke, onSign }: ConsentGroupProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        {label}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <ConsentCard
            key={r.id}
            record={r}
            members={members}
            tone={tone}
            onView={() => onView(r)}
            onRevoke={onRevoke ? () => onRevoke(r) : undefined}
            onSign={onSign ? () => onSign(r) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

interface ConsentCardProps {
  record: ConsentRow;
  members: Record<string, MemberLite>;
  tone: "active" | "expired" | "revoked";
  onView: () => void;
  onRevoke?: () => void;
  onSign?: () => void;
}

function ConsentCard({ record, members, tone, onView, onRevoke, onSign }: ConsentCardProps) {
  const witnessName = record.witnessed_by ? members[record.witnessed_by]?.full_name : null;
  return (
    <div className={cn(
      "flex items-center gap-2 text-sm p-3 rounded border",
      tone === "active" ? "bg-muted/30"
        : tone === "expired" ? "bg-muted/30 opacity-70"
        : "bg-muted/30 opacity-60",
    )}>
      {tone === "active" ? (
        <CheckCircle2 className="h-4 w-4 text-green-700 shrink-0" />
      ) : tone === "revoked" ? (
        <XCircle className="h-4 w-4 text-red-600 shrink-0" />
      ) : (
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
      )}
      <button onClick={onView} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{TYPE_LABEL[record.consent_type] ?? record.consent_type}</span>
          <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
            v{record.consent_version}
          </span>
          {tone === "revoked" && (
            <span className="text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide">
              Revoked
            </span>
          )}
          {tone === "expired" && (
            <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide">
              Expired
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
          <span>Granted {format(parseISO(record.granted_at), "d MMM yyyy")}</span>
          <span>·</span>
          <span>{METHOD_LABEL[record.granted_method] ?? record.granted_method}</span>
          {!record.granted_by_patient && record.guardian_name && (
            <><span>·</span><span>By {record.guardian_name} ({record.guardian_relation ?? "guardian"})</span></>
          )}
          {witnessName && (
            <><span>·</span><span>Witnessed by {witnessName}</span></>
          )}
          {record.valid_until && tone === "active" && (
            <><span>·</span><span>Valid until {format(parseISO(record.valid_until), "d MMM yyyy")}</span></>
          )}
        </div>
      </button>
      {/* Active digital/iPad consents that don't yet have a signature
          attached get a "Sign" affordance. Paper/verbal consents skip
          this — the practice has a physical record on file instead. */}
      {tone === "active" && onSign && !record.document_id &&
        (record.granted_method === "DIGITAL_SIGNATURE" || record.granted_method === "IPAD_SIGNATURE") && (
        <Button variant="outline" size="sm" onClick={onSign} className="h-7 text-xs">
          <PenLine className="h-3 w-3 mr-1" /> Sign
        </Button>
      )}
      {tone === "active" && record.document_id && (
        <span className="text-[10px] text-green-700 font-medium uppercase tracking-wide shrink-0">
          Signed
        </span>
      )}
      {tone === "active" && onRevoke && (
        <Button variant="ghost" size="sm" onClick={onRevoke} className="h-7 text-xs text-muted-foreground">
          Revoke
        </Button>
      )}
    </div>
  );
}

interface NewConsentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  practiceId: string;
  currentMemberId: string;
  onCreated: () => Promise<void> | void;
}

function NewConsentSheet({
  open, onOpenChange, patientId, practiceId, currentMemberId, onCreated,
}: NewConsentSheetProps) {
  const [consentType, setConsentType] = useState("");
  const [consentVersion, setConsentVersion] = useState("1.0");
  const [consentText, setConsentText] = useState("");
  const [grantedMethod, setGrantedMethod] = useState("");
  const [grantedByPatient, setGrantedByPatient] = useState(true);
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelation, setGuardianRelation] = useState("");
  const [witnessedBy, setWitnessedBy] = useState<string>("");
  const [validUntil, setValidUntil] = useState("");
  const [staffOptions, setStaffOptions] = useState<MemberLite[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // After a successful insert with a digital/iPad method, we stage the
  // signature capture instead of closing immediately. The state holds the
  // newly-created consent id + label so SignatureCaptureDialog can link to it.
  const [pendingSignature, setPendingSignature] = useState<
    | { id: string; label: string }
    | null
  >(null);

  useEffect(() => {
    if (!open) return;
    setConsentType("");
    setConsentVersion("1.0");
    setConsentText("");
    setGrantedMethod("");
    setGrantedByPatient(true);
    setGuardianName("");
    setGuardianRelation("");
    setWitnessedBy(currentMemberId || "");
    setValidUntil("");
  }, [open, currentMemberId]);

  // Load staff for the witness dropdown.
  useEffect(() => {
    if (!open || staffOptions.length > 0) return;
    void (async () => {
      const { data } = await supabase
        .from("practice_member")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      setStaffOptions((data as MemberLite[]) ?? []);
    })();
  }, [open, staffOptions.length]);

  // Picking a consent type auto-populates the text from the template — but
  // only if the textarea is empty / matches a different template. We don't
  // want to clobber what a clinician has already typed.
  const pickType = (t: string) => {
    const previousTemplate = TEMPLATE_TEXT[consentType] ?? "";
    setConsentType(t);
    if (!consentText.trim() || consentText.trim() === previousTemplate.trim()) {
      setConsentText(TEMPLATE_TEXT[t] ?? "");
    }
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consentType)            { toast.error("Pick the consent type");    return; }
    if (!consentVersion.trim())  { toast.error("Version is required");      return; }
    if (!consentText.trim())     { toast.error("Consent text is required"); return; }
    if (!grantedMethod)          { toast.error("How was consent given?");   return; }
    if (!grantedByPatient && !guardianName.trim()) {
      toast.error("Guardian name is required when consent is not given by the patient");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("consent_record")
        .insert({
          practice_id:        practiceId,
          patient_id:         patientId,
          consent_type:       consentType,
          consent_version:    consentVersion.trim(),
          consent_text:       consentText.trim(),
          granted_method:     grantedMethod,
          granted_by_patient: grantedByPatient,
          guardian_name:      grantedByPatient ? null : guardianName.trim(),
          guardian_relation:  grantedByPatient ? null : (guardianRelation.trim() || null),
          witnessed_by:       witnessedBy || null,
          valid_until:        validUntil ? new Date(validUntil).toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Consent recorded");

      // Digital + iPad signature methods continue into the capture flow
      // so the practice doesn't have to make a second trip to attach the
      // signature. Other methods (paper, verbal) finish here.
      if (data && (grantedMethod === "DIGITAL_SIGNATURE" || grantedMethod === "IPAD_SIGNATURE")) {
        setPendingSignature({
          id: data.id,
          label: `${TYPE_LABEL[consentType] ?? consentType} v${consentVersion.trim()}`,
        });
      } else {
        onOpenChange(false);
        await onCreated();
      }
    } catch (err) {
      logger.error("consent create failed", err);
      toast.error(err instanceof Error ? err.message : "Couldn't record consent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Capture consent</SheetTitle>
          <SheetDescription>
            The text below freezes once saved — future template edits won't
            change this record, so what the patient agrees to is preserved
            verbatim.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
            <div className="space-y-1">
              <Label>Consent type *</Label>
              <Select value={consentType} onValueChange={pickType}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Version *</Label>
              <Input
                value={consentVersion}
                onChange={(e) => setConsentVersion(e.target.value)}
                placeholder="1.0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Consent text (frozen on save) *</Label>
            <Textarea
              value={consentText}
              onChange={(e) => setConsentText(e.target.value)}
              rows={8}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Edit the template above to match exactly what the patient is being asked to agree to.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Granted how? *</Label>
            <Select value={grantedMethod} onValueChange={setGrantedMethod}>
              <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Patient vs guardian. Guardian path captures who gave it on the
              patient's behalf — required for under-16s and adults lacking
              capacity. */}
          <div className="rounded border bg-muted/30 p-3 space-y-3">
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={grantedByPatient}
                  onChange={() => setGrantedByPatient(true)}
                />
                Given by the patient
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={!grantedByPatient}
                  onChange={() => setGrantedByPatient(false)}
                />
                Given by guardian / proxy
              </label>
            </div>

            {!grantedByPatient && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Guardian name *</Label>
                  <Input
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Relation</Label>
                  <Input
                    value={guardianRelation}
                    onChange={(e) => setGuardianRelation(e.target.value)}
                    placeholder="Parent, guardian, power of attorney..."
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Witnessed by</Label>
              <Select
                value={witnessedBy || "__none__"}
                onValueChange={(v) => setWitnessedBy(v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No witness</SelectItem>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name ?? "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Valid until</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Optional — for one-off procedures.</p>
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : grantedMethod === "DIGITAL_SIGNATURE" || grantedMethod === "IPAD_SIGNATURE"
                  ? "Record + sign"
                  : "Record consent"}
            </Button>
          </SheetFooter>
        </form>

        {/* Signature-capture chain — opens automatically after a digital
            consent is recorded. Skipping (Cancel) leaves the consent on
            file without a signature; the user can attach one later from
            the consent row. */}
        {pendingSignature && (
          <SignatureCaptureDialog
            open
            onOpenChange={async (next) => {
              if (!next) {
                setPendingSignature(null);
                onOpenChange(false);
                await onCreated();
              }
            }}
            patientId={patientId}
            consentId={pendingSignature.id}
            consentLabel={pendingSignature.label}
            onCaptured={() => {
              // SignatureCaptureDialog will call onOpenChange(false) itself
              // — the dismissal handler above runs the reload.
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface ViewConsentDialogProps {
  record: ConsentRow | null;
  members: Record<string, MemberLite>;
  onClose: () => void;
}

function ViewConsentDialog({ record, members, onClose }: ViewConsentDialogProps) {
  if (!record) return null;
  const witness = record.witnessed_by ? members[record.witnessed_by]?.full_name : null;
  return (
    <Dialog open={Boolean(record)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TYPE_LABEL[record.consent_type] ?? record.consent_type} (v{record.consent_version})</DialogTitle>
          <DialogDescription>
            Granted {format(parseISO(record.granted_at), "EEE d MMM yyyy, HH:mm")}
            {" · "}
            {METHOD_LABEL[record.granted_method] ?? record.granted_method}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="rounded border bg-muted/20 p-4 text-sm whitespace-pre-wrap">
            {record.consent_text}
          </div>

          <div className="text-xs space-y-1 text-muted-foreground">
            {record.granted_by_patient ? (
              <p>Signed by the patient.</p>
            ) : (
              <p>Signed by {record.guardian_name}{record.guardian_relation ? ` (${record.guardian_relation})` : ""} on the patient's behalf.</p>
            )}
            {witness && <p>Witnessed by {witness}.</p>}
            {record.valid_until && (
              <p>Valid until {format(parseISO(record.valid_until), "d MMM yyyy")}.</p>
            )}
            {record.revoked_at && (
              <p className="text-red-700">
                <strong>Revoked</strong> on {format(parseISO(record.revoked_at), "d MMM yyyy")}
                {record.revoked_reason ? ` — ${record.revoked_reason}` : ""}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RevokeConsentDialogProps {
  record: ConsentRow | null;
  currentMemberId: string;
  onClose: () => void;
  onRevoked: () => Promise<void> | void;
}

function RevokeConsentDialog({ record, currentMemberId, onClose, onRevoked }: RevokeConsentDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (record) setReason("");
  }, [record]);

  if (!record) return null;

  const handleRevoke = async () => {
    setSubmitting(true);
    const { error } = await supabase
      .from("consent_record")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: reason.trim() || null,
        revoked_by: currentMemberId || null,
      })
      .eq("id", record.id);
    setSubmitting(false);
    if (error) {
      logger.error("consent revoke failed", error);
      toast.error("Couldn't revoke consent");
      return;
    }
    toast.success("Consent revoked");
    await onRevoked();
  };

  return (
    <Dialog open={Boolean(record)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke consent?</DialogTitle>
          <DialogDescription>
            {TYPE_LABEL[record.consent_type] ?? record.consent_type} — granted {format(parseISO(record.granted_at), "d MMM yyyy")}.
            Revoking does not delete the record; it marks it withdrawn from this point on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 mt-2">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional — capture what the patient told you"
            rows={3}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={submitting}>
            <PenLine className="h-4 w-4 mr-1" />
            {submitting ? "Revoking…" : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

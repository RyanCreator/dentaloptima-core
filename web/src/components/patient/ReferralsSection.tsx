import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/contexts/PracticeContext";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";

// Adapted to dentaloptima-core's `referral` table:
//   - referring_staff_id → referred_by (NOT NULL, practice_member.id)
//   - specialist_name/practice/contact → external_specialist_*
//   - notes → clinical_summary
//   - new: urgency enum (ROUTINE / URGENT / TWO_WEEK_WAIT)
//   - status enum extended: DRAFT, SENT, ACKNOWLEDGED, ACCEPTED, DECLINED,
//     IN_PROGRESS, COMPLETED, CANCELLED
//
// This rewrite handles external specialists only. Internal specialists
// (practice members at another practice in the same DB) need a
// cross-tenant lookup the booking app doesn't expose yet — coming with the
// shared specialist directory.

type ReferralUrgency = "ROUTINE" | "URGENT" | "TWO_WEEK_WAIT";

type ReferralStatus =
  | "DRAFT"
  | "SENT"
  | "ACKNOWLEDGED"
  | "ACCEPTED"
  | "DECLINED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

interface Referral {
  id: string;
  patient_id: string;
  referred_by: string;
  internal_specialist_id: string | null;
  external_specialist_name: string | null;
  external_specialist_practice: string | null;
  external_specialist_email: string | null;
  external_specialist_phone: string | null;
  external_specialist_address: string | null;
  reason: string;
  clinical_summary: string | null;
  urgency: ReferralUrgency;
  status: ReferralStatus;
  sent_at: string | null;
  acknowledged_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  completed_at: string | null;
  created_at: string;
  referrer?: { full_name: string | null } | null;
}

const URGENCY_OPTIONS: { value: ReferralUrgency; label: string }[] = [
  { value: "ROUTINE", label: "Routine" },
  { value: "URGENT", label: "Urgent" },
  { value: "TWO_WEEK_WAIT", label: "2-week wait" },
];

const STATUS_OPTIONS: { value: ReferralStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_BADGE: Record<ReferralStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  ACKNOWLEDGED: "bg-indigo-100 text-indigo-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

interface ReferralsSectionProps {
  patientId: string;
}

export function ReferralsSection({ patientId }: ReferralsSectionProps) {
  const tenant = usePractice();
  const { member } = useAuth();
  const practiceId = tenant.practice.id;

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Referral | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referral")
      .select(
        "*, referrer:referred_by (full_name)",
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error loading referrals", error);
      toast.error("Failed to load referrals");
    } else {
      setReferrals((data as unknown as Referral[]) ?? []);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (input: {
    external_specialist_name: string;
    external_specialist_practice: string;
    external_specialist_email: string;
    external_specialist_phone: string;
    reason: string;
    clinical_summary: string;
    urgency: ReferralUrgency;
  }) => {
    if (!member) {
      toast.error("You must be signed in as a practice member to create a referral");
      return false;
    }
    if (!input.external_specialist_name.trim() || !input.reason.trim()) {
      toast.error("Specialist name and reason are required");
      return false;
    }

    const { error } = await supabase.from("referral").insert({
      practice_id: practiceId,
      patient_id: patientId,
      referred_by: member.id,
      external_specialist_name: input.external_specialist_name.trim(),
      external_specialist_practice: input.external_specialist_practice.trim() || null,
      external_specialist_email: input.external_specialist_email.trim() || null,
      external_specialist_phone: input.external_specialist_phone.trim() || null,
      reason: input.reason.trim(),
      clinical_summary: input.clinical_summary.trim() || null,
      urgency: input.urgency,
      status: "DRAFT",
    });

    if (error) {
      logger.error("Failed to create referral", error);
      toast.error("Failed to create referral");
      return false;
    }
    toast.success("Referral created");
    await load();
    return true;
  };

  const updateStatus = async (id: string, status: ReferralStatus, declinedReason?: string) => {
    const updates: Record<string, any> = { status };
    if (status === "SENT") updates.sent_at = new Date().toISOString();
    if (status === "ACKNOWLEDGED") updates.acknowledged_at = new Date().toISOString();
    if (status === "ACCEPTED") updates.accepted_at = new Date().toISOString();
    if (status === "DECLINED") {
      updates.declined_at = new Date().toISOString();
      updates.declined_reason = declinedReason || null;
    }
    if (status === "COMPLETED") updates.completed_at = new Date().toISOString();

    const { error } = await supabase.from("referral").update(updates).eq("id", id);
    if (error) toast.error("Failed to update referral");
    else {
      await load();
      // Keep the open referral in sync
      setEditing((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
    }
  };

  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Referrals</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreate(true)}
          disabled={!member}
          title={member ? "" : "Only practice members can create referrals"}
        >
          <Plus className="h-4 w-4 mr-1" /> New referral
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : referrals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No referrals yet</p>
      ) : (
        <div className="space-y-1.5">
          {referrals.map((ref) => (
            <button
              key={ref.id}
              onClick={() => setEditing(ref)}
              className="w-full p-3 rounded-md border hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">
                  {ref.external_specialist_name ?? "Unnamed specialist"}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[ref.status]}`}
                >
                  {ref.status.replace("_", " ").toLowerCase()}
                </span>
                {ref.urgency !== "ROUTINE" && (
                  <span className="text-[10px] font-medium bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                    {URGENCY_OPTIONS.find((u) => u.value === ref.urgency)?.label}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {ref.reason}
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                {ref.referrer?.full_name && <>By {ref.referrer.full_name} &middot; </>}
                {format(new Date(ref.created_at), "d MMM yyyy")}
              </div>
            </button>
          ))}
        </div>
      )}

      <NewReferralSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={async (input) => {
          const ok = await handleCreate(input);
          if (ok) setShowCreate(false);
        }}
      />

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing?.external_specialist_name ?? "Referral"}</SheetTitle>
            <SheetDescription className="sr-only">
              Update referral status and review the referral payload sent to the specialist.
            </SheetDescription>
          </SheetHeader>
          {editing && (
            <ReferralDetail
              referral={editing}
              onStatusChange={(status, reason) => updateStatus(editing.id, status, reason)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NewReferralSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: {
    external_specialist_name: string;
    external_specialist_practice: string;
    external_specialist_email: string;
    external_specialist_phone: string;
    reason: string;
    clinical_summary: string;
    urgency: ReferralUrgency;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    external_specialist_name: "",
    external_specialist_practice: "",
    external_specialist_email: "",
    external_specialist_phone: "",
    reason: "",
    clinical_summary: "",
    urgency: "ROUTINE" as ReferralUrgency,
  });
  const [saving, setSaving] = useState(false);

  const update = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    setForm({
      external_specialist_name: "",
      external_specialist_practice: "",
      external_specialist_email: "",
      external_specialist_phone: "",
      reason: "",
      clinical_summary: "",
      urgency: "ROUTINE",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New referral</SheetTitle>
          <SheetDescription className="sr-only">
            Refer this patient to an external specialist. The referral starts as a draft
            and can be marked as sent once the letter has been issued.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Specialist
            </h4>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.external_specialist_name}
                onChange={(e) => update("external_specialist_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Practice</Label>
              <Input
                value={form.external_specialist_practice}
                onChange={(e) => update("external_specialist_practice", e.target.value)}
                placeholder="e.g. Harley Street Endodontics"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.external_specialist_email}
                  onChange={(e) => update("external_specialist_email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.external_specialist_phone}
                  onChange={(e) => update("external_specialist_phone", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Referral
            </h4>
            <div className="space-y-1.5">
              <Label>Urgency</Label>
              <Select
                value={form.urgency}
                onValueChange={(v) => setForm((p) => ({ ...p, urgency: v as ReferralUrgency }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {URGENCY_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input
                value={form.reason}
                onChange={(e) => update("reason", e.target.value)}
                placeholder="e.g. Suspected periapical lesion UR4"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Clinical summary</Label>
              <Textarea
                value={form.clinical_summary}
                onChange={(e) => update("clinical_summary", e.target.value)}
                rows={4}
                placeholder="Relevant medical history, X-rays attached, treatment to date..."
              />
            </div>
          </div>

          <Button
            onClick={submit}
            disabled={saving || !form.external_specialist_name.trim() || !form.reason.trim()}
            className="w-full"
          >
            {saving ? "Saving..." : "Create as draft"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReferralDetail({
  referral,
  onStatusChange,
}: {
  referral: Referral;
  onStatusChange: (status: ReferralStatus, declinedReason?: string) => Promise<void>;
}) {
  const handleStatus = async (next: ReferralStatus) => {
    if (next === "DECLINED") {
      const reason = window.prompt("Reason for declining (optional)");
      if (reason === null) return;
      await onStatusChange(next, reason || undefined);
    } else {
      await onStatusChange(next);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] text-muted-foreground">Status</Label>
          <Select
            value={referral.status}
            onValueChange={(v) => handleStatus(v as ReferralStatus)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Urgency</Label>
          <p className="mt-2 text-sm">
            {URGENCY_OPTIONS.find((u) => u.value === referral.urgency)?.label}
          </p>
        </div>
      </div>

      <div className="border-t pt-4 space-y-2 text-sm">
        <div>
          <Label className="text-[10px] text-muted-foreground">Specialist</Label>
          <p>{referral.external_specialist_name}</p>
          {referral.external_specialist_practice && (
            <p className="text-xs text-muted-foreground">
              {referral.external_specialist_practice}
            </p>
          )}
          {(referral.external_specialist_email || referral.external_specialist_phone) && (
            <p className="text-xs text-muted-foreground">
              {[referral.external_specialist_email, referral.external_specialist_phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        <div>
          <Label className="text-[10px] text-muted-foreground">Reason</Label>
          <p>{referral.reason}</p>
        </div>

        {referral.clinical_summary && (
          <div>
            <Label className="text-[10px] text-muted-foreground">Clinical summary</Label>
            <p className="text-xs whitespace-pre-wrap">{referral.clinical_summary}</p>
          </div>
        )}

        {referral.declined_reason && (
          <div>
            <Label className="text-[10px] text-muted-foreground">Declined reason</Label>
            <p className="text-xs italic">{referral.declined_reason}</p>
          </div>
        )}
      </div>

      <div className="border-t pt-4 text-xs text-muted-foreground space-y-1">
        <Timestamp label="Created" value={referral.created_at} />
        <Timestamp label="Sent" value={referral.sent_at} />
        <Timestamp label="Acknowledged" value={referral.acknowledged_at} />
        <Timestamp label="Accepted" value={referral.accepted_at} />
        <Timestamp label="Declined" value={referral.declined_at} />
        <Timestamp label="Completed" value={referral.completed_at} />
      </div>
    </div>
  );
}

function Timestamp({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span>{format(new Date(value), "d MMM yyyy, HH:mm")}</span>
    </div>
  );
}

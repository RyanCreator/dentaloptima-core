import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Calendar, User, ShieldAlert, Lock, XCircle, ExternalLink,
} from "lucide-react";
import { GovernanceStatusPill } from "@/components/governance/GovernanceStatusPill";

interface Concern {
  id: string;
  practice_id: string;
  patient_id: string | null;
  concern_type: string;
  raised_by: string;
  raised_at: string;
  description: string;
  immediate_risk_assessment: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  referred_at: string | null;
  referred_to: string | null;
  external_reference: string | null;
  external_outcome: string | null;
  closed_at: string | null;
  closed_by: string | null;
  closure_summary: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberLite { id: string; full_name: string | null; role: string }

const TYPE_LABEL: Record<string, string> = {
  CHILD: "Child",
  ADULT_AT_RISK: "Adult at risk",
  DOMESTIC_ABUSE: "Domestic abuse",
  MENTAL_CAPACITY: "Mental capacity concern",
  NEGLECT: "Neglect",
  PHYSICAL_ABUSE: "Physical abuse",
  OTHER: "Other",
};

export default function SafeguardingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const [concern, setConcern] = useState<Concern | null>(null);
  const [members, setMembers] = useState<Record<string, MemberLite>>({});
  const [patientName, setPatientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [draftReviewNotes, setDraftReviewNotes] = useState("");
  const [draftReferredTo, setDraftReferredTo] = useState("");
  const [draftExternalRef, setDraftExternalRef] = useState("");
  const [draftExternalOutcome, setDraftExternalOutcome] = useState("");
  const [draftClosureSummary, setDraftClosureSummary] = useState("");

  useEffect(() => {
    if (!id) return;
    void load(id);
  }, [id]);

  const load = async (concernId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("safeguarding_concern")
      .select("*")
      .eq("id", concernId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) logger.error("concern load failed", error);
    if (!data) { setLoading(false); return; }

    const c = data as Concern;
    setConcern(c);

    setDraftReviewNotes(c.review_notes ?? "");
    setDraftReferredTo(c.referred_to ?? "");
    setDraftExternalRef(c.external_reference ?? "");
    setDraftExternalOutcome(c.external_outcome ?? "");
    setDraftClosureSummary(c.closure_summary ?? "");

    const memberIds = new Set<string>();
    memberIds.add(c.raised_by);
    if (c.reviewed_by) memberIds.add(c.reviewed_by);
    if (c.closed_by) memberIds.add(c.closed_by);

    if (memberIds.size > 0) {
      const { data: m } = await supabase
        .from("practice_member")
        .select("id, full_name, role")
        .in("id", Array.from(memberIds));
      const map: Record<string, MemberLite> = {};
      (m ?? []).forEach((row) => { map[row.id] = row as MemberLite; });
      setMembers(map);
    }

    if (c.patient_id) {
      const { data: p } = await supabase
        .from("patient")
        .select("full_name")
        .eq("id", c.patient_id)
        .maybeSingle();
      setPatientName(p?.full_name ?? null);
    }

    setLoading(false);
  };

  // RLS permits edit by raiser OR admin. Match it client-side so the UI
  // shows the right buttons; the DB will reject otherwise.
  const canEdit = useMemo(() => {
    if (!auth.member || !concern) return false;
    if (auth.member.role === "OWNER" || auth.member.role === "ADMIN") return true;
    return concern.raised_by === auth.member.id;
  }, [auth.member, concern]);

  if (loading) {
    return (
      <Layout title="Safeguarding concern" onBack={() => navigate("/governance?tab=safeguarding")}>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!concern) {
    return (
      <Layout title="Safeguarding concern" onBack={() => navigate("/governance?tab=safeguarding")}>
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Concern not found</p>
          <p className="text-sm mt-1">It may have been deleted or you don't have permission to view it.</p>
        </div>
      </Layout>
    );
  }

  const startReview = async () => {
    if (!auth.member) return;
    setSaving(true);
    const { error } = await supabase
      .from("safeguarding_concern")
      .update({
        status: "INTERNAL_REVIEW",
        reviewed_by: auth.member.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", concern.id);
    setSaving(false);
    if (error) { toast.error("Couldn't start review"); logger.error("review start failed", error); return; }
    toast.success("Internal review started");
    await load(concern.id);
  };

  const refer = async (next: "REFERRED_LOCAL_AUTHORITY" | "REFERRED_POLICE") => {
    setSaving(true);
    const { error } = await supabase
      .from("safeguarding_concern")
      .update({
        status: next,
        referred_at: new Date().toISOString(),
        referred_to: draftReferredTo.trim() || (next === "REFERRED_POLICE" ? "Police" : "Local authority"),
        external_reference: draftExternalRef.trim() || null,
      })
      .eq("id", concern.id);
    setSaving(false);
    if (error) { toast.error("Couldn't refer"); logger.error("referral failed", error); return; }
    toast.success("Referral recorded");
    await load(concern.id);
  };

  const close = async (outcome: "CLOSED_NO_ACTION" | "CLOSED_ACTIONED") => {
    if (!auth.member) return;
    setSaving(true);
    const { error } = await supabase
      .from("safeguarding_concern")
      .update({
        status: outcome,
        closed_at: new Date().toISOString(),
        closed_by: auth.member.id,
        closure_summary: draftClosureSummary.trim() || null,
      })
      .eq("id", concern.id);
    setSaving(false);
    if (error) { toast.error("Couldn't close"); logger.error("close failed", error); return; }
    toast.success("Concern closed");
    await load(concern.id);
  };

  const saveDrafts = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("safeguarding_concern")
      .update({
        review_notes: draftReviewNotes.trim() || null,
        referred_to: draftReferredTo.trim() || null,
        external_reference: draftExternalRef.trim() || null,
        external_outcome: draftExternalOutcome.trim() || null,
        closure_summary: draftClosureSummary.trim() || null,
      })
      .eq("id", concern.id);
    setSaving(false);
    if (error) { toast.error("Failed to save"); logger.error("concern save failed", error); return; }
    toast.success("Saved");
    await load(concern.id);
  };

  const raisedBy = members[concern.raised_by];
  const isClosed = concern.status === "CLOSED_NO_ACTION" || concern.status === "CLOSED_ACTIONED";

  return (
    <Layout title="Safeguarding concern" onBack={() => navigate("/governance?tab=safeguarding")}>
      <div className="space-y-4">
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 flex items-start gap-2">
          <Lock className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900">
            <strong>Confidential.</strong> Discuss only with the safeguarding lead and on a need-to-know basis.
          </p>
        </div>

        {/* Header */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {TYPE_LABEL[concern.concern_type] ?? concern.concern_type}
                {patientName && ` — ${patientName}`}
              </p>
              <h2 className="text-xl font-semibold mt-1">
                Raised {format(parseISO(concern.raised_at), "EEE d MMM yyyy, HH:mm")}
              </h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <GovernanceStatusPill kind="safeguarding" value={concern.status} />
              </div>
            </div>

            {canEdit && !isClosed && (
              <div className="flex items-center gap-2 flex-wrap">
                {concern.status === "IDENTIFIED" && (
                  <Button size="sm" variant="outline" onClick={startReview} disabled={saving}>
                    Start internal review
                  </Button>
                )}
                {concern.status === "INTERNAL_REVIEW" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => refer("REFERRED_LOCAL_AUTHORITY")} disabled={saving}>
                      Refer to local authority
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => refer("REFERRED_POLICE")} disabled={saving}>
                      Refer to police
                    </Button>
                  </>
                )}
                {(concern.status === "INTERNAL_REVIEW" ||
                  concern.status === "REFERRED_LOCAL_AUTHORITY" ||
                  concern.status === "REFERRED_POLICE") && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => close("CLOSED_NO_ACTION")} disabled={saving}>
                      Close — no action
                    </Button>
                    <Button size="sm" onClick={() => close("CLOSED_ACTIONED")} disabled={saving}>
                      Close — actioned
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card title="The concern">
              <Field icon={Calendar} label="Raised">
                {format(parseISO(concern.raised_at), "EEE d MMM yyyy, HH:mm")}
                {raisedBy?.full_name && <> · by {raisedBy.full_name}</>}
              </Field>
              {patientName && (
                <Field icon={User} label="Patient">
                  {concern.patient_id ? (
                    <button
                      onClick={() => navigate(`/patients/${concern.patient_id}`)}
                      className="hover:underline text-primary"
                    >
                      {patientName}
                    </button>
                  ) : patientName}
                </Field>
              )}
              <div className="mt-3">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm whitespace-pre-wrap mt-1">{concern.description}</p>
              </div>
              {concern.immediate_risk_assessment && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">Immediate risk assessment</Label>
                  <p className="text-sm whitespace-pre-wrap mt-1">{concern.immediate_risk_assessment}</p>
                </div>
              )}
            </Card>

            <Card title="Internal review">
              {canEdit && !isClosed ? (
                <div className="space-y-1">
                  <Label>Review notes</Label>
                  <Textarea rows={5} value={draftReviewNotes} onChange={(e) => setDraftReviewNotes(e.target.value)} placeholder="Findings from the internal review. Who you spoke to, what you reviewed, what was decided." />
                </div>
              ) : (
                <ReadOnlySection rows={[["Notes", concern.review_notes ?? "—"]]} />
              )}
            </Card>

            <Card title="External referral">
              {canEdit && !isClosed ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Referred to</Label>
                    <Input
                      value={draftReferredTo}
                      onChange={(e) => setDraftReferredTo(e.target.value)}
                      placeholder="e.g. Manchester Children's Social Care, Greater Manchester Police"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>External reference</Label>
                    <Input
                      value={draftExternalRef}
                      onChange={(e) => setDraftExternalRef(e.target.value)}
                      placeholder="Their case / incident number, if given"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Outcome</Label>
                    <Textarea rows={3} value={draftExternalOutcome} onChange={(e) => setDraftExternalOutcome(e.target.value)} placeholder="What the external body said or did — once you hear back." />
                  </div>
                </div>
              ) : (
                <ReadOnlySection rows={[
                  ["Referred to", concern.referred_to ?? "—"],
                  ["Reference",   concern.external_reference ?? "—"],
                  ["Outcome",     concern.external_outcome ?? "—"],
                ]} />
              )}
            </Card>

            {isClosed && (
              <Card title="Closure">
                <ReadOnlySection rows={[
                  ["Outcome", concern.status === "CLOSED_ACTIONED" ? "Closed — actioned" : "Closed — no action"],
                  ["Summary", concern.closure_summary ?? "—"],
                  ["Closed by", concern.closed_by && members[concern.closed_by]?.full_name ? members[concern.closed_by].full_name! : "—"],
                  ["Closed at", concern.closed_at ? format(parseISO(concern.closed_at), "d MMM yyyy, HH:mm") : "—"],
                ]} />
              </Card>
            )}

            {!isClosed && canEdit && (concern.status === "INTERNAL_REVIEW" ||
              concern.status === "REFERRED_LOCAL_AUTHORITY" ||
              concern.status === "REFERRED_POLICE") && (
              <Card title="Closure summary (when ready to close)">
                <div className="space-y-1">
                  <Textarea
                    rows={3}
                    value={draftClosureSummary}
                    onChange={(e) => setDraftClosureSummary(e.target.value)}
                    placeholder="Brief summary of the outcome — what was done, what wasn't, why."
                  />
                </div>
              </Card>
            )}

            {canEdit && !isClosed && (
              <div className="flex justify-end">
                <Button onClick={saveDrafts} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card title="Lifecycle">
              <MetaRow label="Raised"
                value={`${format(parseISO(concern.raised_at), "d MMM yyyy, HH:mm")}${raisedBy?.full_name ? ` · ${raisedBy.full_name}` : ""}`} />
              {concern.reviewed_at && (
                <MetaRow label="Reviewed"
                  value={`${format(parseISO(concern.reviewed_at), "d MMM yyyy")}${
                    concern.reviewed_by && members[concern.reviewed_by]?.full_name
                      ? ` · ${members[concern.reviewed_by].full_name}` : ""
                  }`} />
              )}
              {concern.referred_at && (
                <MetaRow label="Referred" value={format(parseISO(concern.referred_at), "d MMM yyyy")} />
              )}
              {concern.closed_at && (
                <MetaRow label="Closed" value={format(parseISO(concern.closed_at), "d MMM yyyy")} />
              )}
            </Card>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> External contacts
              </h3>
              <ul className="text-xs space-y-2 text-muted-foreground">
                <li className="flex items-start gap-1.5">
                  <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">Emergency:</strong> 999</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">Non-emergency police:</strong> 101</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                  <span><strong className="text-foreground">NSPCC adult helpline:</strong> 0808 800 5000</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Use your local authority's safeguarding referral form when referring.</span>
                </li>
              </ul>
            </div>

            {!canEdit && (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Only the raiser and practice admins can update this concern.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

interface CardProps { title: string; children: React.ReactNode }
function Card({ title, children }: CardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

interface FieldProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}
function Field({ icon: Icon, label, children }: FieldProps) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1">
        <span className="text-muted-foreground text-xs">{label}: </span>
        <span>{children}</span>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function ReadOnlySection({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="space-y-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <Label className="text-xs text-muted-foreground">{k}</Label>
          <p className="text-sm whitespace-pre-wrap mt-0.5">{v}</p>
        </div>
      ))}
    </div>
  );
}

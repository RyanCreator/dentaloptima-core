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
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Mail, Phone, Calendar, User, CheckCircle2, Lock, XCircle, Clock, Send, AlertTriangle,
} from "lucide-react";
import { GovernanceStatusPill } from "@/components/governance/GovernanceStatusPill";
import { addWorkingDays, workingDaysBetween } from "@/lib/workingDays";
import { cn } from "@/lib/utils";

interface Complaint {
  id: string;
  practice_id: string;
  patient_id: string | null;
  complainant_name: string;
  complainant_relation: string | null;
  complainant_email: string | null;
  complainant_phone: string | null;
  received_at: string;
  received_via: string;
  received_by: string | null;
  summary: string;
  detail: string;
  staff_named: string[] | null;
  status: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  investigation_lead: string | null;
  investigation_notes: string | null;
  response_summary: string | null;
  responded_at: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  escalated_to_ombudsman: boolean;
  ombudsman_reference: string | null;
  ombudsman_outcome: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberLite { id: string; full_name: string | null; role: string }

const METHOD_LABEL: Record<string, string> = {
  IN_PERSON: "In person", PHONE: "Phone", EMAIL: "Email", LETTER: "Letter",
  WEBSITE: "Website", SOCIAL_MEDIA: "Social media", OTHER: "Other",
};

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [members, setMembers] = useState<Record<string, MemberLite>>({});
  const [patientName, setPatientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Draft state for editable fields.
  const [draftInvestigationLead, setDraftInvestigationLead] = useState("");
  const [draftInvestigationNotes, setDraftInvestigationNotes] = useState("");
  const [draftResponseSummary, setDraftResponseSummary] = useState("");
  const [draftResolutionSummary, setDraftResolutionSummary] = useState("");
  const [draftEscalated, setDraftEscalated] = useState(false);
  const [draftOmbudsmanRef, setDraftOmbudsmanRef] = useState("");
  const [draftOmbudsmanOutcome, setDraftOmbudsmanOutcome] = useState("");

  useEffect(() => {
    if (!id) return;
    void load(id);
  }, [id]);

  const load = async (complaintId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("complaint")
      .select("*")
      .eq("id", complaintId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) logger.error("complaint load failed", error);
    if (!data) { setLoading(false); return; }

    const c = data as Complaint;
    setComplaint(c);

    setDraftInvestigationLead(c.investigation_lead ?? "");
    setDraftInvestigationNotes(c.investigation_notes ?? "");
    setDraftResponseSummary(c.response_summary ?? "");
    setDraftResolutionSummary(c.resolution_summary ?? "");
    setDraftEscalated(c.escalated_to_ombudsman);
    setDraftOmbudsmanRef(c.ombudsman_reference ?? "");
    setDraftOmbudsmanOutcome(c.ombudsman_outcome ?? "");

    const memberIds = new Set<string>();
    if (c.received_by)        memberIds.add(c.received_by);
    if (c.acknowledged_by)    memberIds.add(c.acknowledged_by);
    if (c.investigation_lead) memberIds.add(c.investigation_lead);
    (c.staff_named ?? []).forEach((m) => memberIds.add(m));

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

    // We still need staff for the investigation-lead picker even if none
    // currently touch this complaint.
    if (Object.keys(members).length === 0) {
      const { data: staff } = await supabase
        .from("practice_member")
        .select("id, full_name, role")
        .eq("is_active", true)
        .order("full_name");
      const merged: Record<string, MemberLite> = {};
      (staff ?? []).forEach((row) => { merged[row.id] = row as MemberLite; });
      // Preserve any names we already resolved (covers deactivated members).
      Object.entries(members).forEach(([k, v]) => { if (!merged[k]) merged[k] = v; });
      setMembers(merged);
    }

    setLoading(false);
  };

  // Per RLS: only admins can update complaints. Show editable UI only then.
  const canEdit = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";

  const allStaff = useMemo(() => Object.values(members), [members]);

  // 3-working-day acknowledgement countdown. Once acknowledged, the clock
  // is replaced with "Acknowledged on …".
  const ackInfo = useMemo(() => {
    if (!complaint) return null;
    if (complaint.acknowledged_at) {
      const acked = parseISO(complaint.acknowledged_at);
      const received = parseISO(complaint.received_at);
      const days = workingDaysBetween(received, acked);
      return {
        tone: days <= 3 ? "ahead" : "overdue" as const,
        label: `Acknowledged ${format(acked, "d MMM yyyy")} (${days}d after receipt)`,
      };
    }
    if (complaint.status !== "NEW") return null;
    const deadline = addWorkingDays(parseISO(complaint.received_at), 3);
    const days = workingDaysBetween(new Date(), deadline);
    if (days < 0)  return { tone: "overdue", label: `Acknowledgement overdue by ${Math.abs(days)} working day${Math.abs(days) === 1 ? "" : "s"}` };
    if (days === 0) return { tone: "due", label: "Acknowledgement due today" };
    return { tone: days <= 1 ? "due" : "ahead", label: `Acknowledgement due in ${days} working day${days === 1 ? "" : "s"}` };
  }, [complaint]);

  if (loading) {
    return (
      <Layout title="Complaint" onBack={() => navigate("/governance?tab=complaints")}>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!complaint) {
    return (
      <Layout title="Complaint" onBack={() => navigate("/governance?tab=complaints")}>
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Complaint not found</p>
          <p className="text-sm mt-1">It may have been deleted or you don't have permission to view it.</p>
        </div>
      </Layout>
    );
  }

  const acknowledge = async () => {
    if (!auth.member) return;
    setSaving(true);
    const { error } = await supabase
      .from("complaint")
      .update({
        status: "ACKNOWLEDGED",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: auth.member.id,
      })
      .eq("id", complaint.id);
    setSaving(false);
    if (error) { toast.error("Couldn't acknowledge"); logger.error("complaint acknowledge failed", error); return; }
    toast.success("Complaint acknowledged");
    await load(complaint.id);
  };

  const transitionStatus = async (next: string) => {
    setSaving(true);
    const patch: Partial<Complaint> = { status: next };
    if (next === "RESPONDED" && !complaint.responded_at) {
      patch.responded_at = new Date().toISOString();
    }
    if (next === "RESOLVED" && !complaint.resolved_at) {
      patch.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("complaint")
      .update(patch)
      .eq("id", complaint.id);
    setSaving(false);
    if (error) { toast.error("Couldn't update status"); logger.error("complaint status update failed", error); return; }
    toast.success(`Status set to ${next.replace(/_/g, " ").toLowerCase()}`);
    await load(complaint.id);
  };

  const saveDrafts = async () => {
    setSaving(true);
    const patch = {
      investigation_lead: draftInvestigationLead || null,
      investigation_notes: draftInvestigationNotes.trim() || null,
      response_summary: draftResponseSummary.trim() || null,
      resolution_summary: draftResolutionSummary.trim() || null,
      escalated_to_ombudsman: draftEscalated,
      ombudsman_reference: draftEscalated ? (draftOmbudsmanRef.trim() || null) : null,
      ombudsman_outcome: draftEscalated ? (draftOmbudsmanOutcome.trim() || null) : null,
    };
    const { error } = await supabase
      .from("complaint")
      .update(patch)
      .eq("id", complaint.id);
    setSaving(false);
    if (error) { toast.error("Failed to save"); logger.error("complaint save failed", error); return; }
    toast.success("Saved");
    await load(complaint.id);
  };

  return (
    <Layout title="Complaint" onBack={() => navigate("/governance?tab=complaints")}>
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                From {complaint.complainant_name}
                {complaint.complainant_relation && ` (${complaint.complainant_relation})`}
              </p>
              <h2 className="text-xl font-semibold mt-1">{complaint.summary}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <GovernanceStatusPill kind="complaint" value={complaint.status} />
                {complaint.escalated_to_ombudsman && (
                  <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded font-medium uppercase tracking-wide bg-purple-100 text-purple-700">
                    Escalated
                  </span>
                )}
              </div>
            </div>
            {canEdit && complaint.status !== "CLOSED" && (
              <div className="flex items-center gap-2 flex-wrap">
                {complaint.status === "NEW" && (
                  <Button size="sm" onClick={acknowledge} disabled={saving}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Acknowledge
                  </Button>
                )}
                {complaint.status === "ACKNOWLEDGED" && (
                  <Button size="sm" variant="outline" onClick={() => transitionStatus("UNDER_INVESTIGATION")} disabled={saving}>
                    Start investigation
                  </Button>
                )}
                {complaint.status === "UNDER_INVESTIGATION" && (
                  <Button size="sm" variant="outline" onClick={() => transitionStatus("RESPONDED")} disabled={saving}>
                    <Send className="h-4 w-4 mr-1" /> Mark responded
                  </Button>
                )}
                {complaint.status === "RESPONDED" && (
                  <Button size="sm" variant="outline" onClick={() => transitionStatus("RESOLVED")} disabled={saving}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark resolved
                  </Button>
                )}
                {complaint.status === "RESOLVED" && (
                  <Button size="sm" onClick={() => transitionStatus("CLOSED")} disabled={saving}>
                    <Lock className="h-4 w-4 mr-1" /> Close
                  </Button>
                )}
              </div>
            )}
          </div>

          {ackInfo && (
            <div className={cn(
              "mt-3 flex items-center gap-2 text-xs rounded px-3 py-2 border",
              ackInfo.tone === "overdue" ? "bg-red-50 border-red-200 text-red-800"
                : ackInfo.tone === "due" ? "bg-amber-50 border-amber-200 text-amber-800"
                                          : "bg-blue-50 border-blue-200 text-blue-800",
            )}>
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{ackInfo.label}</span>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-4">
            <Card title="The complaint">
              <Field icon={Calendar} label="Received">
                {format(parseISO(complaint.received_at), "EEE d MMM yyyy, HH:mm")}
                {" · "}{METHOD_LABEL[complaint.received_via] ?? complaint.received_via}
                {complaint.received_by && members[complaint.received_by]?.full_name && (
                  <> · by {members[complaint.received_by].full_name}</>
                )}
              </Field>
              {patientName && (
                <Field icon={User} label="Patient">
                  {complaint.patient_id ? (
                    <button
                      onClick={() => navigate(`/patients/${complaint.patient_id}`)}
                      className="hover:underline text-primary"
                    >
                      {patientName}
                    </button>
                  ) : patientName}
                </Field>
              )}
              <div className="mt-3">
                <Label className="text-xs text-muted-foreground">Full detail</Label>
                <p className="text-sm whitespace-pre-wrap mt-1">{complaint.detail}</p>
              </div>
              {(complaint.staff_named ?? []).length > 0 && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">Staff named</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(complaint.staff_named ?? []).map((sid) => (
                      <span key={sid} className="text-xs bg-muted px-2 py-0.5 rounded">
                        {members[sid]?.full_name ?? "Unknown"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card title="Investigation">
              {canEdit ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Investigation lead</Label>
                    <Select
                      value={draftInvestigationLead || "__none__"}
                      onValueChange={(v) => setDraftInvestigationLead(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {allStaff.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Unnamed"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Investigation notes</Label>
                    <Textarea rows={5} value={draftInvestigationNotes} onChange={(e) => setDraftInvestigationNotes(e.target.value)} placeholder="Findings, who was interviewed, records reviewed..." />
                  </div>
                </div>
              ) : (
                <ReadOnlySection rows={[
                  ["Lead", complaint.investigation_lead ? members[complaint.investigation_lead]?.full_name ?? "—" : "Unassigned"],
                  ["Notes", complaint.investigation_notes ?? "—"],
                ]} />
              )}
            </Card>

            <Card title="Response">
              {canEdit ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Response sent to complainant</Label>
                    <Textarea rows={5} value={draftResponseSummary} onChange={(e) => setDraftResponseSummary(e.target.value)} placeholder="Summary of the written response the practice sent — should match what the complainant received." />
                  </div>
                  <div className="space-y-1">
                    <Label>Resolution / outcome</Label>
                    <Textarea rows={3} value={draftResolutionSummary} onChange={(e) => setDraftResolutionSummary(e.target.value)} placeholder="What was agreed or done. Any goodwill / apologies given." />
                  </div>
                </div>
              ) : (
                <ReadOnlySection rows={[
                  ["Response", complaint.response_summary ?? "—"],
                  ["Resolution", complaint.resolution_summary ?? "—"],
                ]} />
              )}
            </Card>

            <Card title="Ombudsman escalation">
              {canEdit ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Escalated to the Ombudsman?</Label>
                      <p className="text-xs text-muted-foreground">PHSO (private) or Parliamentary &amp; Health Service Ombudsman.</p>
                    </div>
                    <Switch checked={draftEscalated} onCheckedChange={setDraftEscalated} />
                  </div>
                  {draftEscalated && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Ombudsman reference</Label>
                        <Input value={draftOmbudsmanRef} onChange={(e) => setDraftOmbudsmanRef(e.target.value)} placeholder="Case number provided by the Ombudsman" />
                      </div>
                      <div className="space-y-1">
                        <Label>Outcome</Label>
                        <Textarea rows={3} value={draftOmbudsmanOutcome} onChange={(e) => setDraftOmbudsmanOutcome(e.target.value)} placeholder="Ombudsman's findings and any required actions" />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <ReadOnlySection rows={[
                  ["Escalated", complaint.escalated_to_ombudsman ? "Yes" : "No"],
                  ...(complaint.escalated_to_ombudsman
                    ? ([
                        ["Reference", complaint.ombudsman_reference ?? "—"],
                        ["Outcome", complaint.ombudsman_outcome ?? "—"],
                      ] as Array<[string, string]>)
                    : []),
                ]} />
              )}
            </Card>

            {canEdit && (
              <div className="flex justify-end">
                <Button onClick={saveDrafts} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Card title="Contact">
              {complaint.complainant_email && (
                <Field icon={Mail} label="Email">
                  <a href={`mailto:${complaint.complainant_email}`} className="hover:underline text-primary">
                    {complaint.complainant_email}
                  </a>
                </Field>
              )}
              {complaint.complainant_phone && (
                <Field icon={Phone} label="Phone">
                  <a href={`tel:${complaint.complainant_phone}`} className="hover:underline text-primary">
                    {complaint.complainant_phone}
                  </a>
                </Field>
              )}
              {!complaint.complainant_email && !complaint.complainant_phone && (
                <p className="text-xs text-muted-foreground">No contact details captured.</p>
              )}
            </Card>

            <Card title="Lifecycle">
              <MetaRow label="Received" value={format(parseISO(complaint.received_at), "d MMM yyyy, HH:mm")} />
              {complaint.acknowledged_at && (
                <MetaRow label="Acknowledged"
                  value={`${format(parseISO(complaint.acknowledged_at), "d MMM yyyy")}${
                    complaint.acknowledged_by && members[complaint.acknowledged_by]?.full_name
                      ? ` · ${members[complaint.acknowledged_by].full_name}` : ""
                  }`} />
              )}
              {complaint.responded_at && (
                <MetaRow label="Responded" value={format(parseISO(complaint.responded_at), "d MMM yyyy")} />
              )}
              {complaint.resolved_at && (
                <MetaRow label="Resolved" value={format(parseISO(complaint.resolved_at), "d MMM yyyy")} />
              )}
            </Card>

            <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-semibold">CQC complaint timeline</p>
                <p>Acknowledge within <strong>3 working days</strong>. Full written response within <strong>28 days</strong> (or explain why if longer is needed).</p>
              </div>
            </div>

            {!canEdit && (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Only practice admins can update complaints.
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

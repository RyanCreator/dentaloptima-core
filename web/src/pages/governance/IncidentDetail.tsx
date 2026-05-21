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
  ArrowLeft, MapPin, Calendar, User, ShieldAlert, CheckCircle2, XCircle, Lock,
} from "lucide-react";
import { GovernanceStatusPill } from "@/components/governance/GovernanceStatusPill";
import { GlossaryTerm } from "@/components/GlossaryTerm";

interface Incident {
  id: string;
  practice_id: string;
  patient_id: string | null;
  reported_by: string;
  incident_type: string;
  severity: string;
  status: string;
  occurred_at: string;
  reported_at: string;
  location: string | null;
  summary: string;
  description: string;
  staff_involved: string[] | null;
  witnesses: string | null;
  investigation_lead: string | null;
  investigation_notes: string | null;
  root_cause: string | null;
  immediate_action_taken: string | null;
  preventive_action: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  closed_at: string | null;
  reported_to_external_body: boolean;
  external_body_name: string | null;
  external_reference: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberLite { id: string; full_name: string | null; role: string }

const TYPE_LABEL: Record<string, string> = {
  CLINICAL: "Clinical", NEAR_MISS: "Near miss", EQUIPMENT_FAILURE: "Equipment failure",
  NEEDLESTICK: "Needlestick", INFECTION_CONTROL: "Infection control",
  MEDICATION_ERROR: "Medication error", PATIENT_FALL: "Patient fall",
  DATA_BREACH: "Data breach", STAFF_INJURY: "Staff injury", OTHER: "Other",
};

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [members, setMembers] = useState<Record<string, MemberLite>>({});
  const [patientName, setPatientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable copies for the investigation/action/external sections. We
  // keep these separate from `incident` so the user can edit without
  // dirtying the read-only snapshot — and so the "Save" button has clear
  // before/after state to send.
  const [draftInvestigationLead, setDraftInvestigationLead] = useState<string>("");
  const [draftInvestigationNotes, setDraftInvestigationNotes] = useState<string>("");
  const [draftRootCause, setDraftRootCause] = useState<string>("");
  const [draftPreventiveAction, setDraftPreventiveAction] = useState<string>("");
  const [draftImmediateAction, setDraftImmediateAction] = useState<string>("");
  const [draftReportedExternal, setDraftReportedExternal] = useState(false);
  const [draftExternalBody, setDraftExternalBody] = useState<string>("");
  const [draftExternalRef, setDraftExternalRef] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    void load(id);
  }, [id]);

  const load = async (incidentId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("incident_report")
      .select("*")
      .eq("id", incidentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) logger.error("incident load failed", error);
    if (!data) { setLoading(false); return; }

    const inc = data as Incident;
    setIncident(inc);

    // Hydrate drafts.
    setDraftInvestigationLead(inc.investigation_lead ?? "");
    setDraftInvestigationNotes(inc.investigation_notes ?? "");
    setDraftRootCause(inc.root_cause ?? "");
    setDraftPreventiveAction(inc.preventive_action ?? "");
    setDraftImmediateAction(inc.immediate_action_taken ?? "");
    setDraftReportedExternal(inc.reported_to_external_body);
    setDraftExternalBody(inc.external_body_name ?? "");
    setDraftExternalRef(inc.external_reference ?? "");

    // Collect member ids to resolve names in one query.
    const memberIds = new Set<string>();
    memberIds.add(inc.reported_by);
    if (inc.investigation_lead) memberIds.add(inc.investigation_lead);
    if (inc.resolved_by) memberIds.add(inc.resolved_by);
    (inc.staff_involved ?? []).forEach((m) => memberIds.add(m));

    if (memberIds.size > 0) {
      const { data: m } = await supabase
        .from("practice_member")
        .select("id, full_name, role")
        .in("id", Array.from(memberIds));
      const map: Record<string, MemberLite> = {};
      (m ?? []).forEach((row) => { map[row.id] = row as MemberLite; });
      setMembers(map);
    }

    if (inc.patient_id) {
      const { data: p } = await supabase
        .from("patient")
        .select("full_name")
        .eq("id", inc.patient_id)
        .maybeSingle();
      setPatientName(p?.full_name ?? null);
    }

    setLoading(false);
  };

  // Caller can edit if they reported it or they're an admin (matches RLS).
  const canEdit = useMemo(() => {
    if (!auth.member || !incident) return false;
    if (auth.member.role === "OWNER" || auth.member.role === "ADMIN") return true;
    return incident.reported_by === auth.member.id;
  }, [auth.member, incident]);

  const allStaff = useMemo(() => Object.values(members), [members]);

  if (loading) {
    return (
      <Layout title="Incident" onBack={() => navigate("/governance?tab=incidents")}>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!incident) {
    return (
      <Layout title="Incident" onBack={() => navigate("/governance?tab=incidents")}>
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Incident not found</p>
          <p className="text-sm mt-1">It may have been deleted or you don't have permission to view it.</p>
        </div>
      </Layout>
    );
  }

  const transitionStatus = async (next: string) => {
    if (!incident) return;
    setSaving(true);
    const patch: Partial<Incident> = { status: next };
    if (next === "RESOLVED" && !incident.resolved_at) {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = auth.member?.id ?? null;
    }
    if (next === "CLOSED" && !incident.closed_at) {
      patch.closed_at = new Date().toISOString();
      if (!incident.resolved_at) {
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = auth.member?.id ?? null;
      }
    }
    const { error } = await supabase
      .from("incident_report")
      .update(patch)
      .eq("id", incident.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't update status");
      logger.error("incident status update failed", error);
      return;
    }
    toast.success(`Status set to ${next.replace(/_/g, " ").toLowerCase()}`);
    await load(incident.id);
  };

  const saveDrafts = async () => {
    if (!incident) return;
    setSaving(true);
    const patch = {
      investigation_lead: draftInvestigationLead || null,
      investigation_notes: draftInvestigationNotes.trim() || null,
      root_cause: draftRootCause.trim() || null,
      preventive_action: draftPreventiveAction.trim() || null,
      immediate_action_taken: draftImmediateAction.trim() || null,
      reported_to_external_body: draftReportedExternal,
      external_body_name: draftReportedExternal ? (draftExternalBody.trim() || null) : null,
      external_reference: draftReportedExternal ? (draftExternalRef.trim() || null) : null,
    };
    const { error } = await supabase
      .from("incident_report")
      .update(patch)
      .eq("id", incident.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save");
      logger.error("incident save failed", error);
      return;
    }
    toast.success("Saved");
    await load(incident.id);
  };

  const reportedBy = members[incident.reported_by];

  return (
    <Layout
      title="Incident"
      onBack={() => navigate("/governance?tab=incidents")}
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {TYPE_LABEL[incident.incident_type] ?? incident.incident_type}
              </p>
              <h2 className="text-xl font-semibold mt-1">{incident.summary}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <GovernanceStatusPill kind="incident" value={incident.status} />
                <GovernanceStatusPill kind="severity" value={incident.severity} />
              </div>
            </div>
            {canEdit && incident.status !== "CLOSED" && (
              <div className="flex items-center gap-2 flex-wrap">
                {incident.status === "REPORTED" && (
                  <Button size="sm" variant="outline" onClick={() => transitionStatus("UNDER_INVESTIGATION")} disabled={saving}>
                    Start investigation
                  </Button>
                )}
                {(incident.status === "UNDER_INVESTIGATION" || incident.status === "ACTION_REQUIRED") && (
                  <Button size="sm" variant="outline" onClick={() => transitionStatus("RESOLVED")} disabled={saving}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark resolved
                  </Button>
                )}
                {incident.status === "RESOLVED" && (
                  <Button size="sm" onClick={() => transitionStatus("CLOSED")} disabled={saving}>
                    <Lock className="h-4 w-4 mr-1" /> Close
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left column — facts */}
          <div className="lg:col-span-2 space-y-4">
            <Card title="What happened">
              <Field icon={Calendar} label="Occurred">
                {format(parseISO(incident.occurred_at), "EEE d MMM yyyy, HH:mm")}
              </Field>
              {incident.location && (
                <Field icon={MapPin} label="Location">{incident.location}</Field>
              )}
              {patientName && (
                <Field icon={User} label="Patient">
                  {incident.patient_id ? (
                    <button
                      onClick={() => navigate(`/patients/${incident.patient_id}`)}
                      className="hover:underline text-primary"
                    >
                      {patientName}
                    </button>
                  ) : patientName}
                </Field>
              )}
              <div className="mt-3">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm whitespace-pre-wrap mt-1">{incident.description}</p>
              </div>
              {incident.witnesses && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">Witnesses</Label>
                  <p className="text-sm mt-1">{incident.witnesses}</p>
                </div>
              )}
              {(incident.staff_involved ?? []).length > 0 && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">Staff involved</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(incident.staff_involved ?? []).map((sid) => (
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
                    <Textarea rows={5} value={draftInvestigationNotes} onChange={(e) => setDraftInvestigationNotes(e.target.value)} placeholder="Findings, interviews, what was reviewed..." />
                  </div>
                  <div className="space-y-1">
                    <Label>Root cause</Label>
                    <Textarea rows={3} value={draftRootCause} onChange={(e) => setDraftRootCause(e.target.value)} placeholder="The underlying cause — not the symptom" />
                  </div>
                </div>
              ) : (
                <ReadOnlySection
                  rows={[
                    ["Investigation lead", incident.investigation_lead ? members[incident.investigation_lead]?.full_name ?? "—" : "Unassigned"],
                    ["Notes", incident.investigation_notes ?? "—"],
                    ["Root cause", incident.root_cause ?? "—"],
                  ]}
                />
              )}
            </Card>

            <Card title="Response &amp; prevention">
              {canEdit ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Immediate action taken</Label>
                    <Textarea rows={3} value={draftImmediateAction} onChange={(e) => setDraftImmediateAction(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Preventive action</Label>
                    <Textarea rows={3} value={draftPreventiveAction} onChange={(e) => setDraftPreventiveAction(e.target.value)} placeholder="Process changes, training, equipment fixes to stop recurrence" />
                  </div>
                </div>
              ) : (
                <ReadOnlySection
                  rows={[
                    ["Immediate action", incident.immediate_action_taken ?? "—"],
                    ["Preventive action", incident.preventive_action ?? "—"],
                  ]}
                />
              )}
            </Card>

            <Card title="External reporting">
              {canEdit ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Reported to external body?</Label>
                      <p className="text-xs text-muted-foreground">RIDDOR, NRLS, ICO, NHS England, etc.</p>
                    </div>
                    <Switch checked={draftReportedExternal} onCheckedChange={setDraftReportedExternal} />
                  </div>
                  {draftReportedExternal && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Body name</Label>
                        <Input value={draftExternalBody} onChange={(e) => setDraftExternalBody(e.target.value)} placeholder="ICO, HSE, NRLS..." />
                      </div>
                      <div className="space-y-1">
                        <Label>Reference number</Label>
                        <Input value={draftExternalRef} onChange={(e) => setDraftExternalRef(e.target.value)} placeholder="Their reference, if given" />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <ReadOnlySection
                  rows={[
                    ["Reported externally", incident.reported_to_external_body ? "Yes" : "No"],
                    ...(incident.reported_to_external_body
                      ? ([
                          ["Body", incident.external_body_name ?? "—"],
                          ["Reference", incident.external_reference ?? "—"],
                        ] as Array<[string, string]>)
                      : []),
                  ]}
                />
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

          {/* Right column — meta */}
          <div className="space-y-4">
            <Card title="Lifecycle">
              <MetaRow label="Reported"
                value={`${format(parseISO(incident.reported_at), "d MMM yyyy, HH:mm")}${reportedBy?.full_name ? ` · ${reportedBy.full_name}` : ""}`} />
              {incident.resolved_at && (
                <MetaRow label="Resolved"
                  value={`${format(parseISO(incident.resolved_at), "d MMM yyyy, HH:mm")}${
                    incident.resolved_by && members[incident.resolved_by]?.full_name
                      ? ` · ${members[incident.resolved_by].full_name}` : ""
                  }`} />
              )}
              {incident.closed_at && (
                <MetaRow label="Closed"
                  value={format(parseISO(incident.closed_at), "d MMM yyyy, HH:mm")} />
              )}
            </Card>

            {(incident.severity === "SEVERE" || incident.severity === "DEATH"
              || incident.incident_type === "DATA_BREACH"
              || incident.incident_type === "STAFF_INJURY") && (
              <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">External reporting may apply</p>
                  {incident.incident_type === "DATA_BREACH" && (
                    <>
                      <p>
                        Personal-data breaches must be reported to the{" "}
                        <GlossaryTerm term="ICO" /> within 72 hours of awareness.
                      </p>
                      <p className="pt-1">
                        <a
                          href="https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-amber-900 underline decoration-amber-700/40 hover:decoration-amber-900 font-medium"
                        >
                          Report to ICO now →
                        </a>
                      </p>
                    </>
                  )}
                  {incident.incident_type === "STAFF_INJURY" && (
                    <>
                      <p>
                        Reportable to HSE under <GlossaryTerm term="RIDDOR" /> if
                        it caused over-7-day absence or a specified injury.
                      </p>
                      <p className="pt-1">
                        <a
                          href="https://www.hse.gov.uk/riddor/report.htm"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-amber-900 underline decoration-amber-700/40 hover:decoration-amber-900 font-medium"
                        >
                          Report to HSE / RIDDOR →
                        </a>
                      </p>
                    </>
                  )}
                  {(incident.severity === "SEVERE" || incident.severity === "DEATH") && (
                    <p>
                      Consider <GlossaryTerm term="NRLS" /> / NHS England
                      notification for serious clinical incidents.
                    </p>
                  )}
                </div>
              </div>
            )}

            {!canEdit && (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Only the reporter or a practice admin can update this incident.
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

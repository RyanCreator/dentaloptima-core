import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Calendar, CheckCircle2, Circle, AlertTriangle, FileBadge, History, ExternalLink,
  FileText, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Policy {
  id: string;
  practice_id: string;
  category: string;
  title: string;
  version: string;
  content: string;
  effective_from: string;
  next_review_date: string | null;
  is_active: boolean;
  superseded_by: string | null;
  document_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PolicyDocument {
  id: string;
  title: string;
  mime_type: string;
  file_size_bytes: number;
  storage_bucket: string;
  storage_path: string;
}

interface AckRow {
  id: string;
  staff_id: string;
  acknowledged_at: string;
  notes: string | null;
}

interface MemberLite { id: string; full_name: string | null; role: string; is_active: boolean }

const CATEGORY_LABEL: Record<string, string> = {
  INFECTION_CONTROL: "Infection control",
  SAFEGUARDING: "Safeguarding",
  COMPLAINTS: "Complaints",
  INFORMATION_GOVERNANCE: "Information governance",
  EQUALITY_DIVERSITY: "Equality & diversity",
  HEALTH_SAFETY: "Health & safety",
  CLINICAL_GOVERNANCE: "Clinical governance",
  WHISTLEBLOWING: "Whistleblowing",
  CONSENT: "Consent",
  BUSINESS_CONTINUITY: "Business continuity",
  OTHER: "Other",
};

export default function PolicyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyDocument, setPolicyDocument] = useState<PolicyDocument | null>(null);
  const [acks, setAcks] = useState<AckRow[]>([]);
  const [staff, setStaff] = useState<MemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const isAdmin = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";
  const today = startOfDay(new Date());

  useEffect(() => {
    if (!id) return;
    void load(id);
  }, [id]);

  const load = async (policyId: string) => {
    setLoading(true);
    const [pRes, ackRes, staffRes] = await Promise.all([
      supabase.from("policy").select("*").eq("id", policyId).is("deleted_at", null).maybeSingle(),
      supabase.from("policy_acknowledgement").select("*").eq("policy_id", policyId),
      supabase.from("practice_member").select("id, full_name, role, is_active").eq("is_active", true).order("full_name"),
    ]);

    if (pRes.error) logger.error("policy load failed", pRes.error);
    if (ackRes.error) logger.error("ack load failed", ackRes.error);
    if (staffRes.error) logger.error("staff load failed", staffRes.error);

    const loaded = (pRes.data as Policy) ?? null;
    setPolicy(loaded);
    setAcks((ackRes.data as AckRow[]) ?? []);
    setStaff((staffRes.data as MemberLite[]) ?? []);

    // If the policy has a PDF attached, fetch its document metadata so we
    // can render a download button. Stored as a separate query because
    // policy.select("*") doesn't auto-join — and the PDF is optional, so
    // a missing row shouldn't fail the whole page.
    if (loaded?.document_id) {
      const { data: docRow, error: docErr } = await supabase
        .from("document")
        .select("id, title, mime_type, file_size_bytes, storage_bucket, storage_path")
        .eq("id", loaded.document_id)
        .maybeSingle();
      if (docErr) logger.error("policy document load failed", docErr);
      setPolicyDocument((docRow as PolicyDocument) ?? null);
    } else {
      setPolicyDocument(null);
    }

    setLoading(false);
  };

  // Signed URL on demand — keeps the bucket private but gives the staff
  // member a short-lived link they can open/download.
  const openPdf = async () => {
    if (!policyDocument) return;
    setDownloadingPdf(true);
    const { data, error } = await supabase.storage
      .from(policyDocument.storage_bucket)
      .createSignedUrl(policyDocument.storage_path, 60 * 5); // 5 minutes
    setDownloadingPdf(false);
    if (error || !data) {
      toast.error("Couldn't open the PDF — try again");
      logger.error("policy pdf signed url failed", error);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const myAck = useMemo(() => {
    if (!auth.member) return null;
    return acks.find((a) => a.staff_id === auth.member!.id) ?? null;
  }, [acks, auth.member]);

  const acknowledge = async () => {
    if (!policy || !auth.member) return;
    setAcking(true);
    const { error } = await supabase
      .from("policy_acknowledgement")
      .insert({
        practice_id: auth.member.practice_id,
        policy_id: policy.id,
        staff_id: auth.member.id,
      });
    setAcking(false);
    if (error) {
      toast.error("Couldn't record acknowledgement");
      logger.error("policy ack failed", error);
      return;
    }
    toast.success("Policy acknowledged");
    await load(policy.id);
  };

  if (loading) {
    return (
      <Layout title="Policy" onBack={() => navigate("/governance?tab=policies")}>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!policy) {
    return (
      <Layout title="Policy" onBack={() => navigate("/governance?tab=policies")}>
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Policy not found</p>
        </div>
      </Layout>
    );
  }

  const reviewDue = policy.next_review_date
    ? isBefore(parseISO(policy.next_review_date), today)
    : false;

  // Build the staff sign-off ledger. Each member either has an ack row
  // (with timestamp) or hasn't acked yet — admins see both states.
  const ledger = staff.map((s) => {
    const ack = acks.find((a) => a.staff_id === s.id);
    return { staff: s, ack };
  });
  const ackedCount = ledger.filter((l) => l.ack).length;

  return (
    <Layout title="Policy" onBack={() => navigate("/governance?tab=policies")}>
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {CATEGORY_LABEL[policy.category] ?? policy.category}
              </p>
              <h2 className="text-xl font-semibold mt-1">{policy.title}</h2>
              <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <FileBadge className="h-3 w-3" /> Version {policy.version}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Effective {format(parseISO(policy.effective_from), "d MMM yyyy")}
                </span>
                {policy.next_review_date && (
                  <span className={cn(
                    "inline-flex items-center gap-1",
                    reviewDue && "text-amber-700 font-medium",
                  )}>
                    <History className="h-3 w-3" /> Review by {format(parseISO(policy.next_review_date), "d MMM yyyy")}
                  </span>
                )}
                {policyDocument && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" /> PDF attached
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {policyDocument && (
                <Button
                  variant="outline"
                  onClick={openPdf}
                  disabled={downloadingPdf}
                  title="Open the attached PDF"
                >
                  <Download className="h-4 w-4 mr-1" />
                  {downloadingPdf ? "Opening…" : "Open PDF"}
                </Button>
              )}
              {!myAck && (
                <Button onClick={acknowledge} disabled={acking}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {acking ? "Saving…" : "I've read and understood"}
                </Button>
              )}
              {myAck && (
                <span className="inline-flex items-center gap-1 text-sm text-green-700 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Acknowledged {format(parseISO(myAck.acknowledged_at), "d MMM yyyy")}
                </span>
              )}
            </div>
          </div>

          {reviewDue && isAdmin && (
            <div className="mt-3 flex items-start gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900">
                Review date has passed. Update this policy or extend the review date.
              </p>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Content (the policy text itself) */}
          <div className="lg:col-span-2 rounded-lg border bg-card p-6">
            <PolicyContent body={policy.content} />
          </div>

          {/* Sign-off ledger */}
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Sign-off ledger</h3>
                <span className="text-xs text-muted-foreground">
                  {ackedCount} of {staff.length}
                </span>
              </div>

              {staff.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active staff.</p>
              ) : isAdmin ? (
                <div className="space-y-1 max-h-[420px] overflow-y-auto">
                  {ledger.map(({ staff: s, ack }) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted/30"
                    >
                      {ack ? (
                        <CheckCircle2 className="h-4 w-4 text-green-700 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{s.full_name ?? "Unnamed"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {ack
                            ? `Signed ${format(parseISO(ack.acknowledged_at), "d MMM yyyy")}`
                            : s.role}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Practice admins can see the full ledger of who has acknowledged this policy.
                </p>
              )}
            </div>

            {isAdmin && (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Editing a policy means publishing a new version. Bump the
                  version number — the old one stays as a historical record
                  of what was current when CQC inspects.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// Very-light "markdown-ish" renderer. We don't want a full markdown library
// for this. Just: `##` headings become bold lines, blank lines become
// paragraph breaks, everything else stays as plain text.
function PolicyContent({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/);
  return (
    <div className="prose prose-sm max-w-none space-y-4">
      {blocks.map((b, i) => {
        const trimmed = b.trim();
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="font-semibold text-base mt-4 first:mt-0">
              {trimmed.replace(/^##\s+/, "")}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={i} className="font-bold text-lg mt-4 first:mt-0">
              {trimmed.replace(/^#\s+/, "")}
            </h2>
          );
        }
        return (
          <p key={i} className="text-sm whitespace-pre-wrap leading-relaxed">{trimmed}</p>
        );
      })}
    </div>
  );
}

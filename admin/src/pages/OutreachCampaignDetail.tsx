import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { fetchCampaign, type OutreachCampaign } from "@/hooks/useOutreachCampaigns";
import { useCampaignSends, type CampaignSend } from "@/hooks/useCampaignSends";

const SENDS_PAGE_SIZE = 50;

const SEND_STATUS_TONE: Record<string, string> = {
  QUEUED:      "bg-slate-100 text-slate-700 border-slate-200",
  SENDING:     "bg-sky-100 text-sky-700 border-sky-200",
  SENT:        "bg-blue-100 text-blue-700 border-blue-200",
  DELIVERED:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  BOUNCED:     "bg-amber-100 text-amber-700 border-amber-200",
  COMPLAINED:  "bg-red-100 text-red-700 border-red-200",
  FAILED:      "bg-red-100 text-red-700 border-red-200",
  SKIPPED:     "bg-slate-100 text-slate-500 border-slate-200",
};

export default function OutreachCampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const { sends, loading: sendsLoading } = useCampaignSends(id ?? null);
  const [previewSend, setPreviewSend] = useState<CampaignSend | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!id) return;
    fetchCampaign(id).then((c) => {
      setCampaign(c);
      setCampaignLoading(false);
    });
  }, [id]);

  // Slice the sends list — campaigns can have thousands of recipients, and
  // rendering that many rows tanks first paint and scroll perf.
  const pageCount = Math.max(1, Math.ceil(sends.length / SENDS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedSends = useMemo(
    () => sends.slice(safePage * SENDS_PAGE_SIZE, (safePage + 1) * SENDS_PAGE_SIZE),
    [sends, safePage]
  );

  if (campaignLoading) {
    return (
      <Layout title="Campaign" description="">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </Layout>
    );
  }
  if (!campaign) {
    return (
      <Layout title="Campaign not found" description="">
        <p className="text-sm text-muted-foreground">This campaign doesn't exist or was deleted.</p>
        <Link to="/outreach/campaigns" className="text-sm underline mt-2 inline-block">Back to campaigns</Link>
      </Layout>
    );
  }

  return (
    <Layout
      title={campaign.name}
      description={`From ${campaign.from_address} · ${campaign.template?.name ?? "(no template)"} · ${campaign.status.toLowerCase()}`}
      actions={
        <Link to="/outreach/campaigns">
          <Button variant="outline" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
        </Link>
      }
    >
      {/* Stat tiles with rate percentages. Rates are computed against the
          most meaningful denominator for each: delivery vs sent, opens vs
          delivered (opens without delivery don't happen), etc. */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        <StatTile label="Total" value={campaign.total_count} />
        <StatTile label="Sent" value={campaign.sent_count} rate={pct(campaign.sent_count, campaign.total_count)} />
        <StatTile label="Delivered" value={campaign.delivered_count} tone="emerald" rate={pct(campaign.delivered_count, campaign.sent_count)} />
        <StatTile label="Opened" value={campaign.opened_count} tone="blue" rate={pct(campaign.opened_count, campaign.delivered_count)} />
        <StatTile label="Clicked" value={campaign.clicked_count} tone="indigo" rate={pct(campaign.clicked_count, campaign.delivered_count)} />
        <StatTile label="Bounced" value={campaign.bounced_count} tone="amber" rate={pct(campaign.bounced_count, campaign.sent_count)} />
        <StatTile
          label="Failed"
          value={campaign.failed_count + campaign.complained_count + campaign.skipped_count}
          tone="red"
          rate={pct(campaign.failed_count + campaign.complained_count + campaign.skipped_count, campaign.total_count)}
        />
      </div>

      {sendsLoading ? (
        <p className="text-sm text-muted-foreground">Loading recipients...</p>
      ) : sends.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipients on this campaign.</p>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Recipient</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Sent</th>
                <th className="text-left px-4 py-2.5 font-medium">Opens</th>
                <th className="text-left px-4 py-2.5 font-medium">Clicks</th>
                <th className="text-left px-4 py-2.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {pagedSends.map((s) => (
                <SendRow key={s.id} send={s} onPreview={() => setPreviewSend(s)} />
              ))}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-xs">
              <span className="text-muted-foreground">
                {safePage * SENDS_PAGE_SIZE + 1}–{Math.min((safePage + 1) * SENDS_PAGE_SIZE, sends.length)} of {sends.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 text-muted-foreground">
                  Page {safePage + 1} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {previewSend && (
        <PreviewSheet send={previewSend} onClose={() => setPreviewSend(null)} />
      )}
    </Layout>
  );
}

function pct(part: number, whole: number): string | null {
  if (!whole) return null;
  const n = (part / whole) * 100;
  // One decimal below 10%, whole number above — keeps things compact.
  return n < 10 ? `${n.toFixed(1)}%` : `${Math.round(n)}%`;
}

function StatTile({
  label,
  value,
  tone,
  rate,
}: {
  label: string;
  value: number;
  tone?: string;
  rate?: string | null;
}) {
  const toneClass = tone === "emerald" ? "text-emerald-700"
    : tone === "blue" ? "text-blue-700"
    : tone === "indigo" ? "text-indigo-700"
    : tone === "amber" ? "text-amber-700"
    : tone === "red" ? "text-red-700"
    : "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
        {rate && <p className="text-xs text-muted-foreground">{rate}</p>}
      </div>
    </div>
  );
}

function SendRow({ send, onPreview }: { send: CampaignSend; onPreview: () => void }) {
  const fullName = [send.contact?.first_name, send.contact?.last_name].filter(Boolean).join(" ");
  // Contact may have been archived after the campaign sent to them, or
  // hard-deleted entirely (shouldn't happen — we soft-delete — but defensive).
  const isArchived = !!send.contact?.archived_at;
  const contactMissing = !send.contact;
  return (
    <tr className="border-t hover:bg-accent/30 transition-colors">
      <td className="px-4 py-2.5">
        <div className={`text-sm ${isArchived || contactMissing ? "text-muted-foreground" : ""}`}>
          {contactMissing ? (
            <span className="italic">(contact deleted)</span>
          ) : (
            <>
              {fullName || send.contact?.email}
              {send.contact?.practice_name && (
                <span className="text-muted-foreground text-xs ml-1">· {send.contact.practice_name}</span>
              )}
              {isArchived && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide bg-muted text-muted-foreground border">
                  archived
                </span>
              )}
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {send.contact?.email ?? "—"}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${SEND_STATUS_TONE[send.status]}`}>
          {send.status.toLowerCase()}
        </span>
        {send.failure_reason && (
          <p className="text-[11px] text-red-600 mt-0.5 truncate max-w-[280px]" title={send.failure_reason}>
            {send.failure_reason}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {send.sent_at ? format(new Date(send.sent_at), "d MMM HH:mm") : "—"}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {send.open_count > 0 ? (
          <span className="font-semibold">
            {send.open_count}
            {send.last_opened_at && (
              <span className="text-muted-foreground font-normal ml-1">
                · {format(new Date(send.last_opened_at), "d MMM HH:mm")}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {send.click_count > 0 ? (
          <span className="font-semibold">{send.click_count}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <button
          onClick={onPreview}
          disabled={!send.rendered_subject}
          className="text-xs underline text-foreground/70 hover:text-foreground disabled:opacity-30 disabled:no-underline"
        >
          View email
        </button>
      </td>
    </tr>
  );
}

function PreviewSheet({ send, onClose }: { send: CampaignSend; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{send.rendered_subject}</SheetTitle>
          <SheetDescription className="text-left">
            Sent to {send.contact?.email}
            {send.sent_at && ` · ${format(new Date(send.sent_at), "d MMM yyyy HH:mm")}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1">
          <div className="rounded-lg border bg-background p-4 text-sm">
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {send.rendered_body_text || "(no body)"}
            </p>
          </div>

          {/* Tracking detail block */}
          <div className="mt-4 rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <p><span className="text-muted-foreground">Status:</span> {send.status}</p>
            {send.delivered_at && <p><span className="text-muted-foreground">Delivered:</span> {format(new Date(send.delivered_at), "d MMM yyyy HH:mm")}</p>}
            {send.first_opened_at && <p><span className="text-muted-foreground">First opened:</span> {format(new Date(send.first_opened_at), "d MMM yyyy HH:mm")}</p>}
            {send.last_opened_at && send.last_opened_at !== send.first_opened_at && <p><span className="text-muted-foreground">Last opened:</span> {format(new Date(send.last_opened_at), "d MMM yyyy HH:mm")} ({send.open_count} opens total)</p>}
            {send.first_clicked_at && <p><span className="text-muted-foreground">First clicked:</span> {format(new Date(send.first_clicked_at), "d MMM yyyy HH:mm")} ({send.click_count} clicks)</p>}
            {send.bounced_at && <p className="text-amber-700"><span className="text-muted-foreground">Bounced:</span> {format(new Date(send.bounced_at), "d MMM yyyy HH:mm")}</p>}
            {send.complained_at && <p className="text-red-700"><span className="text-muted-foreground">Spam complaint:</span> {format(new Date(send.complained_at), "d MMM yyyy HH:mm")}</p>}
            {send.failure_reason && <p className="text-red-700"><span className="text-muted-foreground">Failure:</span> {send.failure_reason}</p>}
            {send.postmark_message_id && (
              <p className="font-mono text-[10px] text-muted-foreground mt-2 break-all">
                Postmark MessageID: {send.postmark_message_id}
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
